import type { GameState } from '../engine/game';
import { signedMoney } from './format';

export function EventLog({ game }: { game: GameState }) {
  const events = (game.events ?? []).slice(-60).reverse();
  return (
    <div className="panel log">
      <div className="panel-title">Table log</div>
      <ul>
        {events.map((e, i) => (
          <li key={i} className={`log-${e.kind}`}>
            <span className="muted mono">#{e.round}</span>{' '}
            {e.kind === 'shuffle' ? 'Shuffle — counts reset' : e.text}
            {e.kind === 'result' && <span className={e.net > 0 ? 'pos' : e.net < 0 ? 'neg' : 'muted'}> {signedMoney(e.net, e.net % 1 ? 2 : 0)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
