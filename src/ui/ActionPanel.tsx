import { useEffect, useState } from 'react';
import { humanSeatIndex, legalActions, recommendedAction, referenceTrueCount } from '../engine/game';
import { ACTION_NAMES, type Action } from '../engine/strategy';
import { money } from './format';
import type { GameApi } from './useGame';

const CHIPS = [1, 5, 25, 100, 500, 1000, 5000, 25000];
const KEYS: Record<Action, string> = { H: 'H', S: 'S', D: 'D', P: 'P', R: 'R' };

export function ActionPanel({ api, showHint, setShowHint }: { api: GameApi; showHint: boolean; setShowHint: (b: boolean) => void }) {
  const { game, input } = api;
  const hi = humanSeatIndex(game);
  const seat = hi >= 0 ? game.seats[hi] : null;
  const t = game.config.table;
  const [draft, setDraft] = useState(0);
  const [rebuyAmt, setRebuyAmt] = useState(String(seat?.config.bankroll ?? 1000));

  const legal = input === 'action' ? legalActions(game, game.turn.seat, game.turn.hand) : [];
  const rec = input === 'action' ? recommendedAction(game, game.turn.seat, game.turn.hand) : null;
  const chips = CHIPS.filter((c) => c >= t.minBet / 5 && c <= t.maxBet).slice(0, 6);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toUpperCase();
      if (input === 'action') {
        const a = (Object.keys(KEYS) as Action[]).find((x) => KEYS[x] === k);
        if (a && legal.includes(a)) api.action(a);
      } else if (input === 'insurance') {
        if (k === 'Y') api.insurance(true);
        if (k === 'N') api.insurance(false);
      } else if (input === 'bet' && e.key === 'Enter') {
        api.bet(draft || seat?.lastBet || t.minBet);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!seat) {
    return (
      <div className="panel action-panel">
        <div className="muted">Watch mode — no human seat. Add yourself in Setup to play.</div>
      </div>
    );
  }

  const broke = seat.bankroll < t.minBet && game.phase === 'betting';

  return (
    <div className="panel action-panel">
      <div className="action-head">
        <div>
          <span className="muted small">Your bankroll </span>
          <span className="mono strong">{money(seat.bankroll)}</span>
        </div>
        <label className="toggle small">
          <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
          Show correct play
        </label>
        <select
          className="input small"
          value={game.config.feedback}
          onChange={(e) => api.setFeedback(e.target.value as 'basic' | 'counted')}
          title="What your decisions are graded against"
        >
          <option value="basic">Grade vs basic strategy</option>
          <option value="counted">Grade vs Hi-Lo + I18/Fab4</option>
        </select>
      </div>

      {broke && (
        <div className="row">
          <span className="neg">You're below the table minimum.</span>
          <input className="input mono" value={rebuyAmt} onChange={(e) => setRebuyAmt(e.target.value)} style={{ width: 100 }} />
          <button className="btn primary" onClick={() => api.rebuy(Math.max(0, Number(rebuyAmt) || 0))}>
            Rebuy
          </button>
        </div>
      )}

      {input === 'bet' && (
        <div className="bet-ui">
          <div className="chips">
            {chips.map((c) => (
              <button key={c} className={`chip-btn chip-${c}`} onClick={() => setDraft((d) => Math.min(d + c, t.maxBet, seat.bankroll))}>
                {c >= 1000 ? `${c / 1000}k` : c}
              </button>
            ))}
          </div>
          <div className="row">
            <span className="mono strong bet-amt">{money(draft)}</span>
            <button className="btn" onClick={() => setDraft(0)}>Clear</button>
            <button className="btn" onClick={() => setDraft(Math.min(seat.lastBet, seat.bankroll))}>Rebet {money(seat.lastBet)}</button>
            <button className="btn" onClick={() => setDraft((d) => Math.min(d * 2, t.maxBet, seat.bankroll))}>×2</button>
            <button className="btn" onClick={() => api.bet(0)}>Sit out</button>
            <button
              className="btn primary"
              disabled={draft > 0 && draft < t.minBet}
              onClick={() => api.bet(draft || Math.min(seat.lastBet, seat.bankroll))}
            >
              Deal {money(draft || Math.min(seat.lastBet, seat.bankroll))} ⏎
            </button>
          </div>
          <div className="muted small">
            Table limits {money(t.minBet)} – {money(t.maxBet)}
          </div>
        </div>
      )}

      {input === 'insurance' && (
        <div className="row">
          <span>Dealer shows an Ace. Insurance?</span>
          <button className="btn" onClick={() => api.insurance(true)}>Yes (Y)</button>
          <button className="btn" onClick={() => api.insurance(false)}>No (N)</button>
          {showHint && (
            <span className="hint">
              Correct: {game.config.feedback === 'counted' && referenceTrueCount(game) >= 3 ? 'Take it (TC ≥ +3)' : 'Decline'}
            </span>
          )}
        </div>
      )}

      {input === 'action' && (
        <div className="row">
          {(['H', 'S', 'D', 'P', 'R'] as Action[]).map((a) => (
            <button
              key={a}
              className={`btn action-btn${showHint && rec?.action === a ? ' recommended' : ''}`}
              disabled={!legal.includes(a)}
              onClick={() => api.action(a)}
            >
              {ACTION_NAMES[a]} <kbd>{KEYS[a]}</kbd>
            </button>
          ))}
          {showHint && rec?.deviation && <span className="hint">Index play: {rec.deviation}</span>}
        </div>
      )}

      {!input && !broke && <div className="muted small">{api.running ? 'Dealing…' : 'Paused — press Play or Step.'}</div>}

      {game.lastFeedback && (
        <div className={`feedback ${game.lastFeedback.ok ? 'pos' : 'neg'}`}>{game.lastFeedback.ok ? '✓ ' : '✗ '}{game.lastFeedback.text}</div>
      )}
      <div className="muted small">
        Decisions: {seat.stats.decisions} · Mistakes: {seat.stats.mistakes}
        {seat.stats.decisions > 0 && ` (${((1 - seat.stats.mistakes / seat.stats.decisions) * 100).toFixed(1)}% accurate)`}
      </div>
    </div>
  );
}
