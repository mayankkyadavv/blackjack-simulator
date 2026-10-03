import type { CountingSystemId, DeckEstimation } from './counting';

export type PlayStrategy = 'basic' | 'counter' | 'mimic' | 'neverBust';

export interface RampStep {
  /** Bet this many units when the betting count is >= `count`. */
  count: number;
  units: number;
}

export interface BotConfig {
  strategy: PlayStrategy;
  system: CountingSystemId;
  deviations: boolean;
  deckEstimation: DeckEstimation;
  /** Dollar value of one betting unit. */
  unit: number;
  ramp: RampStep[];
  /** Sit out (keep counting) while the betting count is below this. null = never. */
  wongOutBelow: number | null;
  /** Insurance only for counters: take it at the system's index. */
  insurance: boolean;
}

export type SeatKind = 'empty' | 'human' | 'bot';

export interface SeatConfig {
  kind: SeatKind;
  name: string;
  bankroll: number;
  bot: BotConfig;
}

export interface RampPreset {
  id: string;
  name: string;
  ramp: RampStep[];
}

export const RAMP_PRESETS: RampPreset[] = [
  { id: 'flat', name: 'Flat (1 unit)', ramp: [{ count: -99, units: 1 }] },
  {
    id: '1-8',
    name: '1–8 conservative',
    ramp: [
      { count: -99, units: 1 },
      { count: 2, units: 2 },
      { count: 3, units: 4 },
      { count: 4, units: 6 },
      { count: 5, units: 8 },
    ],
  },
  {
    id: '1-12',
    name: '1–12 standard',
    ramp: [
      { count: -99, units: 1 },
      { count: 2, units: 2 },
      { count: 3, units: 4 },
      { count: 4, units: 8 },
      { count: 5, units: 10 },
      { count: 6, units: 12 },
    ],
  },
  {
    id: '1-20',
    name: '1–20 aggressive',
    ramp: [
      { count: -99, units: 1 },
      { count: 1, units: 2 },
      { count: 2, units: 5 },
      { count: 3, units: 10 },
      { count: 4, units: 15 },
      { count: 5, units: 20 },
    ],
  },
];

export const defaultBot = (overrides: Partial<BotConfig> = {}): BotConfig => ({
  strategy: 'counter',
  system: 'hilo',
  deviations: true,
  deckEstimation: 'half',
  unit: 25,
  ramp: RAMP_PRESETS[2].ramp.map((s) => ({ ...s })),
  wongOutBelow: null,
  insurance: true,
  ...overrides,
});

export function unitsForCount(ramp: RampStep[], count: number): number {
  let units = ramp.length ? ramp[0].units : 1;
  for (const s of ramp) if (count >= s.count) units = s.units;
  return units;
}

export const STRATEGY_NAMES: Record<PlayStrategy, string> = {
  basic: 'Basic strategy (flat bet)',
  counter: 'Card counter',
  mimic: 'Mimic the dealer',
  neverBust: 'Never bust',
};
