import { cardLabel, cardValue, handTotal, isBlackjack, rankOf, type Card } from './cards';
import {
  bettingCount,
  getSystem,
  hiloTrueCount,
  newCounter,
  observe,
  resetCounter,
  type CounterState,
} from './counting';
import { unitsForCount, type SeatConfig } from './players';
import type { Rules, ShoeConfig, TableConfig } from './rules';
import { seedRng, type RngState } from './rng';
import { cardsRemaining, createShoe, draw, endRound, type ShoeState } from './shoe';
import { bucketIndex, newStats, recordHistory, type SeatStats } from './stats';
import {
  ACTION_NAMES,
  basicStrategy,
  buildTables,
  canDoubleTotal,
  countedStrategy,
  mimicDealer,
  neverBust,
  type Action,
  type DecisionContext,
  type StrategyTables,
} from './strategy';

export interface GameConfig {
  rules: Rules;
  shoe: ShoeConfig;
  table: TableConfig;
  seats: SeatConfig[];
  seed: number;
  /** What the human's decisions are graded against. */
  feedback: 'basic' | 'counted';
}

export type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' | 'bust';

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  done: boolean;
  surrendered: boolean;
  result: HandResult | null;
  net: number;
}

export interface Seat {
  config: SeatConfig;
  bankroll: number;
  counter: CounterState | null;
  hands: Hand[];
  active: boolean;
  insurance: number;
  insuranceDecided: boolean;
  /** Human bet queued for the next round (null = not yet placed). */
  pendingBet: number | null;
  lastBet: number;
  roundNet: number;
  /** Reference count bucket at bet time, for EV-by-count analytics. */
  countBucket: number;
  stats: SeatStats;
}

export type Phase = 'betting' | 'dealing' | 'insurance' | 'playing' | 'dealer' | 'settle' | 'done';

export type GameEvent =
  | { kind: 'shuffle'; round: number }
  | { kind: 'info'; round: number; text: string }
  | { kind: 'result'; round: number; seat: number; text: string; net: number }
  | { kind: 'mistake'; round: number; seat: number; text: string }
  | { kind: 'deviation'; round: number; seat: number; text: string };

export type PendingInput = 'bet' | 'insurance' | 'action' | null;

export interface GameState {
  config: GameConfig;
  tables: StrategyTables;
  rng: RngState;
  shoe: ShoeState;
  seats: Seat[];
  dealer: { cards: Card[]; holeHidden: boolean };
  phantom: Card[];
  phase: Phase;
  dealQueue: number[];
  turn: { seat: number; hand: number };
  /** Completed table rounds. */
  round: number;
  /** Reference Hi-Lo running count of all exposed cards (HUD + analytics). */
  hiloRc: number;
  /** null disables the event log (fast simulation). */
  events: GameEvent[] | null;
  /** While set, the human seat is played automatically (skip-ahead). */
  autoplayHuman: 'basic' | 'sitout' | null;
  /** Last grading of the human's decision, for UI feedback. */
  lastFeedback: { ok: boolean; text: string } | null;
}

const PHANTOM = -2;
const DEALER = -1;
const MAX_EVENTS = 300;

export function createGame(config: GameConfig): GameState {
  const rng = seedRng(config.seed);
  const shoe = createShoe(config.rules.decks, config.shoe, rng);
  const seats: Seat[] = config.seats.map((sc) => ({
    config: sc,
    bankroll: sc.bankroll,
    counter:
      sc.kind === 'bot' && sc.bot.strategy === 'counter' ? newCounter(sc.bot.system, config.rules.decks) : null,
    hands: [],
    active: false,
    insurance: 0,
    insuranceDecided: false,
    pendingBet: null,
    lastBet: config.table.minBet,
    roundNet: 0,
    countBucket: 0,
    stats: newStats(sc.bankroll),
  }));
  return {
    config,
    tables: buildTables(config.rules),
    rng,
    shoe,
    seats,
    dealer: { cards: [], holeHidden: false },
    phantom: [],
    phase: 'betting',
    dealQueue: [],
    turn: { seat: 0, hand: 0 },
    round: 0,
    hiloRc: 0,
    events: [],
    autoplayHuman: null,
    lastFeedback: null,
  };
}

// ---------------------------------------------------------------------------
// Queries

export const humanSeatIndex = (g: GameState) => g.seats.findIndex((s) => s.config.kind === 'human');

export function referenceTrueCount(g: GameState) {
  return hiloTrueCount(g.hiloRc, cardsRemaining(g.shoe));
}

export function pendingInput(g: GameState): PendingInput {
  if (g.autoplayHuman) return null;
  const hi = humanSeatIndex(g);
  if (hi < 0) return null;
  const human = g.seats[hi];
  switch (g.phase) {
    case 'betting':
      return human.pendingBet === null && human.bankroll >= g.config.table.minBet ? 'bet' : null;
    case 'insurance':
      return human.active && !human.insuranceDecided ? 'insurance' : null;
    case 'playing': {
      if (g.turn.seat !== hi) return null;
      const h = human.hands[g.turn.hand];
      return h && needsDecision(g, h) ? 'action' : null;
    }
    default:
      return null;
  }
}

function needsDecision(g: GameState, h: Hand) {
  if (h.done || h.cards.length < 2) return false;
  if (h.splitAces && !g.config.rules.hitSplitAces && !canSplitHand(g, g.seats[g.turn.seat], h)) return false;
  return handTotal(h.cards).total < 21;
}

function canSplitHand(g: GameState, seat: Seat, h: Hand): boolean {
  const r = g.config.rules;
  if (h.cards.length !== 2 || cardValue(h.cards[0]) !== cardValue(h.cards[1])) return false;
  if (seat.hands.length >= r.maxSplitHands) return false;
  if (h.splitAces && !r.resplitAces) return false;
  return seat.bankroll >= h.bet;
}

export function legalActions(g: GameState, seatIdx: number, handIdx: number): Action[] {
  const seat = g.seats[seatIdx];
  const h = seat.hands[handIdx];
  const r = g.config.rules;
  if (!h || h.done) return [];
  const out: Action[] = [];
  const lockedAces = h.splitAces && !r.hitSplitAces;
  if (!lockedAces) out.push('H');
  out.push('S');
  if (
    !lockedAces &&
    h.cards.length === 2 &&
    (!h.fromSplit || r.doubleAfterSplit) &&
    canDoubleTotal(r, h.cards) &&
    seat.bankroll >= h.bet
  )
    out.push('D');
  if (canSplitHand(g, seat, h)) out.push('P');
  if (r.surrender === 'late' && seat.hands.length === 1 && h.cards.length === 2 && !h.fromSplit) out.push('R');
  return out;
}

function decisionContext(g: GameState, seatIdx: number, handIdx: number): DecisionContext {
  const legal = legalActions(g, seatIdx, handIdx);
  return {
    cards: g.seats[seatIdx].hands[handIdx].cards,
    dealerUp: g.dealer.cards[0],
    canDouble: legal.includes('D'),
    canSplit: legal.includes('P'),
    canSurrender: legal.includes('R'),
    rules: g.config.rules,
    tables: g.tables,
  };
}

/** The reference "correct" play for the current hand, used for hints/grading. */
export function recommendedAction(g: GameState, seatIdx: number, handIdx: number) {
  const ctx = decisionContext(g, seatIdx, handIdx);
  if (g.config.feedback === 'counted') return countedStrategy(ctx, referenceTrueCount(g));
  return { action: basicStrategy(ctx), deviation: undefined as string | undefined };
}

// ---------------------------------------------------------------------------
// Human input

export function placeHumanBet(g: GameState, amount: number) {
  const hi = humanSeatIndex(g);
  if (hi < 0 || g.phase !== 'betting') return;
  const t = g.config.table;
  const seat = g.seats[hi];
  if (amount <= 0) seat.pendingBet = 0;
  else seat.pendingBet = Math.min(Math.max(amount, t.minBet), t.maxBet, seat.bankroll);
}

export function decideHumanInsurance(g: GameState, take: boolean) {
  const hi = humanSeatIndex(g);
  if (hi < 0 || g.phase !== 'insurance') return;
  const seat = g.seats[hi];
  if (take) takeInsurance(seat);
  seat.insuranceDecided = true;
}

export function humanAction(g: GameState, action: Action) {
  if (pendingInput(g) !== 'action') return;
  const { seat, hand } = g.turn;
  if (!legalActions(g, seat, hand).includes(action)) return;
  const rec = recommendedAction(g, seat, hand);
  const s = g.seats[seat].stats;
  s.decisions++;
  const ok = rec.action === action;
  if (!ok) {
    s.mistakes++;
    const why = rec.deviation ? ` (index play: ${rec.deviation})` : '';
    const text = `${describeHand(g.seats[seat].hands[hand].cards)} vs ${cardLabel(g.dealer.cards[0])}: you chose ${ACTION_NAMES[action]}, correct is ${ACTION_NAMES[rec.action]}${why}`;
    g.lastFeedback = { ok: false, text };
    log(g, { kind: 'mistake', round: g.round, seat, text });
  } else {
    g.lastFeedback = { ok: true, text: rec.deviation ? `Correct — index play ${rec.deviation}` : 'Correct' };
  }
  applyAction(g, seat, hand, action);
}

export function rebuy(g: GameState, amount: number) {
  const hi = humanSeatIndex(g);
  if (hi < 0) return;
  g.seats[hi].bankroll += amount;
  g.seats[hi].stats.rebuys += amount;
}

// ---------------------------------------------------------------------------
// The state machine. Each call does one atomic thing (one card, one decision)
// so the UI can animate at any speed; fast simulation just loops it.

export function step(g: GameState): void {
  switch (g.phase) {
    case 'betting':
      return placeBets(g);
    case 'dealing':
      return dealNext(g);
    case 'insurance':
      for (const s of g.seats) if (s.active && !s.insuranceDecided) botInsurance(g, s);
      if (g.seats.every((s) => !s.active || s.insuranceDecided)) afterInsurance(g);
      return;
    case 'playing':
      return playStep(g);
    case 'dealer':
      return dealerStep(g);
    case 'settle':
      return settle(g);
    case 'done':
      return cleanup(g);
  }
}

function log(g: GameState, e: GameEvent) {
  if (!g.events) return;
  g.events.push(e);
  if (g.events.length > MAX_EVENTS) g.events.splice(0, g.events.length - MAX_EVENTS);
}

function expose(g: GameState, c: Card) {
  const r = rankOf(c);
  if (r >= 1 && r <= 5) g.hiloRc++;
  else if (r === 0 || r >= 9) g.hiloRc--;
  for (const s of g.seats) if (s.counter) observe(s.counter, c);
}

function drawCard(g: GameState, visible: boolean): Card {
  const c = draw(g.shoe, g.rng);
  if (g.shoe.emergencyShuffled && g.shoe.pos === 1) {
    // Mid-round reshuffle: counts restart from the fresh stack.
    g.hiloRc = 0;
    for (const s of g.seats) if (s.counter) resetCounter(s.counter, g.config.rules.decks);
    log(g, { kind: 'shuffle', round: g.round });
  }
  if (visible) expose(g, c);
  return c;
}

function botBet(g: GameState, seat: Seat): number {
  const bot = seat.config.bot;
  const t = g.config.table;
  if (bot.strategy !== 'counter' || !seat.counter) return bot.unit;
  const count = bettingCount(seat.counter, cardsRemaining(g.shoe), bot.deckEstimation);
  if (bot.wongOutBelow !== null && count < bot.wongOutBelow) return 0;
  return Math.min(t.maxBet, unitsForCount(bot.ramp, count) * bot.unit);
}

function placeBets(g: GameState) {
  const t = g.config.table;
  const tc = referenceTrueCount(g);
  for (const seat of g.seats) {
    seat.hands = [];
    seat.active = false;
    seat.insurance = 0;
    seat.insuranceDecided = false;
    seat.roundNet = 0;
    if (seat.config.kind === 'empty') continue;
    let bet = 0;
    if (seat.config.kind === 'human') {
      if (g.autoplayHuman === 'basic') bet = seat.lastBet;
      else if (g.autoplayHuman === 'sitout') bet = 0;
      else bet = seat.pendingBet ?? 0;
      seat.pendingBet = null;
    } else {
      bet = botBet(g, seat);
    }
    if (bet > 0) bet = Math.max(bet, t.minBet);
    if (bet > seat.bankroll) bet = seat.bankroll >= t.minBet ? Math.floor(seat.bankroll) : 0;
    if (bet <= 0) {
      if (seat.bankroll < t.minBet && seat.stats.ruinedAtRound === null) seat.stats.ruinedAtRound = g.round;
      seat.stats.roundsSatOut++;
      continue;
    }
    seat.active = true;
    seat.lastBet = bet;
    seat.bankroll -= bet;
    seat.hands.push(newHand(bet));
    const st = seat.stats;
    st.rounds++;
    st.wagered += bet;
    st.totalAction += bet;
    seat.countBucket = bucketIndex(tc);
    st.byCount[seat.countBucket].rounds++;
    st.byCount[seat.countBucket].wagered += bet;
  }
  const active = g.seats.map((s, i) => (s.active ? i : -99)).filter((i) => i >= 0);
  // Nobody betting (everyone wonged out): deal a phantom hand so the shoe
  // still advances, as it would with other players at the table.
  const players = active.length ? active : [PHANTOM];
  const q: number[] = [...players, DEALER, ...players];
  if (g.config.rules.dealerPeek) q.push(DEALER);
  g.dealQueue = q;
  g.dealer = { cards: [], holeHidden: false };
  g.phantom = [];
  g.phase = 'dealing';
}

function newHand(bet: number, fromSplit = false): Hand {
  return {
    cards: [],
    bet,
    doubled: false,
    fromSplit,
    splitAces: false,
    done: false,
    surrendered: false,
    result: null,
    net: 0,
  };
}

function dealNext(g: GameState) {
  const who = g.dealQueue.shift()!;
  if (who === DEALER) {
    const hole = g.dealer.cards.length === 1 && g.config.rules.dealerPeek;
    g.dealer.cards.push(drawCard(g, !hole));
    if (hole) g.dealer.holeHidden = true;
  } else if (who === PHANTOM) {
    g.phantom.push(drawCard(g, true));
  } else {
    g.seats[who].hands[0].cards.push(drawCard(g, true));
  }
  if (g.dealQueue.length) return;

  const up = g.dealer.cards[0];
  const anyActive = g.seats.some((s) => s.active);
  if (cardValue(up) === 1 && g.config.rules.insurance && g.config.rules.dealerPeek && anyActive) {
    g.phase = 'insurance';
  } else {
    afterInsurance(g);
  }
}

function takeInsurance(seat: Seat) {
  const amt = seat.hands[0].bet / 2;
  if (seat.bankroll < amt) return;
  seat.bankroll -= amt;
  seat.insurance = amt;
  seat.stats.insuranceTaken++;
  seat.stats.totalAction += amt;
}

function botInsurance(g: GameState, seat: Seat) {
  seat.insuranceDecided = true;
  if (seat.config.kind === 'human') return; // autoplay: basic strategy never insures
  const bot = seat.config.bot;
  if (bot.strategy !== 'counter' || !bot.insurance || !seat.counter) return;
  const count = bettingCount(seat.counter, cardsRemaining(g.shoe), bot.deckEstimation);
  if (count >= getSystem(bot.system).insuranceAt) takeInsurance(seat);
}

function afterInsurance(g: GameState) {
  const r = g.config.rules;
  if (r.dealerPeek && isBlackjack(g.dealer.cards)) {
    revealHole(g);
    log(g, { kind: 'info', round: g.round, text: 'Dealer has blackjack' });
    g.phase = 'settle';
    return;
  }
  for (const s of g.seats) {
    if (!s.active) continue;
    const h = s.hands[0];
    if (isBlackjack(h.cards)) h.done = true;
  }
  g.turn = { seat: -1, hand: 0 };
  advanceTurn(g);
}

/** Move to the next hand needing play, or to the dealer. */
function advanceTurn(g: GameState) {
  let { seat, hand } = g.turn;
  if (seat >= 0) hand++;
  else {
    seat = 0;
    hand = 0;
  }
  while (seat < g.seats.length) {
    const s = g.seats[seat];
    if (s.active) {
      while (hand < s.hands.length) {
        if (!s.hands[hand].done) {
          g.turn = { seat, hand };
          g.phase = 'playing';
          return;
        }
        hand++;
      }
    }
    seat++;
    hand = 0;
  }
  g.turn = { seat: -1, hand: 0 };
  g.phase = 'dealer';
}

function playStep(g: GameState) {
  const { seat: si, hand: hi } = g.turn;
  const seat = g.seats[si];
  const h = seat.hands[hi];
  if (h.cards.length < 2) {
    h.cards.push(drawCard(g, true));
    return;
  }
  if (!needsDecision(g, h)) {
    h.done = true;
    advanceTurn(g);
    return;
  }
  if (seat.config.kind === 'human') {
    if (!g.autoplayHuman) return; // waiting on the UI
    applyAction(g, si, hi, basicStrategy(decisionContext(g, si, hi)));
    return;
  }
  applyAction(g, si, hi, botDecision(g, si, hi));
}

function botDecision(g: GameState, si: number, hi: number): Action {
  const seat = g.seats[si];
  const bot = seat.config.bot;
  const ctx = decisionContext(g, si, hi);
  const legal = legalActions(g, si, hi);
  const pick = (a: Action) => (legal.includes(a) ? a : 'S');
  switch (bot.strategy) {
    case 'mimic':
      return pick(mimicDealer(ctx.cards));
    case 'neverBust':
      return pick(neverBust(ctx.cards));
    case 'basic':
      return basicStrategy(ctx);
    case 'counter': {
      const sys = getSystem(bot.system);
      if (!bot.deviations || !sys.balanced || !seat.counter) return basicStrategy(ctx);
      const count = bettingCount(seat.counter, cardsRemaining(g.shoe), bot.deckEstimation);
      const d = countedStrategy(ctx, count / sys.indexScale);
      if (d.deviation) {
        seat.stats.deviations++;
        log(g, { kind: 'deviation', round: g.round, seat: si, text: `${seat.config.name}: ${d.deviation} → ${ACTION_NAMES[d.action]}` });
      }
      return d.action;
    }
  }
}

function applyAction(g: GameState, si: number, hi: number, action: Action) {
  const seat = g.seats[si];
  const h = seat.hands[hi];
  const st = seat.stats;
  switch (action) {
    case 'H':
      h.cards.push(drawCard(g, true));
      if (handTotal(h.cards).total >= 21) {
        h.done = true;
        advanceTurn(g);
      }
      return;
    case 'S':
      h.done = true;
      advanceTurn(g);
      return;
    case 'D':
      seat.bankroll -= h.bet;
      st.totalAction += h.bet;
      st.doubles++;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(drawCard(g, true));
      h.done = true;
      advanceTurn(g);
      return;
    case 'P': {
      seat.bankroll -= h.bet;
      st.totalAction += h.bet;
      st.splits++;
      const aces = cardValue(h.cards[0]) === 1;
      const second = newHand(h.bet, true);
      second.cards.push(h.cards.pop()!);
      h.fromSplit = true;
      h.splitAces = second.splitAces = aces;
      seat.hands.splice(hi + 1, 0, second);
      // Next playStep deals the second card to this hand.
      return;
    }
    case 'R':
      h.surrendered = true;
      h.done = true;
      advanceTurn(g);
      return;
  }
}

function revealHole(g: GameState) {
  if (!g.dealer.holeHidden) return;
  g.dealer.holeHidden = false;
  expose(g, g.dealer.cards[1]);
}

function dealerStep(g: GameState) {
  const r = g.config.rules;
  const live = g.seats.some((s) => s.active && s.hands.some((h) => !h.surrendered && handTotal(h.cards).total <= 21 && !(isBlackjack(h.cards) && !h.fromSplit)));
  const phantomRound = !g.seats.some((s) => s.active);
  if (g.dealer.holeHidden) {
    revealHole(g);
    return;
  }
  if (g.dealer.cards.length < 2 && (live || phantomRound || g.seats.some((s) => s.active && isBlackjack(s.hands[0]?.cards ?? [])))) {
    g.dealer.cards.push(drawCard(g, true)); // no-hole-card game
    return;
  }
  if (live || phantomRound) {
    const { total, soft } = handTotal(g.dealer.cards);
    if (total < 17 || (total === 17 && soft && r.dealerHitsSoft17)) {
      g.dealer.cards.push(drawCard(g, true));
      return;
    }
  }
  g.phase = 'settle';
}

function settle(g: GameState) {
  const r = g.config.rules;
  const dealerBJ = isBlackjack(g.dealer.cards);
  const dt = handTotal(g.dealer.cards).total;
  for (let si = 0; si < g.seats.length; si++) {
    const seat = g.seats[si];
    if (!seat.active) continue;
    const st = seat.stats;
    let roundNet = 0;
    if (seat.insurance > 0) {
      const insNet = dealerBJ ? seat.insurance * 2 : -seat.insurance;
      seat.bankroll += dealerBJ ? seat.insurance * 3 : 0;
      st.insuranceNet += insNet;
      roundNet += insNet;
    }
    for (const h of seat.hands) {
      st.hands++;
      const pt = handTotal(h.cards).total;
      const natural = isBlackjack(h.cards) && !h.fromSplit;
      let result: HandResult;
      let net: number;
      if (h.surrendered) {
        result = 'surrender';
        net = -h.bet / 2;
        st.surrenders++;
      } else if (dealerBJ) {
        // Peek games never reach doubles/splits here; ENHC loses everything.
        if (natural) {
          result = 'push';
          net = 0;
        } else {
          result = 'lose';
          net = -h.bet;
        }
      } else if (natural) {
        result = 'blackjack';
        net = h.bet * r.blackjackPayout;
        st.blackjacks++;
      } else if (pt > 21) {
        result = 'bust';
        net = -h.bet;
        st.busts++;
      } else if (dt > 21 || pt > dt) {
        result = 'win';
        net = h.bet;
      } else if (pt < dt) {
        result = 'lose';
        net = -h.bet;
      } else {
        result = 'push';
        net = 0;
      }
      if (net > 0) st.wins++;
      else if (net < 0) st.losses++;
      else st.pushes++;
      h.result = result;
      h.net = net;
      h.done = true;
      seat.bankroll += h.bet + net;
      roundNet += net;
    }
    seat.roundNet = roundNet;
    st.net += roundNet;
    st.byCount[seat.countBucket].net += roundNet;
    st.sumSqRoundNet += roundNet * roundNet;
    if (g.events) {
      log(g, { kind: 'result', round: g.round, seat: si, net: roundNet, text: `${seat.config.name}: ${seat.hands.map((h) => h.result).join(', ')}` });
    }
  }
  g.phase = 'done';
}

function cleanup(g: GameState) {
  for (const seat of g.seats) {
    if (seat.config.kind === 'empty') continue;
    recordHistory(seat.stats, seat.bankroll);
  }
  g.round++;
  // Reveal anything still face down before the cards are picked up.
  revealHole(g);
  const reshuffled = endRound(g.shoe, g.config.shoe, g.rng);
  if (reshuffled) {
    g.hiloRc = 0;
    for (const s of g.seats) if (s.counter) resetCounter(s.counter, g.config.rules.decks);
    if (g.config.shoe.method !== 'csm') log(g, { kind: 'shuffle', round: g.round });
  }
  for (const s of g.seats) {
    s.hands = [];
    s.active = false;
  }
  g.dealer = { cards: [], holeHidden: false };
  g.phantom = [];
  g.phase = 'betting';
}

export function describeHand(cards: readonly Card[]): string {
  const { total, soft } = handTotal(cards);
  if (cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1])) {
    const v = cardValue(cards[0]);
    return `Pair of ${v === 1 ? 'A' : v}s`;
  }
  return `${soft ? 'Soft' : 'Hard'} ${total}`;
}
