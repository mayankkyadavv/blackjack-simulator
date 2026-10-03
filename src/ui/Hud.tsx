import { useState } from 'react';
import { referenceTrueCount, type GameState } from '../engine/game';
import { describeRules } from '../engine/rules';
import { cardsRemaining } from '../engine/shoe';
import { num } from './format';

export function Hud({ game, showCount, setShowCount }: { game: GameState; showCount: boolean; setShowCount: (b: boolean) => void }) {
  const { shoe, config } = game;
  const total = shoe.cards.length + shoe.discards.length + shoe.inPlay.length;
  const remaining = cardsRemaining(shoe);
  const dealtFrac = 1 - remaining / total;
  const cutFrac = shoe.cutIndex / Math.max(shoe.cards.length, 1);
  const tc = referenceTrueCount(game);
  const csm = config.shoe.method === 'csm';

  return (
    <div className="panel hud">
      <div className="hud-row">
        <span className="muted">Round</span>
        <span className="mono">{game.round.toLocaleString()}</span>
      </div>
      <div className="hud-row">
        <span className="muted">Shoe</span>
        <span className="mono">
          {remaining} cards · {num(remaining / 52, 1)} decks
        </span>
      </div>
      {!csm && (
        <div className="shoe-bar" title="Cards dealt; the line marks the cut card">
          <div className="shoe-fill" style={{ width: `${dealtFrac * 100}%` }} />
          <div className="shoe-cut" style={{ left: `${cutFrac * 100}%` }} />
        </div>
      )}
      <div className="hud-row">
        <span className="muted">Shuffles</span>
        <span className="mono">{csm ? 'CSM (every round)' : shoe.shuffleCount}</span>
      </div>
      <div className="hud-rules">{describeRules(config.rules)}</div>

      <div className="divider" />
      <label className="toggle">
        <input type="checkbox" checked={showCount} onChange={(e) => setShowCount(e.target.checked)} />
        Show count (Hi-Lo)
      </label>
      {showCount ? (
        <div className="count-big">
          <div>
            <div className="muted small">Running</div>
            <div className="mono big">{game.hiloRc > 0 ? '+' : ''}{game.hiloRc}</div>
          </div>
          <div>
            <div className="muted small">True</div>
            <div className={`mono big ${tc >= 2 ? 'pos' : tc <= -2 ? 'neg' : ''}`}>{tc > 0 ? '+' : ''}{num(tc, 1)}</div>
          </div>
        </div>
      ) : (
        <CountQuiz game={game} />
      )}
    </div>
  );
}

function CountQuiz({ game }: { game: GameState }) {
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const check = () => {
    const v = Number(guess);
    if (guess.trim() === '' || !Number.isFinite(v)) return;
    const ok = v === game.hiloRc;
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    setResult({ ok, text: ok ? `Correct: ${game.hiloRc}` : `Running count is ${game.hiloRc} (you said ${v})` });
    setGuess('');
  };
  return (
    <div className="quiz">
      <div className="muted small">Keep the count yourself, then check it.</div>
      <div className="row">
        <input
          className="input mono"
          inputMode="numeric"
          placeholder="Your RC"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
        />
        <button className="btn" onClick={check}>
          Check
        </button>
      </div>
      {result && <div className={`small ${result.ok ? 'pos' : 'neg'}`}>{result.text}</div>}
      {score.total > 0 && (
        <div className="muted small">
          {score.right}/{score.total} correct
        </div>
      )}
    </div>
  );
}
