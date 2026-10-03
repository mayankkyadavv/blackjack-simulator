export const COUNT_BUCKET_MIN = -10;
export const COUNT_BUCKET_MAX = 10;
const BUCKETS = COUNT_BUCKET_MAX - COUNT_BUCKET_MIN + 1;
const MAX_HISTORY = 1000;

export interface CountBucket {
  rounds: number;
  net: number;
  wagered: number;
}

export interface SeatStats {
  rounds: number;
  roundsSatOut: number;
  hands: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  busts: number;
  doubles: number;
  splits: number;
  surrenders: number;
  insuranceTaken: number;
  insuranceNet: number;
  /** Sum of initial bets — the denominator for player edge. */
  wagered: number;
  /** Everything put at risk incl. doubles, splits and insurance. */
  totalAction: number;
  net: number;
  sumSqRoundNet: number;
  peakBankroll: number;
  maxDrawdown: number;
  ruinedAtRound: number | null;
  rebuys: number;
  /** Human: decisions vs. reference strategy. Bots: index plays taken. */
  decisions: number;
  mistakes: number;
  deviations: number;
  byCount: CountBucket[];
  history: { points: number[]; every: number; tick: number };
}

export function newStats(bankroll: number): SeatStats {
  return {
    rounds: 0,
    roundsSatOut: 0,
    hands: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    busts: 0,
    doubles: 0,
    splits: 0,
    surrenders: 0,
    insuranceTaken: 0,
    insuranceNet: 0,
    wagered: 0,
    totalAction: 0,
    net: 0,
    sumSqRoundNet: 0,
    peakBankroll: bankroll,
    maxDrawdown: 0,
    ruinedAtRound: null,
    rebuys: 0,
    decisions: 0,
    mistakes: 0,
    deviations: 0,
    byCount: Array.from({ length: BUCKETS }, () => ({ rounds: 0, net: 0, wagered: 0 })),
    history: { points: [bankroll], every: 1, tick: 0 },
  };
}

export function bucketIndex(tc: number): number {
  const b = Math.min(COUNT_BUCKET_MAX, Math.max(COUNT_BUCKET_MIN, Math.floor(tc)));
  return b - COUNT_BUCKET_MIN;
}

/** Record bankroll after a table round, downsampling so any run length fits. */
export function recordHistory(s: SeatStats, bankroll: number) {
  if (bankroll > s.peakBankroll) s.peakBankroll = bankroll;
  const dd = s.peakBankroll - bankroll;
  if (dd > s.maxDrawdown) s.maxDrawdown = dd;
  const h = s.history;
  h.tick++;
  if (h.tick % h.every !== 0) return;
  h.points.push(bankroll);
  if (h.points.length > MAX_HISTORY) {
    h.points = h.points.filter((_, i) => i % 2 === 0);
    h.every *= 2;
  }
}

export interface DerivedStats {
  evPerRound: number;
  sdPerRound: number;
  edge: number;
  evPerHour: number;
  sdPerHour: number;
  /** Rounds needed for EV to overcome one SD (N0). */
  n0: number;
  /** Rough risk of ruin from the current bankroll at the observed EV/SD. */
  riskOfRuin: number;
  avgBet: number;
}

export function deriveStats(s: SeatStats, roundsPerHour: number, bankroll: number): DerivedStats {
  const n = s.rounds;
  const ev = n ? s.net / n : 0;
  const variance = n ? s.sumSqRoundNet / n - ev * ev : 0;
  const sd = Math.sqrt(Math.max(variance, 0));
  let ror = NaN;
  if (n > 100 && sd > 0) {
    ror = ev <= 0 ? 1 : Math.exp((-2 * ev * bankroll) / (sd * sd));
  }
  return {
    evPerRound: ev,
    sdPerRound: sd,
    edge: s.wagered ? s.net / s.wagered : 0,
    evPerHour: ev * roundsPerHour,
    sdPerHour: sd * Math.sqrt(roundsPerHour),
    n0: ev > 0 ? (sd * sd) / (ev * ev) : Infinity,
    riskOfRuin: ror,
    avgBet: n ? s.wagered / n : 0,
  };
}
