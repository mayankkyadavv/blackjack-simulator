/// <reference lib="webworker" />
import { runRounds } from '../engine/simulate';
import type { FromWorker, ToWorker } from './protocol';

let cancelled = false;
const post = (m: FromWorker) => (self as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  cancelled = false;
  const { state, rounds, humanMode } = msg;
  const start = performance.now();
  let done = 0;
  let chunk = 2_000;

  // Run in time-boxed chunks, yielding between them so 'cancel' can arrive.
  const tick = () => {
    try {
      const t0 = performance.now();
      const n = Math.min(chunk, rounds - done);
      runRounds(state, n, humanMode);
      done += n;
      const dt = performance.now() - t0;
      // Aim for ~100ms chunks.
      chunk = Math.max(500, Math.min(1_000_000, Math.round((n * 100) / Math.max(dt, 1))));
      const elapsed = performance.now() - start;
      post({
        type: 'progress',
        done,
        total: rounds,
        roundsPerSec: (done / Math.max(elapsed, 1)) * 1000,
        seats: state.seats.map((s) => ({ bankroll: s.bankroll, net: s.stats.net })),
      });
      if (done >= rounds || cancelled) {
        post({ type: 'done', state, done, cancelled, ms: elapsed });
        return;
      }
      setTimeout(tick, 0);
    } catch (err) {
      post({ type: 'error', message: String(err), state });
    }
  };
  tick();
};
