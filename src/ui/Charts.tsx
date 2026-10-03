import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CountBucket } from '../engine/stats';
import { COUNT_BUCKET_MIN } from '../engine/stats';
import { money, num, pct } from './format';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** "Nice" tick values covering [lo, hi]. */
function ticks(lo: number, hi: number, n = 5): number[] {
  if (hi === lo) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const compact = (n: number) =>
  Math.abs(n) >= 1e6 ? `${num(n / 1e6, 1)}M` : Math.abs(n) >= 1e3 ? `${num(n / 1e3, 1)}k` : num(n, 0);

export interface LineSeries {
  name: string;
  color: string;
  points: number[];
  every: number;
}

const M = { top: 16, right: 16, bottom: 28, left: 64 };
/** Buckets with fewer rounds than this are drawn faded: their edge is mostly noise. */
const MIN_RELIABLE = 2000;

export function BankrollChart({ series, height = 300 }: { series: LineSeries[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const valid = series.filter((s) => s.points.length > 1);
  if (!valid.length) return <div ref={ref} className="chart-empty muted">Play or simulate some rounds to see bankroll curves.</div>;

  const maxX = Math.max(...valid.map((s) => (s.points.length - 1) * s.every));
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of valid) for (const p of s.points) {
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  lo -= pad;
  hi += pad;
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const x = (v: number) => M.left + (v / Math.max(maxX, 1)) * iw;
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * ih;
  const yt = ticks(lo, hi);
  const xt = ticks(0, maxX, 6).filter((v) => Number.isInteger(v));

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    setHover(Math.round(fx * maxX));
  };
  const valueAt = (s: LineSeries, round: number) => s.points[Math.min(s.points.length - 1, Math.round(round / s.every))];

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={height} role="img" aria-label="Bankroll by round">
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className="grid" />
            <text x={M.left - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
              {compact(v)}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={v} x={x(v)} y={height - 8} className="axis" textAnchor="middle">
            {compact(v)}
          </text>
        ))}
        {valid.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            points={s.points.map((p, i) => `${x(i * s.every).toFixed(1)},${y(p).toFixed(1)}`).join(' ')}
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} className="crosshair" />
            {valid.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(valueAt(s, hover))} r={4} fill={s.color} stroke="var(--bg-panel)" strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={M.left} y={M.top} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <Tooltip left={x(hover)} width={width}>
          <div className="tt-title">Round {hover.toLocaleString()}</div>
          {valid.map((s) => (
            <div key={s.name} className="tt-row">
              <span className="dot" style={{ background: s.color }} />
              <span>{s.name}</span>
              <span className="mono">{money(valueAt(s, hover))}</span>
            </div>
          ))}
        </Tooltip>
      )}
      <Legend items={valid.map((s) => ({ name: s.name, color: s.color }))} />
    </div>
  );
}

export function EdgeByCountChart({ buckets, height = 240 }: { buckets: CountBucket[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const rows = buckets
    .map((b, i) => ({ tc: i + COUNT_BUCKET_MIN, ...b, edge: b.wagered ? b.net / b.wagered : 0 }))
    .filter((b) => b.rounds > 0);
  if (!rows.length) return <div ref={ref} className="chart-empty muted">No rounds played yet.</div>;
  const total = rows.reduce((a, b) => a + b.rounds, 0);
  // Clamp to keep a few noisy extreme buckets from flattening the chart.
  const ext = Math.min(0.5, Math.max(0.02, ...rows.map((r) => Math.abs(r.edge))));
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const bw = iw / rows.length;
  const y = (v: number) => M.top + (1 - (Math.max(-ext, Math.min(ext, v)) + ext) / (2 * ext)) * ih;
  const yt = ticks(-ext, ext, 4);
  const h = hover !== null ? rows[hover] : null;

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={height} role="img" aria-label="Player edge by true count">
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'baseline' : 'grid'} />
            <text x={M.left - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
              {pct(v, 0)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const top = Math.min(y(r.edge), y(0));
          const hgt = Math.max(1, Math.abs(y(r.edge) - y(0)));
          const bx = M.left + i * bw + 1;
          return (
            <g key={r.tc} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={M.left + i * bw} y={M.top} width={bw} height={ih} fill="transparent" />
              <rect x={bx} y={top} width={Math.max(1, bw - 2)} height={hgt} rx={Math.min(4, bw / 4)} fill={r.edge >= 0 ? 'var(--viz-pos)' : 'var(--viz-neg)'} opacity={(hover === null || hover === i ? 1 : 0.55) * (r.rounds < MIN_RELIABLE ? 0.35 : 1)} />
              <text x={M.left + i * bw + bw / 2} y={height - 8} className="axis" textAnchor="middle">
                {r.tc === COUNT_BUCKET_MIN ? `≤${r.tc}` : r.tc === -COUNT_BUCKET_MIN ? `≥${r.tc}` : r.tc > 0 ? `+${r.tc}` : r.tc}
              </text>
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <Tooltip left={M.left + hover * bw + bw / 2} width={width}>
          <div className="tt-title">True count {h.tc > 0 ? '+' : ''}{h.tc}</div>
          <div className="tt-row"><span>Player edge</span><span className="mono">{pct(h.edge)}</span></div>
          <div className="tt-row"><span>Rounds</span><span className="mono">{h.rounds.toLocaleString()} ({pct(h.rounds / total, 1).replace('+', '')})</span></div>
          <div className="tt-row"><span>Avg bet</span><span className="mono">{money(h.wagered / h.rounds, 2)}</span></div>
          <div className="tt-row"><span>Net</span><span className="mono">{money(h.net)}</span></div>
        </Tooltip>
      )}
      <div className="muted small">Hi-Lo true count (exact) at bet time · edge = net ÷ initial bets · faded bars have under {MIN_RELIABLE.toLocaleString()} rounds · hover for frequency</div>
    </div>
  );
}

function Tooltip({ left, width, children }: { left: number; width: number; children: ReactNode }) {
  const flip = left > width * 0.6;
  return (
    <div className="tooltip" style={flip ? { right: width - left + 12 } : { left: left + 12 }}>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name} className="legend-item">
          <span className="swatch" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
