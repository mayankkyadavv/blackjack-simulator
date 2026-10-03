import { useState } from 'react';
import { ActionPanel } from './ui/ActionPanel';
import { Controls } from './ui/Controls';
import { EventLog } from './ui/EventLog';
import { Hud } from './ui/Hud';
import { Setup } from './ui/Setup';
import { Stats } from './ui/Stats';
import { Table } from './ui/Table';
import { useGame } from './ui/useGame';

type Tab = 'table' | 'setup' | 'stats';

export default function App() {
  const api = useGame();
  const [tab, setTab] = useState<Tab>('table');
  const [showCount, setShowCount] = useState(true);
  const [showBotCounts, setShowBotCounts] = useState(true);
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">♠ Blackjack Simulator</div>
        <nav className="tabs">
          {(['table', 'setup', 'stats'] as Tab[]).map((t) => (
            <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {t === 'table' ? 'Table' : t === 'setup' ? 'Setup' : 'Results'}
            </button>
          ))}
        </nav>
        <div className="muted small mono">seed {api.config.seed}</div>
      </header>

      {tab === 'table' && (
        <main className="table-layout">
          <div className="table-main">
            <Table game={api.game} showBotCounts={showBotCounts} />
            <ActionPanel api={api} showHint={showHint} setShowHint={setShowHint} />
            <Controls api={api} />
          </div>
          <aside className="sidebar">
            <Hud game={api.game} showCount={showCount} setShowCount={setShowCount} />
            <label className="toggle small panel">
              <input type="checkbox" checked={showBotCounts} onChange={(e) => setShowBotCounts(e.target.checked)} />
              Show bots' counts at their seats
            </label>
            <EventLog game={api.game} />
          </aside>
        </main>
      )}
      {tab === 'setup' && <Setup api={api} onStarted={() => setTab('table')} />}
      {tab === 'stats' && <Stats game={api.game} />}
    </div>
  );
}
