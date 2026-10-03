import type { GameState } from '../engine/game';

export type ToWorker =
  | { type: 'run'; state: GameState; rounds: number; humanMode: 'basic' | 'sitout' }
  | { type: 'cancel' };

export interface SeatProgress {
  bankroll: number;
  net: number;
}

export type FromWorker =
  | { type: 'progress'; done: number; total: number; roundsPerSec: number; seats: SeatProgress[] }
  | { type: 'done'; state: GameState; done: number; cancelled: boolean; ms: number }
  | { type: 'error'; message: string; state: GameState };
