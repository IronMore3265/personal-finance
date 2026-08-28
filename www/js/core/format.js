import { SYM, TODAY } from '../data/seed.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MINUS = '−'; // true minus sign, not a hyphen

/** Currency. Whole thousands lose their decimals; small change keeps two. */
export function fmt(n, cur = 'BDT') {
  const neg = n < 0;
  const v = Math.abs(n);
  const s = v >= 1000
    ? Math.round(v).toLocaleString('en-US')
    : (Math.round(v * 100) / 100).toLocaleString('en-US');
  return (neg ? '-' : '') + (SYM[cur] || '') + s;
}

/** Signed currency, using the typographic minus the design calls for. */
export function signed(n, cur = 'BDT') {
  return (n >= 0 ? '+' : MINUS) + fmt(Math.abs(n), cur);
}

export function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

export function dayName(d) {
  const dt = new Date(d + 'T00:00:00');
  return dt.getDate() + ' ' + MONTHS[dt.getMonth()];
}

export function dueLabel(d) {
  const days = Math.round(
    (new Date(d + 'T00:00:00') - new Date(TODAY + 'T00:00:00')) / 86400000
  );
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return 'Due in ' + days + ' days';
}

/** Compact form for the donut centre, where 14px has to hold the whole month. */
export function compact(n, cur = 'BDT') {
  const s = SYM[cur] || '';
  if (n >= 100000) return s + (Math.round(n / 100) / 10).toFixed(1) + 'k';
  if (n >= 10000) return s + Math.round(n / 1000) + 'k';
  return fmt(n, cur);
}
