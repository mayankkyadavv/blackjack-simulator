export type ShuffleMethod = 'perfect' | 'hand' | 'csm';

export interface Rules {
  decks: number;
  dealerHitsSoft17: boolean;
  /** Blackjack payout multiple: 1.5 (3:2), 1.2 (6:5), 1 (even). */
  blackjackPayout: number;
  doubleAfterSplit: boolean;
  doubleOn: 'any' | '9-11' | '10-11';
  /** Max hands a player can split to (2 = one split). */
  maxSplitHands: number;
  resplitAces: boolean;
  hitSplitAces: boolean;
  surrender: 'none' | 'late';
  /** false = European no-hole-card: player loses doubles/splits to a dealer blackjack. */
  dealerPeek: boolean;
  insurance: boolean;
}

export interface ShoeConfig {
  method: ShuffleMethod;
  /** Fraction of the shoe dealt before the cut card (ignored for CSM). */
  penetration: number;
  burnCards: number;
  /** Hand shuffle only: riffles per grab pair. Fewer = clumpier (trackable) shoes. */
  riffles: number;
}

export interface TableConfig {
  minBet: number;
  maxBet: number;
  /** Used to convert per-round stats to hourly figures. */
  roundsPerHour: number;
}

export interface RulePreset {
  id: string;
  name: string;
  rules: Rules;
  shoe: ShoeConfig;
  table: TableConfig;
}

const base: Rules = {
  decks: 6,
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  doubleAfterSplit: true,
  doubleOn: 'any',
  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  surrender: 'late',
  dealerPeek: true,
  insurance: true,
};

const shoe = (penetration: number, method: ShuffleMethod = 'perfect'): ShoeConfig => ({
  method,
  penetration,
  burnCards: 1,
  riffles: 3,
});

export const PRESETS: RulePreset[] = [
  {
    id: 'strip-6d',
    name: 'Las Vegas Strip — 6D S17 DAS LS',
    rules: { ...base },
    shoe: shoe(0.75),
    table: { minBet: 25, maxBet: 5000, roundsPerHour: 100 },
  },
  {
    id: 'strip-6d-h17',
    name: 'Las Vegas Strip — 6D H17 DAS LS',
    rules: { ...base, dealerHitsSoft17: true },
    shoe: shoe(0.75),
    table: { minBet: 15, maxBet: 3000, roundsPerHour: 100 },
  },
  {
    id: 'downtown-2d',
    name: 'Downtown Vegas — 2D H17 DAS (pitch)',
    rules: { ...base, decks: 2, dealerHitsSoft17: true, surrender: 'none' },
    shoe: shoe(0.65),
    table: { minBet: 10, maxBet: 1000, roundsPerHour: 120 },
  },
  {
    id: 'sd-32',
    name: 'Single Deck 3:2 — H17, double 10-11',
    rules: {
      ...base,
      decks: 1,
      dealerHitsSoft17: true,
      doubleAfterSplit: false,
      doubleOn: '10-11',
      surrender: 'none',
    },
    shoe: shoe(0.6),
    table: { minBet: 25, maxBet: 500, roundsPerHour: 150 },
  },
  {
    id: 'sd-65',
    name: 'Single Deck 6:5 — tourist trap',
    rules: { ...base, decks: 1, dealerHitsSoft17: true, blackjackPayout: 1.2, surrender: 'none' },
    shoe: shoe(0.6),
    table: { minBet: 10, maxBet: 500, roundsPerHour: 150 },
  },
  {
    id: 'ac-8d',
    name: 'Atlantic City — 8D S17 DAS LS',
    rules: { ...base, decks: 8, maxSplitHands: 4 },
    shoe: shoe(0.75),
    table: { minBet: 15, maxBet: 5000, roundsPerHour: 100 },
  },
  {
    id: 'euro-enhc',
    name: 'European — 6D S17 no hole card',
    rules: { ...base, dealerPeek: false, surrender: 'none', maxSplitHands: 3 },
    shoe: shoe(0.7),
    table: { minBet: 10, maxBet: 2000, roundsPerHour: 90 },
  },
  {
    id: 'csm',
    name: 'Continuous Shuffle Machine — 6D H17',
    rules: { ...base, dealerHitsSoft17: true },
    shoe: shoe(1, 'csm'),
    table: { minBet: 15, maxBet: 3000, roundsPerHour: 110 },
  },
];

export function describeRules(r: Rules): string {
  const parts = [
    `${r.decks}D`,
    r.dealerHitsSoft17 ? 'H17' : 'S17',
    r.blackjackPayout === 1.5 ? '3:2' : r.blackjackPayout === 1.2 ? '6:5' : '1:1',
    r.doubleAfterSplit ? 'DAS' : 'NDAS',
    r.doubleOn === 'any' ? 'DOA' : `D${r.doubleOn}`,
    r.surrender === 'late' ? 'LS' : 'NS',
    r.dealerPeek ? '' : 'ENHC',
    r.resplitAces ? 'RSA' : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
