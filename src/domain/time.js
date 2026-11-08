// Pure time helpers: no DOM, no Vue. Unit-tested in tests/time.test.js.

export const HOUR_MS = 3_600_000;

/** Seconds of tolerance so a session of exactly N units is not bumped to N+1. */
export const SLACK_SECONDS = 1;

/** Preset choices for "minimum tracked time" (hours). */
export const UNIT_PRESETS = [0.25, 0.5, 0.75, 1, 2];

export const pad2 = (n) => String(n).padStart(2, '0');

/** Normalize to 2 decimals without float noise (0.1 + 0.2 -> 0.3). */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Local calendar date (YYYY-MM-DD) of a timestamp. */
export function localDateKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 3725000 -> "01:02:05" */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(total % 60)}`;
}

/** 754000 -> "12:34" (minutes:seconds, hours folded into minutes) */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function isValidUnit(unitHours) {
  return Number.isFinite(unitHours) && Math.round(unitHours * 3600) > 0;
}

/**
 * Round a tracked duration UP to the next multiple of the minimum tracked time.
 * Integer-second math avoids float drift; at least one unit is always recorded.
 * @returns hours, normalized to 2 decimals
 */
export function roundUpToUnit(elapsedMs, unitHours) {
  if (!isValidUnit(unitHours)) throw new RangeError('Minimum tracked time must be greater than 0');
  const unitSec = Math.round(unitHours * 3600);
  const sec = Math.max(0, Math.floor(elapsedMs / 1000) - SLACK_SECONDS);
  const units = Math.max(1, Math.ceil(sec / unitSec));
  return round2((units * unitSec) / 3600);
}

/** Milliseconds until clock-out becomes available (0 when it already is). */
export function msUntilClockOut(startedAt, now, unitHours) {
  return Math.max(0, startedAt + unitHours * HOUR_MS - now);
}

/** Clock-out is allowed once the elapsed time reaches the minimum tracked time. */
export function canClockOut(startedAt, now, unitHours) {
  return isValidUnit(unitHours) && msUntilClockOut(startedAt, now, unitHours) === 0;
}
