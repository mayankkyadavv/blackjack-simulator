import { cardValue, handTotal, upcardIndex, type Card } from './cards';
import type { Rules } from './rules';

export type Action = 'H' | 'S' | 'D' | 'P' | 'R';

export const ACTION_NAMES: Record<Action, string> = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double',
  P: 'Split',
  R: 'Surrender',
};

/**
 * Table codes: H hit, S stand, D double/else hit, Ds double/else stand,
 * P split, Ph split if DAS, Rh/Rs/Rp surrender/else hit|stand|split.
 */
type Code = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'Ph' | 'Rh' | 'Rs' | 'Rp';

// Columns: dealer 2 3 4 5 6 7 8 9 10 A. Base chart: 4–8 decks, S17, DAS, LS.
const row = (s: string) => s.trim().split(/\s+/) as Code[];
const ALL = (c: Code) => row(Array(10).fill(c).join(' '));

const HARD_BASE: Record<number, Code[]> = {
  8: ALL('H'),
  9: row('H D D D D H H H H H'),
  10: row('D D D D D D D D H H'),
  11: row('D D D D D D D D D H'),
  12: row('H H S S S H H H H H'),
  13: row('S S S S S H H H H H'),
  14: row('S S S S S H H H H H'),
  15: row('S S S S S H H H Rh H'),
  16: row('S S S S S H H Rh Rh Rh'),
  17: ALL('S'),
};
const SOFT_BASE: Record<number, Code[]> = {
  13: row('H H H D D H H H H H'),
  14: row('H H H D D H H H H H'),
  15: row('H H D D D H H H H H'),
  16: row('H H D D D H H H H H'),
  17: row('H D D D D H H H H H'),
  18: row('S Ds Ds Ds Ds S S H H H'),
  19: ALL('S'),
};
// Keyed by single-card value (11 = ace).
const PAIR_BASE: Record<number, Code[]> = {
  2: row('Ph Ph P P P P H H H H'),
  3: row('Ph Ph P P P P H H H H'),
  4: row('H H H Ph Ph H H H H H'),
  6: row('Ph P P P P H H H H H'),
  7: row('P P P P P P H H H H'),
  8: ALL('P'),
  9: row('P P P P P S P P S S'),
  10: ALL('S'),
  11: ALL('P'),
};

export interface StrategyTables {
  hard: Record<number, Code[]>;
  soft: Record<number, Code[]>;
  pair: Record<number, Code[]>;
}

const col = (up: number) => (up === 11 ? 9 : up - 2);

/** Build the basic-strategy chart for a given rule set. */
export function buildTables(r: Rules): StrategyTables {
  const clone = (t: Record<number, Code[]>) =>
    Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v]])) as Record<number, Code[]>;
  const hard = clone(HARD_BASE);
  const soft = clone(SOFT_BASE);
  const pair = clone(PAIR_BASE);
  const A = col(11);

  if (r.dealerHitsSoft17) {
    hard[11][A] = 'D';
    soft[18][col(2)] = 'Ds';
    soft[19][col(6)] = 'Ds';
    hard[15][A] = 'Rh';
    hard[17][A] = 'Rs';
    pair[8][A] = 'Rp';
  }
  if (r.decks <= 2) {
    hard[9][col(2)] = 'D';
    hard[11][A] = 'D';
  }
  if (r.decks === 1) {
    hard[8][col(5)] = 'D';
    hard[8][col(6)] = 'D';
    soft[17][col(2)] = 'D';
    soft[19][col(6)] = 'Ds';
    soft[13][col(4)] = 'D';
    soft[14][col(4)] = 'D';
    pair[7][col(8)] = 'Ph';
  }
  if (!r.dealerPeek) {
    // No hole card: don't put extra money out against a possible blackjack.
    hard[11][col(10)] = 'H';
    hard[11][A] = 'H';
    pair[8][col(10)] = 'H';
    pair[8][A] = 'H';
    pair[11][A] = 'H';
  }
  return { hard, soft, pair };
}

export interface DecisionContext {
  cards: readonly Card[];
  dealerUp: Card;
  canDouble: boolean;
  canSplit: boolean;
  canSurrender: boolean;
  rules: Rules;
  tables: StrategyTables;
}

export function canDoubleTotal(rules: Rules, cards: readonly Card[]): boolean {
  if (rules.doubleOn === 'any') return true;
  const { total, soft } = handTotal(cards);
  if (soft) return false;
  return rules.doubleOn === '9-11' ? total >= 9 && total <= 11 : total >= 10 && total <= 11;
}

function isPair(cards: readonly Card[]) {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
}

export function basicStrategy(ctx: DecisionContext): Action {
  return resolveCode(lookup(ctx), ctx);
}

function lookup(ctx: DecisionContext): Code {
  const up = col(upcardIndex(ctx.dealerUp));
  const { tables, cards } = ctx;
  if (ctx.canSplit && isPair(cards)) {
    const v = cardValue(cards[0]);
    const pv = v === 1 ? 11 : v;
    const p = tables.pair[pv];
    if (p) {
      const code = p[up];
      if (code === 'P' || code === 'Rp' || (code === 'Ph' && ctx.rules.doubleAfterSplit)) return code;
    }
  }
  const { total, soft } = handTotal(cards);
  if (soft) {
    if (total >= 20) return 'S';
    if (total <= 12) return 'H'; // A,A that can't be split
    return tables.soft[total][up];
  }
  if (total <= 7) return 'H';
  if (total >= 18) return 'S';
  return tables.hard[total][up];
}

function resolveCode(code: Code, ctx: DecisionContext): Action {
  const dbl = ctx.canDouble && canDoubleTotal(ctx.rules, ctx.cards);
  switch (code) {
    case 'H':
    case 'S':
      return code;
    case 'D':
      return dbl ? 'D' : 'H';
    case 'Ds':
      return dbl ? 'D' : 'S';
    case 'P':
    case 'Ph':
      return 'P';
    case 'Rh':
      return ctx.canSurrender ? 'R' : 'H';
    case 'Rs':
      return ctx.canSurrender ? 'R' : 'S';
    case 'Rp':
      return ctx.canSurrender ? 'R' : 'P';
  }
}

// ---------------------------------------------------------------------------
// Index plays: Hi-Lo Illustrious 18 + Fab 4, scaled for other balanced counts.

interface PlayIndex {
  kind: 'hard' | 'pair';
  total: number; // hard total, or pair card value
  up: number; // 2..11
  s17: number;
  h17: number;
  above: Code;
  below: Code;
  label: string;
}

const PLAY_INDICES: PlayIndex[] = [
  { kind: 'hard', total: 16, up: 10, s17: 0, h17: 0, above: 'S', below: 'H', label: '16 v 10' },
  { kind: 'hard', total: 15, up: 10, s17: 4, h17: 4, above: 'S', below: 'H', label: '15 v 10' },
  { kind: 'pair', total: 10, up: 5, s17: 5, h17: 5, above: 'P', below: 'S', label: 'T,T v 5' },
  { kind: 'pair', total: 10, up: 6, s17: 4, h17: 4, above: 'P', below: 'S', label: 'T,T v 6' },
  { kind: 'hard', total: 10, up: 10, s17: 4, h17: 4, above: 'D', below: 'H', label: '10 v 10' },
  { kind: 'hard', total: 12, up: 3, s17: 2, h17: 2, above: 'S', below: 'H', label: '12 v 3' },
  { kind: 'hard', total: 12, up: 2, s17: 3, h17: 3, above: 'S', below: 'H', label: '12 v 2' },
  { kind: 'hard', total: 11, up: 11, s17: 1, h17: -1, above: 'D', below: 'H', label: '11 v A' },
  { kind: 'hard', total: 9, up: 2, s17: 1, h17: 1, above: 'D', below: 'H', label: '9 v 2' },
  { kind: 'hard', total: 10, up: 11, s17: 4, h17: 3, above: 'D', below: 'H', label: '10 v A' },
  { kind: 'hard', total: 9, up: 7, s17: 3, h17: 3, above: 'D', below: 'H', label: '9 v 7' },
  { kind: 'hard', total: 16, up: 9, s17: 5, h17: 5, above: 'S', below: 'H', label: '16 v 9' },
  { kind: 'hard', total: 13, up: 2, s17: -1, h17: -1, above: 'S', below: 'H', label: '13 v 2' },
  { kind: 'hard', total: 12, up: 4, s17: 0, h17: 0, above: 'S', below: 'H', label: '12 v 4' },
  { kind: 'hard', total: 12, up: 5, s17: -2, h17: -2, above: 'S', below: 'H', label: '12 v 5' },
  { kind: 'hard', total: 12, up: 6, s17: -1, h17: -1, above: 'S', below: 'H', label: '12 v 6' },
  { kind: 'hard', total: 13, up: 3, s17: -2, h17: -2, above: 'S', below: 'H', label: '13 v 3' },
];

interface SurrenderIndex {
  total: number;
  up: number;
  s17: number;
  h17: number;
  label: string;
}
const SURRENDER_INDICES: SurrenderIndex[] = [
  { total: 14, up: 10, s17: 3, h17: 3, label: '14 v 10 (sur)' },
  { total: 15, up: 10, s17: 0, h17: 0, label: '15 v 10 (sur)' },
  { total: 15, up: 9, s17: 2, h17: 2, label: '15 v 9 (sur)' },
  { total: 15, up: 11, s17: 1, h17: -1, label: '15 v A (sur)' },
];

export const INDEX_PLAY_LABELS = [...PLAY_INDICES.map((p) => p.label), ...SURRENDER_INDICES.map((s) => s.label)];

export interface CountedDecision {
  action: Action;
  /** Set when an index play changed the decision from basic strategy. */
  deviation?: string;
}

/**
 * Basic strategy plus index plays. `hiloTc` is the decision maker's count in
 * Hi-Lo true-count units (already divided by the system's index scale).
 */
export function countedStrategy(ctx: DecisionContext, hiloTc: number): CountedDecision {
  const basic = basicStrategy(ctx);
  const up = upcardIndex(ctx.dealerUp);
  const { total, soft } = handTotal(ctx.cards);
  const h17 = ctx.rules.dealerHitsSoft17;
  const splittingPair = isPair(ctx.cards) && ctx.canSplit && basic === 'P';

  if (ctx.canSurrender && !soft && !isPair(ctx.cards)) {
    const si = SURRENDER_INDICES.find((s) => s.total === total && s.up === up);
    if (si) {
      const idx = h17 ? si.h17 : si.s17;
      if (hiloTc >= idx) return { action: 'R', deviation: basic === 'R' ? undefined : si.label };
      const noSur = basicStrategy({ ...ctx, canSurrender: false });
      const d = applyPlayIndex(ctx, total, up, h17, hiloTc, noSur);
      return { action: d.action, deviation: d.deviation ?? (basic === 'R' ? si.label : undefined) };
    }
  }
  if (basic === 'R') return { action: 'R' };

  if (isPair(ctx.cards) && ctx.canSplit && cardValue(ctx.cards[0]) === 10) {
    const pi = PLAY_INDICES.find((p) => p.kind === 'pair' && p.up === up);
    if (pi) {
      const idx = h17 ? pi.h17 : pi.s17;
      const action = resolveCode(hiloTc >= idx ? pi.above : pi.below, ctx);
      return { action, deviation: action !== basic ? pi.label : undefined };
    }
  }
  if (soft || splittingPair) return { action: basic };
  return applyPlayIndex(ctx, total, up, h17, hiloTc, basic);
}

function applyPlayIndex(
  ctx: DecisionContext,
  total: number,
  up: number,
  h17: boolean,
  tc: number,
  basic: Action,
): CountedDecision {
  const pi = PLAY_INDICES.find((p) => p.kind === 'hard' && p.total === total && p.up === up);
  if (!pi) return { action: basic };
  const idx = h17 ? pi.h17 : pi.s17;
  const action = resolveCode(tc >= idx ? pi.above : pi.below, ctx);
  return { action, deviation: action !== basic ? pi.label : undefined };
}

/** Dealer-mimic: hit below 17, never double/split. A classic losing baseline. */
export function mimicDealer(cards: readonly Card[]): Action {
  return handTotal(cards).total < 17 ? 'H' : 'S';
}

/** Never-bust: stand on any hard 12+. Another common tourist strategy. */
export function neverBust(cards: readonly Card[]): Action {
  const { total, soft } = handTotal(cards);
  if (soft) return total < 18 ? 'H' : 'S';
  return total < 12 ? 'H' : 'S';
}
