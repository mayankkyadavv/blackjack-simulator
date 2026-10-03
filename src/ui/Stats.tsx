import { useState } from 'react';
import type { GameState } from '../engine/game';
import { deriveStats } from '../engine/stats';
import { BankrollChart, EdgeByCountChart } from './Charts';
import { money, num, pct, SEAT_COLORS, signedMoney } from './format';

export function Stats({ game }: { game: GameState }) {
  const seats = game.seats.map((s, i) => ({ s, i })).filter(({ s }) => s.config.kind !== 'empty');
  const [sel, setSel] = useState(() => seats.find(({ s }) => s.counter)?.i ?? seats[0]?.i ?? 0);
  const rph = game.config.table.roundsPerHour;
  const selected = game.seats[sel];

  return (
    <div className="stats">
      <div className="panel">
        <div className="panel-title">
          Results after {game.round.toLocaleString()} rounds
          <span className="muted small"> · {rph} rounds/hour assumed</span>
        </div>
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Seat</th>
                <th>Bankroll</th>
                <th>Net</th>
                <th title="Net ÷ sum of initial bets">Edge</th>
                <th>Rounds</th>
                <th>Avg bet</th>
                <th>EV / round</th>
                <th>SD / round</th>
                <th>EV / hour</th>
                <th>SD / hour</th>
                <th title="Rounds until EV equals one standard deviation">N0</th>
                <th title="Risk of ruin from current bankroll at observed EV/SD (diffusion approximation)">RoR</th>
                <th>Max drawdown</th>
                <th>W / L / P</th>
                <th>BJ</th>
                <th>Dbl</th>
                <th>Split</th>
                <th>Surr</th>
                <th>Insurance</th>
                <th title="Bots: index plays used. You: mistakes / decisions">Plays</th>
              </tr>
            </thead>
            <tbody>
              {seats.map(({ s, i }) => {
                const d = deriveStats(s.stats, rph, s.bankroll);
                const st = s.stats;
                return (
                  <tr key={i} className={i === sel ? 'sel' : ''} onClick={() => setSel(i)}>
                    <td>
                      <span className="dot" style={{ background: SEAT_COLORS[i] }} /> {s.config.name}
                      {st.ruinedAtRound !== null && <span className="neg small"> (ruined @ {st.ruinedAtRound.toLocaleString()})</span>}
                    </td>
                    <td className="mono">{money(s.bankroll)}</td>
                    <td className={`mono ${st.net > 0 ? 'pos' : st.net < 0 ? 'neg' : ''}`}>{signedMoney(st.net)}</td>
                    <td className={`mono ${d.edge > 0 ? 'pos' : d.edge < 0 ? 'neg' : ''}`}>{st.rounds ? pct(d.edge, 2) : '—'}</td>
                    <td className="mono">{st.rounds.toLocaleString()}{st.roundsSatOut ? <span className="muted"> (+{st.roundsSatOut.toLocaleString()} out)</span> : null}</td>
                    <td className="mono">{money(d.avgBet, 2)}</td>
                    <td className="mono">{money(d.evPerRound, 2)}</td>
                    <td className="mono">{money(d.sdPerRound, 2)}</td>
                    <td className="mono">{money(d.evPerHour, 2)}</td>
                    <td className="mono">{money(d.sdPerHour, 0)}</td>
                    <td className="mono">{Number.isFinite(d.n0) ? num(d.n0, 0) : '∞'}</td>
                    <td className="mono">{Number.isNaN(d.riskOfRuin) ? '—' : pct(d.riskOfRuin, 1).replace('+', '')}</td>
                    <td className="mono">{money(st.maxDrawdown)}</td>
                    <td className="mono">
                      {st.wins.toLocaleString()} / {st.losses.toLocaleString()} / {st.pushes.toLocaleString()}
                    </td>
                    <td className="mono">{st.blackjacks.toLocaleString()}</td>
                    <td className="mono">{st.doubles.toLocaleString()}</td>
                    <td className="mono">{st.splits.toLocaleString()}</td>
                    <td className="mono">{st.surrenders.toLocaleString()}</td>
                    <td className="mono">{st.insuranceTaken ? `${st.insuranceTaken.toLocaleString()} · ${signedMoney(st.insuranceNet)}` : '—'}</td>
                    <td className="mono">
                      {s.config.kind === 'human' ? `${st.mistakes}/${st.decisions} miss` : st.deviations.toLocaleString()}
                      {st.rebuys ? <span className="muted"> · rebuys {money(st.rebuys)}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="muted small">
          Statistical note: the standard error of the edge is roughly SD ÷ (avg bet × √rounds). Under ~100k rounds, edges of ±1% are mostly noise.
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Bankroll by round</div>
        <BankrollChart
          series={seats.map(({ s, i }) => ({
            name: s.config.name,
            color: SEAT_COLORS[i],
            points: s.stats.history.points,
            every: s.stats.history.every,
          }))}
        />
      </div>

      <div className="panel">
        <div className="panel-title row">
          Edge by true count —
          <select className="input" value={sel} onChange={(e) => setSel(Number(e.target.value))}>
            {seats.map(({ s, i }) => (
              <option key={i} value={i}>{s.config.name}</option>
            ))}
          </select>
        </div>
        {selected && <EdgeByCountChart buckets={selected.stats.byCount} />}
      </div>
    </div>
  );
}
