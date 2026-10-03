export const money = (n: number, digits = 0) =>
  (n < 0 ? '-$' : '$') +
  Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const signedMoney = (n: number, digits = 0) => (n > 0 ? '+' : '') + money(n, digits);

export const pct = (n: number, digits = 2) => `${n > 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`;

export const num = (n: number, digits = 1) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';

/** Fixed per-seat colors (validated categorical palette, dark-surface steps). */
export const SEAT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
