import { isRed, rankOf, type Card } from './cards';

export type CountingSystemId =
  | 'hilo'
  | 'ko'
  | 'hiopt1'
  | 'hiopt2'
  | 'omega2'
  | 'zen'
  | 'halves'
  | 'red7';

export interface CountingSystem {
  id: CountingSystemId;
  name: string;
  /** Tag per rank index A,2,3,...,10,J,Q,K. Red 7 is handled separately. */
  tags: number[];
  balanced: boolean;
  /** Unbalanced counts start at a non-zero initial running count. */
  initialCount: (decks: number) => number;
  /** Insurance threshold in the system's own betting count. */
  insuranceAt: number;
  /** Multiplier from Hi-Lo true-count indices to this system's units. */
  indexScale: number;
  blurb: string;
}

const t = (a: number, two: number, three: number, four: number, five: number, six: number, seven: number, eight: number, nine: number, ten: number) =>
  [a, two, three, four, five, six, seven, eight, nine, ten, ten, ten, ten];

const DEFS: Omit<CountingSystem, 'insuranceAt' | 'indexScale'>[] = [
  { id: 'hilo', name: 'Hi-Lo', tags: t(-1, 1, 1, 1, 1, 1, 0, 0, 0, -1), balanced: true, initialCount: () => 0, blurb: 'Level 1, balanced. The industry standard; all index plays are native.' },
  { id: 'ko', name: 'KO (Knock-Out)', tags: t(-1, 1, 1, 1, 1, 1, 1, 0, 0, -1), balanced: false, initialCount: (d) => 4 - 4 * d, blurb: 'Level 1, unbalanced. No true-count conversion; bet off the running count (key count ≈ +4).' },
  { id: 'hiopt1', name: 'Hi-Opt I', tags: t(0, 0, 1, 1, 1, 1, 0, 0, 0, -1), balanced: true, initialCount: () => 0, blurb: 'Level 1, ace-neutral. Strong for playing decisions.' },
  { id: 'hiopt2', name: 'Hi-Opt II', tags: t(0, 1, 1, 2, 2, 1, 1, 0, 0, -2), balanced: true, initialCount: () => 0, blurb: 'Level 2, ace-neutral. More accurate, harder to keep.' },
  { id: 'omega2', name: 'Omega II', tags: t(0, 1, 1, 2, 2, 2, 1, 0, -1, -2), balanced: true, initialCount: () => 0, blurb: 'Level 2, ace-neutral. High playing efficiency.' },
  { id: 'zen', name: 'Zen Count', tags: t(-1, 1, 1, 2, 2, 2, 1, 0, 0, -2), balanced: true, initialCount: () => 0, blurb: 'Level 2, balanced. Good betting and playing balance.' },
  { id: 'halves', name: 'Wong Halves', tags: t(-1, 0.5, 1, 1, 1.5, 1, 0.5, 0, -0.5, -1), balanced: true, initialCount: () => 0, blurb: 'Level 3 (fractional). Highest betting correlation of the common counts.' },
  { id: 'red7', name: 'Red Seven', tags: t(-1, 1, 1, 1, 1, 1, 0, 0, 0, -1), balanced: false, initialCount: (d) => -2 * d, blurb: 'Hi-Lo plus red 7s; unbalanced, bet off the running count (pivot ≈ 0).' },
];

function tagOfCard(sys: { tags: number[]; id: CountingSystemId }, c: Card): number {
  if (sys.id === 'red7' && rankOf(c) === 6) return isRed(c) ? 1 : 0;
  return sys.tags[rankOf(c)];
}

/**
 * Derive insurance threshold and index scaling from the tags themselves via
 * a linear regression of ten-density on the count. Hi-Lo comes out at ~+3,
 * matching the published index.
 */
function deriveStats(tags: number[]) {
  let mean = 0;
  for (const x of tags) mean += x / 13;
  let v = 0;
  let cov = 0;
  for (let r = 0; r < 13; r++) {
    const d = tags[r] - mean;
    v += (d * d) / 13;
    cov += (d * ((r >= 9 ? 1 : 0) - 4 / 13)) / 13;
  }
  const beta = cov / v; // change in P(ten) per unit tag
  // Insurance breaks even at ten-density 1/3: shift needed = 1/3 - 4/13.
  const ins = (0.9 * (1 / 3 - 4 / 13) * 52) / -beta;
  return { sd: Math.sqrt(v), ins };
}

const HILO_SD = deriveStats(DEFS[0].tags).sd;

export const COUNTING_SYSTEMS: CountingSystem[] = DEFS.map((d) => {
  const { sd, ins } = deriveStats(d.tags);
  return {
    ...d,
    insuranceAt: d.balanced ? Math.round(ins * 2) / 2 : d.id === 'ko' ? 3 : 2,
    indexScale: sd / HILO_SD,
  };
});

export const getSystem = (id: CountingSystemId) =>
  COUNTING_SYSTEMS.find((s) => s.id === id) ?? COUNTING_SYSTEMS[0];

export type DeckEstimation = 'exact' | 'half' | 'full';

export function decksRemaining(cardsRemaining: number, est: DeckEstimation): number {
  const d = cardsRemaining / 52;
  if (est === 'exact') return Math.max(d, 0.25);
  if (est === 'half') return Math.max(0.5, Math.round(d * 2) / 2);
  return Math.max(1, Math.round(d));
}

export interface CounterState {
  system: CountingSystemId;
  rc: number;
}

export function newCounter(system: CountingSystemId, decks: number): CounterState {
  return { system, rc: getSystem(system).initialCount(decks) };
}

export function resetCounter(c: CounterState, decks: number) {
  c.rc = getSystem(c.system).initialCount(decks);
}

export function observe(c: CounterState, card: Card) {
  c.rc += tagOfCard(getSystemFast(c.system), card);
}

/** True count for balanced systems, running count for unbalanced ones. */
export function bettingCount(c: CounterState, cardsRemaining: number, est: DeckEstimation): number {
  const sys = getSystemFast(c.system);
  return sys.balanced ? c.rc / decksRemaining(cardsRemaining, est) : c.rc;
}

const BY_ID = new Map(COUNTING_SYSTEMS.map((s) => [s.id, s]));
function getSystemFast(id: CountingSystemId): CountingSystem {
  return BY_ID.get(id)!;
}

/** Hi-Lo true count with exact deck estimation — the HUD/analysis reference count. */
export function hiloTrueCount(rc: number, cardsRemaining: number) {
  return rc / Math.max(cardsRemaining / 52, 0.25);
}
