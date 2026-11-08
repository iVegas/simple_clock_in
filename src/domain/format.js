// Display formatting with Intl. The locale follows the chosen UI language (set by src/i18n);
// until then (and in tests) it is the browser/runtime default.
import { round2 } from './time.js';

let locale; // undefined = runtime default
const formats = new Map();
const numberFormat = (opts) => {
  const key = `${locale}|${JSON.stringify(opts)}`;
  if (!formats.has(key)) formats.set(key, new Intl.NumberFormat(locale, opts));
  return formats.get(key);
};

/** BCP 47 tag ("uk", "en-GB") used by every formatter below. */
export function setFormatLocale(tag) {
  locale = tag || undefined;
}

/** 1.5 -> "1.5 hr" / "1,5 год" / "1,5 Std." (localized unit and decimal separator) */
export function formatHours(hours) {
  return numberFormat({ style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 2 }).format(round2(hours || 0));
}

/** 45 -> "45", 12.5 -> "12.5" */
export function formatNumber(n) {
  return numberFormat({ maximumFractionDigits: 2 }).format(Number(n) || 0);
}

/** Uses Intl currency formatting for ISO codes ("USD"), plain "12.50 €" otherwise. */
export function formatMoney(amount, currency = '') {
  const n = Number(amount) || 0;
  const code = String(currency).trim();
  if (/^[A-Za-z]{3}$/.test(code)) {
    try {
      return numberFormat({ style: 'currency', currency: code.toUpperCase() }).format(n);
    } catch { /* not a known ISO code: fall through */ }
  }
  const plain = numberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return code ? `${plain} ${code}` : plain;
}

const dateOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** "2026-11-08" -> "Sun, 8 Nov" (year added when not the current year) */
export function formatDay(iso) {
  if (!iso) return '—';
  const date = dateOf(iso);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(locale, opts);
}

/** "2026-11-08" -> "Sunday, 8 November 2026" */
export function formatDayLong(iso) {
  if (!iso) return '—';
  return dateOf(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "2026-11" -> "November 2026" */
export function formatMonth(ym) {
  return dateOf(`${ym}-01`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** Timestamp -> "09:41" */
export function formatTime(ms) {
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** ["a", "b", "c"] -> "a, b and c" (localized conjunction) */
export function formatList(items) {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);
}

/** 900000 -> "15 min", 5400000 -> "1 hr, 30 min" (whole minutes; Intl.DurationFormat when available) */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 60_000));
  const parts = { hours: Math.floor(total / 60), minutes: total % 60 };
  if (!parts.hours) delete parts.hours;
  else if (!parts.minutes) delete parts.minutes;
  if (typeof Intl.DurationFormat === 'function') {
    const zero = parts.hours === undefined ? { minutesDisplay: 'always' } : {}; // "0 min", not ""
    return new Intl.DurationFormat(locale, { style: 'short', ...zero }).format(parts);
  }
  const unit = (n, u) => numberFormat({ style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  return [parts.hours !== undefined && unit(parts.hours, 'hour'), parts.minutes !== undefined && unit(parts.minutes, 'minute')]
    .filter(Boolean).join(' ');
}
