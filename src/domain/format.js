// Display formatting (locale-aware, browser default locale).
import { round2 } from './time.js';

const hoursFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** 1.5 -> "1.5 h", 2 -> "2 h", 1.25 -> "1.25 h" (decimal separator follows the browser locale) */
export function formatHours(hours) {
  return `${hoursFormat.format(round2(hours || 0))} h`;
}

/** Uses Intl currency formatting for ISO codes ("USD"), plain "12.50 €" otherwise. */
export function formatMoney(amount, currency = '') {
  const n = Number(amount) || 0;
  const code = String(currency).trim();
  if (/^[A-Za-z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code.toUpperCase() }).format(n);
    } catch { /* not a known ISO code: fall through */ }
  }
  return code ? `${n.toFixed(2)} ${code}` : n.toFixed(2);
}

/** "2026-11-08" -> "Sun, 8 Nov" (year added when not the current year) */
export function formatDay(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}

/** "2026-11" -> "November 2026" */
export function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
