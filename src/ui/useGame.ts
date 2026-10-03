import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGame,
  decideHumanInsurance,
  humanAction,
  pendingInput,
  placeHumanBet,
  rebuy,
  step,
  type GameConfig,
  type GameState,
} from '../engine/game';
import { defaultBot, type SeatConfig } from '../engine/players';
import { PRESETS } from '../engine/rules';
import { randomSeed } from '../engine/rng';
import type { Action } from '../engine/strategy';
import type { FromWorker, SeatProgress, ToWorker } from '../worker/protocol';

export const SPEEDS = [
  { label: '0.5×', delay: 1400 },
  { label: '1×', delay: 700 },
  { label: '2×', delay: 350 },
  { label: '4×', delay: 160 },
  { label: '10×', delay: 60 },
  { label: 'Turbo', delay: 0 },
];

const STORAGE_KEY = 'bj-sim-config-v1';

export function emptySeat(i: number): SeatConfig {
  return { kind: 'empty', name: `Seat ${i + 1}`, bankroll: 10_000, bot: defaultBot() };
}

export function defaultConfig(): GameConfig {
  const p = PRESETS[0];
  const seats: SeatConfig[] = Array.from({ length: 7 }, (_, i) => emptySeat(i));
  seats[1] = { kind: 'bot', name: 'Hi-Lo Pro', bankroll: 20_000, bot: defaultBot({ unit: p.table.minBet }) };
  seats[3] = { kind: 'human', name: 'You', bankroll: 5_000, bot: defaultBot() };
  seats[5] = { kind: 'bot', name: 'Basic Betty', bankroll: 5_000, bot: defaultBot({ strategy: 'basic', unit: p.table.minBet }) };
  return {
    rules: { ...p.rules },
    shoe: { ...p.shoe },
    table: { ...p.table },
    seats,
    seed: randomSeed(),
    feedback: 'counted',
  };
}

function loadConfig(): GameConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as GameConfig;
      if (c.rules && c.seats?.length === 7) return c;
    }
  } catch {
    /* storage unavailable */
  }
  return defaultConfig();
}

function saveConfig(c: GameConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

export interface SkipProgress {
  done: number;
  total: number;
  roundsPerSec: number;
  seats: SeatProgress[];
}

export function useGame() {
  const [config, setConfig] = useState<GameConfig>(loadConfig);
  const gameRef = useRef<GameState>(null as unknown as GameState);
  if (!gameRef.current) gameRef.current = createGame(config);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [skip, setSkip] = useState<SkipProgress | null>(null);
  const [lastSkip, setLastSkip] = useState<{ rounds: number; ms: number; cancelled: boolean } | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const g = gameRef.current;
  const input = pendingInput(g);

  // Animation loop: one atomic step per tick, pausing for human input.
  useEffect(() => {
    if (!running || skip || input) return;
    const delay = SPEEDS[speed].delay;
    const game = gameRef.current;
    const pauseAfterRound = game.phase === 'done';
    const wait = pauseAfterRound ? Math.max(delay * 2.5, delay ? 600 : 0) : delay;
    const id = setTimeout(() => {
      if (delay === 0) {
        // Turbo: run to the next point that needs input or ends a round.
        const start = game.round;
        for (let i = 0; i < 2000 && !pendingInput(game) && game.round === start; i++) {
          step(game);
          if (game.phase === 'done') break;
        }
      } else {
        step(game);
      }
      bump();
    }, wait);
    return () => clearTimeout(id);
  });

  const newSession = useCallback(
    (c: GameConfig, reseed = true) => {
      const next = reseed ? { ...c, seed: randomSeed() } : c;
      workerRef.current?.terminate();
      workerRef.current = null;
      setSkip(null);
      setConfig(next);
      saveConfig(next);
      gameRef.current = createGame(next);
      bump();
    },
    [bump],
  );

  const runSkip = useCallback(
    (rounds: number, humanMode: 'basic' | 'sitout') => {
      if (rounds <= 0 || workerRef.current) return;
      const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      setSkip({ done: 0, total: rounds, roundsPerSec: 0, seats: [] });
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'progress') {
          setSkip({ done: m.done, total: m.total, roundsPerSec: m.roundsPerSec, seats: m.seats });
          return;
        }
        worker.terminate();
        workerRef.current = null;
        gameRef.current = m.state;
        m.state.events?.push({
          kind: 'info',
          round: m.state.round,
          text: m.type === 'error' ? `Simulation error: ${m.message}` : `Skipped ${m.done.toLocaleString()} rounds${m.cancelled ? ' (stopped early)' : ''}`,
        });
        if (m.type === 'done') setLastSkip({ rounds: m.done, ms: m.ms, cancelled: m.cancelled });
        setSkip(null);
        bump();
      };
      const msg: ToWorker = { type: 'run', state: gameRef.current, rounds, humanMode };
      worker.postMessage(msg);
    },
    [bump],
  );

  const cancelSkip = useCallback(() => {
    workerRef.current?.postMessage({ type: 'cancel' } satisfies ToWorker);
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const act = useCallback(
    (fn: (g: GameState) => void) => {
      fn(gameRef.current);
      bump();
    },
    [bump],
  );

  return {
    game: g,
    config,
    input,
    running,
    setRunning,
    speed,
    setSpeed,
    skip,
    lastSkip,
    newSession,
    runSkip,
    cancelSkip,
    stepOnce: () => act(step),
    bet: (amount: number) => act((g) => placeHumanBet(g, amount)),
    insurance: (take: boolean) => act((g) => decideHumanInsurance(g, take)),
    action: (a: Action) => act((g) => humanAction(g, a)),
    rebuy: (amount: number) => act((g) => rebuy(g, amount)),
    setFeedback: (f: GameConfig['feedback']) =>
      act((g) => {
        g.config.feedback = f;
        const c = { ...config, feedback: f };
        setConfig(c);
        saveConfig(c);
      }),
  };
}

export type GameApi = ReturnType<typeof useGame>;
