import { useState } from 'react';
import { humanSeatIndex } from '../engine/game';
import { num } from './format';
import { SPEEDS, type GameApi } from './useGame';

const QUICK = [100, 1_000, 10_000, 100_000, 1_000_000];

export function Controls({ api }: { api: GameApi }) {
  const { game, running, setRunning, speed, setSpeed, skip, lastSkip } = api;
  const [rounds, setRounds] = useState('10000');
  const [humanMode, setHumanMode] = useState<'basic' | 'sitout'>('basic');
  const hasHuman = humanSeatIndex(game) >= 0;
  const n = Math.floor(Number(rounds.replace(/[,_\s]/g, '')));
  const valid = Number.isFinite(n) && n >= 0;

  return (
    <div className="panel controls">
      <div className="control-group">
        <button className="btn primary" onClick={() => setRunning(!running)} disabled={!!skip}>
          {running ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button className="btn" onClick={api.stepOnce} disabled={!!skip || running || !!api.input} title="Advance one card / decision">
          Step
        </button>
        <div className="speed">
          <span className="muted small">Speed</span>
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`seg${i === speed ? ' on' : ''}`} onClick={() => setSpeed(i)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group skip-group">
        <span className="muted small">Skip ahead</span>
        <input
          className="input mono"
          value={rounds}
          onChange={(e) => setRounds(e.target.value)}
          disabled={!!skip}
          aria-label="Rounds to simulate"
          style={{ width: 120 }}
        />
        <span className="muted small">rounds</span>
        {QUICK.map((q) => (
          <button key={q} className="seg" disabled={!!skip} onClick={() => setRounds(String(q))}>
            {q >= 1e6 ? `${q / 1e6}M` : q >= 1e3 ? `${q / 1e3}k` : q}
          </button>
        ))}
        {hasHuman && (
          <select className="input" value={humanMode} onChange={(e) => setHumanMode(e.target.value as 'basic' | 'sitout')} disabled={!!skip}>
            <option value="basic">My seat: basic strategy, last bet</option>
            <option value="sitout">My seat: sit out</option>
          </select>
        )}
        {skip ? (
          <button className="btn danger" onClick={api.cancelSkip}>
            Stop
          </button>
        ) : (
          <button className="btn primary" disabled={!valid || n === 0} onClick={() => api.runSkip(n, humanMode)}>
            Simulate →
          </button>
        )}
      </div>

      {skip && (
        <div className="progress">
          <div className="progress-bar">
            <div style={{ width: `${(skip.done / skip.total) * 100}%` }} />
          </div>
          <span className="mono small">
            {skip.done.toLocaleString()} / {skip.total.toLocaleString()} · {num(skip.roundsPerSec, 0)} rounds/s
          </span>
        </div>
      )}
      {!skip && lastSkip && (
        <div className="muted small">
          Last skip: {lastSkip.rounds.toLocaleString()} rounds in {num(lastSkip.ms / 1000, 2)}s{lastSkip.cancelled ? ' (stopped early)' : ''}. See the Results tab.
        </div>
      )}
    </div>
  );
}
