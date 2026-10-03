import type { Card } from './cards';
import type { ShoeConfig } from './rules';
import { nextFloat, nextInt, type RngState } from './rng';

export interface ShoeState {
  decks: number;
  /** Current card order; cards[pos] is the next card out. */
  cards: Card[];
  pos: number;
  /** Shuffle is due once pos reaches this index. */
  cutIndex: number;
  /** Cards from finished rounds, in the order they were played. */
  discards: Card[];
  /** Cards dealt this round (moved to discards when the round ends). */
  inPlay: Card[];
  shuffleCount: number;
  /** Set when a reshuffle happened mid-round because the shoe ran dry. */
  emergencyShuffled: boolean;
}

export function createShoe(decks: number, cfg: ShoeConfig, rng: RngState): ShoeState {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) cards.push(c);
  const shoe: ShoeState = {
    decks,
    cards,
    pos: 0,
    cutIndex: 0,
    discards: [],
    inPlay: [],
    shuffleCount: 0,
    emergencyShuffled: false,
  };
  fisherYates(shoe.cards, rng);
  finishShuffle(shoe, cfg);
  shoe.shuffleCount = 0;
  return shoe;
}

export const totalCards = (s: ShoeState) => s.decks * 52;
/** Cards not yet seen by the table (undealt, excluding burned cards already in discards). */
export const cardsRemaining = (s: ShoeState) => s.cards.length - s.pos;

export function draw(s: ShoeState, rng: RngState): Card {
  if (s.pos >= s.cards.length) {
    // Shoe ran dry mid-round: shuffle the discards (cards in play stay out).
    s.cards = s.discards;
    s.discards = [];
    fisherYates(s.cards, rng);
    s.pos = 0;
    s.cutIndex = s.cards.length; // finish this round, then full shuffle
    s.emergencyShuffled = true;
    s.shuffleCount++;
  }
  const c = s.cards[s.pos++];
  s.inPlay.push(c);
  return c;
}

export const needsShuffle = (s: ShoeState, cfg: ShoeConfig) =>
  cfg.method === 'csm' || s.pos >= s.cutIndex;

/**
 * Called between rounds. Returns true if the counters should reset
 * (a full reshuffle happened). CSM rounds also return true: every round
 * starts from a freshly randomized machine.
 */
export function endRound(s: ShoeState, cfg: ShoeConfig, rng: RngState): boolean {
  for (const c of s.inPlay) s.discards.push(c);
  s.inPlay = [];
  const wasEmergency = s.emergencyShuffled;
  s.emergencyShuffled = false;

  if (cfg.method === 'csm') {
    // Discards go straight back into the machine.
    const rest = s.cards.slice(s.pos);
    for (const c of s.discards) rest.push(c);
    s.discards = [];
    fisherYates(rest, rng);
    s.cards = rest;
    s.pos = 0;
    s.cutIndex = rest.length;
    s.shuffleCount++;
    return true;
  }
  if (s.pos >= s.cutIndex || wasEmergency) {
    shuffleShoe(s, cfg, rng);
    return true;
  }
  return false;
}

export function shuffleShoe(s: ShoeState, cfg: ShoeConfig, rng: RngState) {
  // Physical order of the cards when the dealer picks them up: discard rack
  // (in play order) on top of whatever was left behind the cut card.
  const stack = s.discards.concat(s.cards.slice(s.pos), s.inPlay.splice(0));
  s.discards = [];
  if (cfg.method === 'hand') s.cards = handShuffle(stack, cfg.riffles, rng);
  else {
    fisherYates(stack, rng);
    s.cards = stack;
  }
  finishShuffle(s, cfg);
}

function finishShuffle(s: ShoeState, cfg: ShoeConfig) {
  s.pos = 0;
  s.shuffleCount++;
  const n = s.cards.length;
  const pen = cfg.method === 'csm' ? 1 : Math.min(0.98, Math.max(0.2, cfg.penetration));
  s.cutIndex = Math.floor(n * pen);
  // Burn cards are dealt straight to the discard rack, unseen.
  for (let i = 0; i < cfg.burnCards && s.pos < n; i++) s.discards.push(s.cards[s.pos++]);
}

export function fisherYates(a: Card[], rng: RngState) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}

/**
 * Casino-style hand shuffle: split the stack in two, take ~half-deck grabs
 * from each side, riffle each pair `riffles` times (Gilbert–Shannon–Reeds
 * model), restack, then cut. With few riffles, clumps of the previous shoe
 * survive — the basis of shuffle tracking.
 */
export function handShuffle(stack: Card[], riffles: number, rng: RngState): Card[] {
  const n = stack.length;
  const half = Math.round(n / 2 + (nextFloat(rng) - 0.5) * 8);
  const left = stack.slice(0, half);
  const right = stack.slice(half);
  const out: Card[] = [];
  let li = 0;
  let ri = 0;
  while (li < left.length || ri < right.length) {
    const ga = 22 + nextInt(rng, 9);
    const gb = 22 + nextInt(rng, 9);
    const a = left.slice(li, li + ga);
    const b = right.slice(ri, ri + gb);
    li += ga;
    ri += gb;
    let pile = interleave(a, b, rng);
    for (let k = 1; k < riffles; k++) pile = riffle(pile, rng);
    for (const c of pile) out.push(c);
  }
  // Final cut somewhere in the middle 60%.
  const cut = Math.floor(n * (0.2 + nextFloat(rng) * 0.6));
  return out.slice(cut).concat(out.slice(0, cut));
}

function interleave(a: Card[], b: Card[], rng: RngState): Card[] {
  const out: Card[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const ra = a.length - i;
    const rb = b.length - j;
    if (nextFloat(rng) * (ra + rb) < ra) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

function riffle(pile: Card[], rng: RngState): Card[] {
  // Binomial cut
  let cut = 0;
  for (let i = 0; i < pile.length; i++) if (nextFloat(rng) < 0.5) cut++;
  return interleave(pile.slice(0, cut), pile.slice(cut), rng);
}
