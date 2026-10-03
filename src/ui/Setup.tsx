import { useState, type ReactNode } from 'react';
import { COUNTING_SYSTEMS, type CountingSystemId, type DeckEstimation } from '../engine/counting';
import type { GameConfig } from '../engine/game';
import { defaultBot, RAMP_PRESETS, STRATEGY_NAMES, type BotConfig, type PlayStrategy, type RampStep, type SeatConfig, type SeatKind } from '../engine/players';
import { describeRules, PRESETS, type Rules, type ShoeConfig, type TableConfig } from '../engine/rules';
import { SEAT_COLORS } from './format';
import { defaultConfig, emptySeat, type GameApi } from './useGame';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function Setup({ api, onStarted }: { api: GameApi; onStarted: () => void }) {
  const [draft, setDraft] = useState<GameConfig>(() => clone(api.config));
  const [keepSeed, setKeepSeed] = useState(false);
  const setRules = (p: Partial<Rules>) => setDraft((d) => ({ ...d, rules: { ...d.rules, ...p } }));
  const setShoe = (p: Partial<ShoeConfig>) => setDraft((d) => ({ ...d, shoe: { ...d.shoe, ...p } }));
  const setTable = (p: Partial<TableConfig>) => setDraft((d) => ({ ...d, table: { ...d.table, ...p } }));
  const setSeat = (i: number, s: SeatConfig) => setDraft((d) => ({ ...d, seats: d.seats.map((x, j) => (j === i ? s : x)) }));
  const r = draft.rules;

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (p) setDraft((d) => ({ ...d, rules: { ...p.rules }, shoe: { ...p.shoe }, table: { ...p.table } }));
  };

  const quick = (mode: 'solo' | 'bots' | 'watch') => {
    const base = defaultConfig();
    const unit = draft.table.minBet;
    const seats = Array.from({ length: 7 }, (_, i) => emptySeat(i));
    if (mode === 'solo') {
      seats[3] = { kind: 'human', name: 'You', bankroll: 5000, bot: defaultBot() };
    } else if (mode === 'bots') {
      seats[1] = { kind: 'bot', name: 'Hi-Lo Pro', bankroll: 20000, bot: defaultBot({ unit }) };
      seats[3] = { kind: 'human', name: 'You', bankroll: 5000, bot: defaultBot() };
      seats[5] = { kind: 'bot', name: 'Basic Betty', bankroll: 5000, bot: defaultBot({ strategy: 'basic', unit }) };
    } else {
      seats[0] = { kind: 'bot', name: 'Hi-Lo 1-12', bankroll: 20000, bot: defaultBot({ unit }) };
      seats[1] = { kind: 'bot', name: 'KO 1-12', bankroll: 20000, bot: defaultBot({ unit, system: 'ko' }) };
      seats[2] = { kind: 'bot', name: 'Omega II', bankroll: 20000, bot: defaultBot({ unit, system: 'omega2' }) };
      seats[3] = { kind: 'bot', name: 'Halves Wonger', bankroll: 20000, bot: defaultBot({ unit, system: 'halves', wongOutBelow: -1 }) };
      seats[4] = { kind: 'bot', name: 'Basic Betty', bankroll: 20000, bot: defaultBot({ strategy: 'basic', unit }) };
      seats[5] = { kind: 'bot', name: 'Mimic Mike', bankroll: 20000, bot: defaultBot({ strategy: 'mimic', unit }) };
    }
    setDraft((d) => ({ ...d, seats, feedback: base.feedback }));
  };

  const start = () => {
    api.newSession(clone(draft), !keepSeed);
    onStarted();
  };

  const humans = draft.seats.filter((s) => s.kind === 'human').length;

  return (
    <div className="setup">
      <div className="setup-bar panel">
        <div>
          <div className="strong">{describeRules(r)}</div>
          <div className="muted small">
            {draft.shoe.method === 'csm' ? 'Continuous shuffler' : `${Math.round(draft.shoe.penetration * 100)}% penetration, ${draft.shoe.method === 'hand' ? 'hand shuffle' : 'random shuffle'}`} · ${draft.table.minBet}–${draft.table.maxBet}
          </div>
        </div>
        <div className="row">
          <label className="toggle small">
            <input type="checkbox" checked={keepSeed} onChange={(e) => setKeepSeed(e.target.checked)} />
            Reuse seed
          </label>
          <input
            className="input mono small"
            style={{ width: 120 }}
            value={draft.seed}
            onChange={(e) => setDraft((d) => ({ ...d, seed: Number(e.target.value) >>> 0 }))}
            title="RNG seed — the same seed + settings reproduces every card"
            disabled={!keepSeed}
          />
          <button className="btn" onClick={() => setDraft(clone(api.config))}>Revert</button>
          <button className="btn primary" disabled={humans > 1} onClick={start}>
            Start new session
          </button>
        </div>
      </div>
      {humans > 1 && <div className="neg small">Only one seat can be you.</div>}

      <div className="setup-grid">
        <Section title="Quick setup">
          <div className="row wrap">
            <button className="btn" onClick={() => quick('solo')}>Play heads-up</button>
            <button className="btn" onClick={() => quick('bots')}>Play with bots</button>
            <button className="btn" onClick={() => quick('watch')}>Watch counters compete</button>
          </div>
        </Section>

        <Section title="Casino rules">
          <Field label="Preset">
            <select className="input" value="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">Load a casino preset…</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Decks">
            <select className="input" value={r.decks} onChange={(e) => setRules({ decks: Number(e.target.value) })}>
              {[1, 2, 4, 5, 6, 8].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Soft 17">
            <Seg value={r.dealerHitsSoft17 ? 'h' : 's'} options={[['s', 'Stand (S17)'], ['h', 'Hit (H17)']]} onChange={(v) => setRules({ dealerHitsSoft17: v === 'h' })} />
          </Field>
          <Field label="Blackjack pays">
            <Seg value={String(r.blackjackPayout)} options={[['1.5', '3:2'], ['1.2', '6:5'], ['1', '1:1']]} onChange={(v) => setRules({ blackjackPayout: Number(v) })} />
          </Field>
          <Field label="Double on">
            <Seg value={r.doubleOn} options={[['any', 'Any 2'], ['9-11', '9–11'], ['10-11', '10–11']]} onChange={(v) => setRules({ doubleOn: v as Rules['doubleOn'] })} />
          </Field>
          <Field label="Double after split">
            <Check checked={r.doubleAfterSplit} onChange={(b) => setRules({ doubleAfterSplit: b })} />
          </Field>
          <Field label="Split to">
            <Seg value={String(r.maxSplitHands)} options={[['2', '2 hands'], ['3', '3'], ['4', '4']]} onChange={(v) => setRules({ maxSplitHands: Number(v) })} />
          </Field>
          <Field label="Resplit aces">
            <Check checked={r.resplitAces} onChange={(b) => setRules({ resplitAces: b })} />
          </Field>
          <Field label="Hit split aces">
            <Check checked={r.hitSplitAces} onChange={(b) => setRules({ hitSplitAces: b })} />
          </Field>
          <Field label="Late surrender">
            <Check checked={r.surrender === 'late'} onChange={(b) => setRules({ surrender: b ? 'late' : 'none' })} />
          </Field>
          <Field label="Dealer hole card" hint="Off = European no-hole-card: doubles and splits lose to a dealer blackjack">
            <Check checked={r.dealerPeek} onChange={(b) => setRules({ dealerPeek: b })} />
          </Field>
          <Field label="Insurance offered">
            <Check checked={r.insurance} onChange={(b) => setRules({ insurance: b })} />
          </Field>
        </Section>

        <Section title="Shoe & shuffle">
          <Field label="Shuffle method">
            <Seg
              value={draft.shoe.method}
              options={[['perfect', 'Random'], ['hand', 'Hand riffle'], ['csm', 'CSM']]}
              onChange={(v) => setShoe({ method: v as ShoeConfig['method'] })}
            />
          </Field>
          <div className="muted small explain">
            {draft.shoe.method === 'perfect' && 'Machine-perfect randomization at the cut card.'}
            {draft.shoe.method === 'hand' &&
              'Dealer picks up the discards, splits into grabs and riffles each pair. Fewer riffles leave clumps from the previous shoe intact.'}
            {draft.shoe.method === 'csm' && 'Discards go back into the machine after every round — counting has no effect.'}
          </div>
          {draft.shoe.method !== 'csm' && (
            <Field label={`Penetration ${Math.round(draft.shoe.penetration * 100)}%`}>
              <input type="range" min={0.4} max={0.95} step={0.01} value={draft.shoe.penetration} onChange={(e) => setShoe({ penetration: Number(e.target.value) })} />
            </Field>
          )}
          {draft.shoe.method === 'hand' && (
            <Field label={`Riffles per grab: ${draft.shoe.riffles}`}>
              <input type="range" min={1} max={7} step={1} value={draft.shoe.riffles} onChange={(e) => setShoe({ riffles: Number(e.target.value) })} />
            </Field>
          )}
          <Field label="Burn cards">
            <NumberInput value={draft.shoe.burnCards} min={0} max={10} onChange={(v) => setShoe({ burnCards: v })} />
          </Field>
        </Section>

        <Section title="Table & money">
          <Field label="Table minimum ($)">
            <NumberInput value={draft.table.minBet} min={1} onChange={(v) => setTable({ minBet: v })} />
          </Field>
          <Field label="Table maximum ($)">
            <NumberInput value={draft.table.maxBet} min={1} onChange={(v) => setTable({ maxBet: v })} />
          </Field>
          <Field label="Rounds per hour" hint="Used for hourly win rate and SD">
            <NumberInput value={draft.table.roundsPerHour} min={1} onChange={(v) => setTable({ roundsPerHour: v })} />
          </Field>
        </Section>
      </div>

      <Section title="Seats (seat 1 = first base, dealer's left)">
        <div className="seat-editor">
          {draft.seats.map((s, i) => (
            <SeatEditor key={i} index={i} seat={s} minBet={draft.table.minBet} onChange={(x) => setSeat(i, x)} />
          ))}
        </div>
      </Section>
    </div>
  );
}

function SeatEditor({ index, seat, minBet, onChange }: { index: number; seat: SeatConfig; minBet: number; onChange: (s: SeatConfig) => void }) {
  const setBot = (p: Partial<BotConfig>) => onChange({ ...seat, bot: { ...seat.bot, ...p } });
  const b = seat.bot;
  const sys = COUNTING_SYSTEMS.find((s) => s.id === b.system)!;
  return (
    <div className={`seat-card${seat.kind === 'empty' ? ' empty' : ''}`} style={{ borderLeftColor: SEAT_COLORS[index] }}>
      <div className="row wrap">
        <span className="strong">Seat {index + 1}</span>
        <Seg
          value={seat.kind}
          options={[['empty', 'Empty'], ['human', 'You'], ['bot', 'Bot']]}
          onChange={(v) => onChange({ ...seat, kind: v as SeatKind, name: v === 'human' ? 'You' : v === 'bot' && seat.name.startsWith('Seat') ? `Bot ${index + 1}` : seat.name, bot: v === 'bot' ? { ...seat.bot, unit: seat.bot.unit || minBet } : seat.bot })}
        />
        {seat.kind !== 'empty' && (
          <>
            <input className="input" value={seat.name} onChange={(e) => onChange({ ...seat, name: e.target.value })} style={{ width: 130 }} aria-label="Name" />
            <label className="small muted">Bankroll $</label>
            <NumberInput value={seat.bankroll} min={0} onChange={(v) => onChange({ ...seat, bankroll: v })} />
          </>
        )}
      </div>
      {seat.kind === 'bot' && (
        <div className="bot-grid">
          <Field label="Strategy">
            <select className="input" value={b.strategy} onChange={(e) => setBot({ strategy: e.target.value as PlayStrategy })}>
              {(Object.keys(STRATEGY_NAMES) as PlayStrategy[]).map((k) => <option key={k} value={k}>{STRATEGY_NAMES[k]}</option>)}
            </select>
          </Field>
          <Field label={b.strategy === 'counter' ? 'Unit ($)' : 'Flat bet ($)'}>
            <NumberInput value={b.unit} min={1} onChange={(v) => setBot({ unit: v })} />
          </Field>
          {b.strategy === 'counter' && (
            <>
              <Field label="System" hint={sys.blurb}>
                <select className="input" value={b.system} onChange={(e) => setBot({ system: e.target.value as CountingSystemId })}>
                  {COUNTING_SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Deck estimation">
                <select className="input" value={b.deckEstimation} onChange={(e) => setBot({ deckEstimation: e.target.value as DeckEstimation })}>
                  <option value="exact">Exact</option>
                  <option value="half">Nearest ½ deck</option>
                  <option value="full">Nearest deck</option>
                </select>
              </Field>
              <Field label="Index plays" hint={sys.balanced ? (sys.id === 'hilo' ? 'Illustrious 18 + Fab 4' : 'Hi-Lo I18/Fab4 scaled to this count (approximate)') : 'Not available for unbalanced counts'}>
                <Check checked={b.deviations && sys.balanced} disabled={!sys.balanced} onChange={(v) => setBot({ deviations: v })} />
              </Field>
              <Field label={`Insurance at ${sys.balanced ? 'TC' : 'RC'} ≥ ${sys.insuranceAt}`}>
                <Check checked={b.insurance} onChange={(v) => setBot({ insurance: v })} />
              </Field>
              <Field label="Wong out below" hint="Sit out (but keep counting) when the count is below this">
                <div className="row">
                  <Check checked={b.wongOutBelow !== null} onChange={(v) => setBot({ wongOutBelow: v ? -1 : null })} />
                  {b.wongOutBelow !== null && <NumberInput value={b.wongOutBelow} step={0.5} onChange={(v) => setBot({ wongOutBelow: v })} />}
                </div>
              </Field>
              <RampEditor ramp={b.ramp} balanced={sys.balanced} unit={b.unit} onChange={(ramp) => setBot({ ramp })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RampEditor({ ramp, balanced, unit, onChange }: { ramp: RampStep[]; balanced: boolean; unit: number; onChange: (r: RampStep[]) => void }) {
  const label = balanced ? 'TC' : 'RC';
  const set = (i: number, p: Partial<RampStep>) => onChange(ramp.map((s, j) => (j === i ? { ...s, ...p } : s)).sort((a, b) => a.count - b.count));
  return (
    <div className="ramp">
      <div className="row wrap">
        <span className="small muted">Bet ramp</span>
        {RAMP_PRESETS.map((p) => (
          <button key={p.id} className="seg" onClick={() => onChange(p.ramp.map((s) => ({ ...s })))}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="ramp-steps">
        {ramp.map((s, i) => (
          <div key={i} className="ramp-step">
            {i === 0 ? (
              <span className="small muted">Base</span>
            ) : (
              <>
                <span className="small muted">{label} ≥</span>
                <NumberInput value={s.count} step={0.5} onChange={(v) => set(i, { count: v })} />
              </>
            )}
            <span className="small muted">→</span>
            <NumberInput value={s.units} min={0} onChange={(v) => set(i, { units: v })} />
            <span className="small muted">units (${(s.units * unit).toLocaleString()})</span>
            {i > 0 && (
              <button className="seg" onClick={() => onChange(ramp.filter((_, j) => j !== i))} aria-label="Remove step">
                ×
              </button>
            )}
          </div>
        ))}
        <button className="seg" onClick={() => onChange([...ramp, { count: (ramp[ramp.length - 1]?.count ?? 0) + 1, units: (ramp[ramp.length - 1]?.units ?? 1) + 2 }].map((s, i) => (i === 0 ? { ...s, count: -99 } : s)))}>
          + step
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel section">
      <div className="panel-title">{title}</div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field" title={hint}>
      <span className="field-label">
        {label}
        {hint && <span className="hint-dot">?</span>}
      </span>
      {children}
    </div>
  );
}

function Seg({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="segs">
      {options.map(([v, l]) => (
        <button key={v} className={`seg${v === value ? ' on' : ''}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Check({ checked, onChange, disabled }: { checked: boolean; onChange: (b: boolean) => void; disabled?: boolean }) {
  return <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
}

function NumberInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(String(value));
  }
  return (
    <input
      className="input mono num-input"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(v)) {
          const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
          setLast(clamped);
          onChange(clamped);
        }
      }}
      step={step}
    />
  );
}
