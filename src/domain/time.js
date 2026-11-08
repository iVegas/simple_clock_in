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

// ---------------------------------------------------------------------------
// Rounding rule (advanced clock setting). The minimum tracked time still unlocks Clock out and is
// the least an entry records; the rule rounds the duration by its own step.

export const ROUNDING_MODES = ['up', 'nearest', 'down', 'none'];
/** Step choices in minutes; no step = the clock's minimum tracked time. */
export const ROUNDING_STEPS = [1, 5, 6, 10, 12, 15, 20, 30, 60];

/** Clock's rounding rule with defaults (up, step = minimum tracked time: the original behaviour). */
export function roundingOf({ unitHours, rounding } = {}) {
  const mode = ROUNDING_MODES.includes(rounding?.mode) ? rounding.mode : 'up';
  const stepMinutes = Number(rounding?.stepMinutes) > 0 ? Number(rounding.stepMinutes) : null;
  return { mode, stepMinutes, stepHours: stepMinutes ? stepMinutes / 60 : unitHours, isDefault: mode === 'up' && !stepMinutes };
}

/**
 * Hours an entry of this duration records under the clock's rule.
 * up: next multiple of the step (1 s slack keeps exact multiples); nearest: halves round up;
 * down: previous multiple; none: exact (2 decimals = 36 s). Never less than the minimum tracked time.
 * @param {{unitHours: number, rounding?: {mode, stepMinutes}}} clock
 */
export function recordedHours(elapsedMs, clock) {
  if (!isValidUnit(clock?.unitHours)) throw new RangeError('Minimum tracked time must be greater than 0');
  const { mode, stepHours } = roundingOf(clock);
  const sec = Math.max(0, Math.floor(elapsedMs / 1000));
  let hours;
  if (mode === 'none') {
    hours = round2(sec / 3600);
  } else {
    const stepSec = Math.max(1, Math.round(stepHours * 3600));
    const units = mode === 'up' ? Math.ceil(Math.max(0, sec - SLACK_SECONDS) / stepSec)
      : mode === 'down' ? Math.floor(sec / stepSec)
        : Math.floor(sec / stepSec + 0.5);
    hours = round2((units * stepSec) / 3600);
  }
  return Math.max(round2(clock.unitHours), hours);
}

// ---------------------------------------------------------------------------
// Reminder for a clock left running (advanced clock setting).

export const REMINDER_AFTER_HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
export const REMINDER_EVERY_MINUTES = [15, 30, 60, 120];
export const DEFAULT_REMINDER = Object.freeze({ afterHours: 8, everyMinutes: 60 });

/** Clock's reminder: afterHours null = off; everyMinutes 0 = remind once. */
export function reminderOf(clock) {
  const r = clock?.reminder;
  if (!r) return { ...DEFAULT_REMINDER };
  return {
    afterHours: Number(r.afterHours) > 0 ? Number(r.afterHours) : null,
    everyMinutes: Number(r.everyMinutes) > 0 ? Number(r.everyMinutes) : 0,
  };
}

/**
 * Is a reminder due for this running session now?
 * @param {{startedAt: number, remindedAt?: number}|null} running
 */
export function reminderDue(running, reminder, now) {
  if (!running || !reminder?.afterHours) return false;
  if (now - running.startedAt < reminder.afterHours * HOUR_MS) return false;
  if (!running.remindedAt) return true;
  return reminder.everyMinutes > 0 && now - running.remindedAt >= reminder.everyMinutes * 60_000;
}
