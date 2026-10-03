import { describe, expect, it } from 'vitest';
import { handTotal, type Card } from './cards';
import { COUNTING_SYSTEMS, getSystem } from './counting';
import { createGame, type GameConfig } from './game';
import { defaultBot, RAMP_PRESETS, type SeatConfig } from './players';
import { PRESETS } from './rules';
import { seedRng } from './rng';
import { createShoe, draw, endRound, handShuffle } from './shoe';
import { runRounds } from './simulate';
import { deriveStats } from './stats';
import { basicStrategy, buildTables, countedStrategy, type DecisionContext } from './strategy';

// rank helpers: card ints in spades
const A = 0, T = 9;
const c = (v: number): Card => (v === 11 || v === 1 ? A : v === 10 ? T : v - 1);

const strip = PRESETS[0];
const ctx = (cards: number[], up: number, over: Partial<DecisionContext> = {}): DecisionContext => ({
  cards: cards.map(c),
  dealerUp: c(up),
  canDouble: true,
  canSplit: true,
  canSurrender: true,
  rules: strip.rules,
  tables: buildTables(strip.rules),
  ...over,
});

const empty: SeatConfig = { kind: 'empty', name: '', bankroll: 0, bot: defaultBot() };

function config(seats: SeatConfig[], preset = strip, seed = 7): GameConfig {
  return {
    rules: { ...preset.rules },
    shoe: { ...preset.shoe },
    table: { ...preset.table, minBet: 10, maxBet: 100_000 },
    seats: [...seats, ...Array(7 - seats.length).fill(empty)],
    seed,
    feedback: 'basic',
  };
}

describe('cards', () => {
  it('totals soft and hard hands', () => {
    expect(handTotal([c(11), c(6)])).toEqual({ total: 17, soft: true });
    expect(handTotal([c(11), c(6), c(10)])).toEqual({ total: 17, soft: false });
    expect(handTotal([c(11), c(11), c(9)])).toEqual({ total: 21, soft: true });
  });
});

describe('basic strategy', () => {
  it('matches standard 6D S17 DAS LS chart cells', () => {
    expect(basicStrategy(ctx([10, 6], 10))).toBe('R');
    expect(basicStrategy(ctx([10, 6], 10, { canSurrender: false }))).toBe('H');
    expect(basicStrategy(ctx([10, 2], 4))).toBe('S');
    expect(basicStrategy(ctx([10, 2], 3))).toBe('H');
    expect(basicStrategy(ctx([6, 5], 11))).toBe('H');
    expect(basicStrategy(ctx([11, 7], 3))).toBe('D');
    expect(basicStrategy(ctx([11, 7], 9))).toBe('H');
    expect(basicStrategy(ctx([8, 8], 10))).toBe('P');
    expect(basicStrategy(ctx([9, 9], 7))).toBe('S');
    expect(basicStrategy(ctx([5, 5], 9))).toBe('D');
    expect(basicStrategy(ctx([11, 9], 6))).toBe('S'); // soft 20 never doubles
    expect(basicStrategy(ctx([2, 3, 2], 6))).toBe('H'); // hard 7
  });
  it('applies H17 changes', () => {
    const rules = { ...strip.rules, dealerHitsSoft17: true };
    const t = buildTables(rules);
    expect(basicStrategy(ctx([6, 5], 11, { rules, tables: t }))).toBe('D');
    expect(basicStrategy(ctx([11, 8], 6, { rules, tables: t }))).toBe('D');
    expect(basicStrategy(ctx([10, 7], 11, { rules, tables: t }))).toBe('R');
    expect(basicStrategy(ctx([10, 10], 11, { rules, tables: t }))).toBe('S'); // never surrender 20
    expect(basicStrategy(ctx([10, 8], 11, { rules, tables: t }))).toBe('S');
  });
  it('applies index plays', () => {
    expect(countedStrategy(ctx([10, 6], 10, { canSurrender: false }), 1).action).toBe('S');
    expect(countedStrategy(ctx([10, 6], 10, { canSurrender: false }), -1).action).toBe('H');
    expect(countedStrategy(ctx([10, 10], 6), 5).action).toBe('P');
    expect(countedStrategy(ctx([10, 10], 6), 2).action).toBe('S');
    expect(countedStrategy(ctx([10, 5], 10), -1).action).toBe('H');
    expect(countedStrategy(ctx([10, 4], 10), 3).action).toBe('R');
  });
});

describe('counting systems', () => {
  it('balanced systems sum to zero over a deck', () => {
    for (const s of COUNTING_SYSTEMS) {
      const sum = s.tags.reduce((a, b) => a + b, 0) * 4;
      if (s.balanced) expect(sum).toBe(0);
    }
  });
  it('Hi-Lo insurance index derives to +3', () => {
    expect(getSystem('hilo').insuranceAt).toBe(3);
  });
});

describe('shoe', () => {
  it('conserves cards across rounds and shuffles', () => {
    const rng = seedRng(1);
    const cfg = { ...strip.shoe, method: 'hand' as const };
    const shoe = createShoe(6, cfg, rng);
    for (let i = 0; i < 500; i++) {
      for (let k = 0; k < 12; k++) draw(shoe, rng);
      endRound(shoe, cfg, rng);
      const all = [...shoe.cards.slice(shoe.pos), ...shoe.discards].sort((a, b) => a - b);
      expect(all.length).toBe(312);
    }
  });
  it('hand shuffle is a permutation', () => {
    const stack = Array.from({ length: 312 }, (_, i) => i % 52);
    const out = handShuffle(stack, 2, seedRng(3));
    expect([...out].sort((a, b) => a - b)).toEqual([...stack].sort((a, b) => a - b));
  });
});

describe('simulation', () => {
  it('basic strategy edge on 6D S17 DAS LS is about -0.3%..-0.6%', () => {
    const g = createGame(config([{ kind: 'bot', name: 'BS', bankroll: 1e12, bot: defaultBot({ strategy: 'basic', unit: 10 }) }]));
    runRounds(g, 400_000);
    const edge = g.seats[0].stats.net / g.seats[0].stats.wagered;
    expect(edge).toBeGreaterThan(-0.0085);
    expect(edge).toBeLessThan(-0.0015);
  }, 60_000);

  it('a Hi-Lo counter with a 1-12 spread wins, mimic-the-dealer loses ~5%', () => {
    const g = createGame(
      config([
        { kind: 'bot', name: 'Counter', bankroll: 1e12, bot: defaultBot({ unit: 10, ramp: RAMP_PRESETS[2].ramp }) },
        { kind: 'bot', name: 'Mimic', bankroll: 1e12, bot: defaultBot({ strategy: 'mimic', unit: 10 }) },
      ]),
    );
    runRounds(g, 400_000);
    const counter = deriveStats(g.seats[0].stats, 100, 1e12);
    const mimic = g.seats[1].stats.net / g.seats[1].stats.wagered;
    expect(counter.evPerRound).toBeGreaterThan(0);
    expect(mimic).toBeLessThan(-0.03);
    expect(mimic).toBeGreaterThan(-0.08);
  }, 60_000);

  it('is deterministic for a seed', () => {
    const mk = () => createGame(config([{ kind: 'bot', name: 'B', bankroll: 1e6, bot: defaultBot() }]));
    const a = mk();
    const b = mk();
    runRounds(a, 5000);
    runRounds(b, 2000);
    runRounds(b, 3000);
    expect(a.seats[0].bankroll).toBe(b.seats[0].bankroll);
  });

  it('runs every preset including ENHC and CSM without errors', () => {
    for (const p of PRESETS) {
      const g = createGame(config([{ kind: 'bot', name: 'B', bankroll: 1e9, bot: defaultBot() }, { kind: 'human', name: 'You', bankroll: 1e9, bot: defaultBot() }], p));
      runRounds(g, 3000);
      expect(g.round).toBe(3000);
      expect(g.phase).toBe('betting');
    }
  });

  it('wonging out still advances the shoe', () => {
    const g = createGame(config([{ kind: 'bot', name: 'W', bankroll: 1e9, bot: defaultBot({ wongOutBelow: 1 }) }]));
    runRounds(g, 5000);
    expect(g.seats[0].stats.roundsSatOut).toBeGreaterThan(1000);
    expect(g.seats[0].stats.rounds).toBeGreaterThan(100);
  });
});
