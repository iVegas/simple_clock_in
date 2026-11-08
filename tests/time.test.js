import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR_MS, roundUpToUnit, canClockOut, msUntilClockOut, formatElapsed, formatCountdown,
  localDateKey, round2, isValidUnit, recordedHours, roundingOf, reminderDue, reminderOf,
} from '../src/domain/time.js';

const MIN = 60_000;
const SEC = 1000;

test('roundUpToUnit rounds up to the next multiple of the unit', () => {
  assert.equal(roundUpToUnit(65 * MIN, 0.25), 1.25); // 1h05m -> 1.25
  assert.equal(roundUpToUnit(61 * MIN, 0.5), 1.5);
  assert.equal(roundUpToUnit(46 * MIN, 0.75), 1.5);
  assert.equal(roundUpToUnit(61 * MIN, 1), 2);
  assert.equal(roundUpToUnit(121 * MIN, 2), 4);
});

test('roundUpToUnit keeps exact multiples (with 1 s slack)', () => {
  assert.equal(roundUpToUnit(60 * MIN, 0.25), 1);
  assert.equal(roundUpToUnit(60 * MIN + 1 * SEC, 0.25), 1); // within slack
  assert.equal(roundUpToUnit(60 * MIN + 1500, 0.25), 1); // sub-second noise
  assert.equal(roundUpToUnit(60 * MIN + 2 * SEC, 0.25), 1.25); // beyond slack
  assert.equal(roundUpToUnit(2 * HOUR_MS, 2), 2);
});

test('roundUpToUnit records at least one unit', () => {
  assert.equal(roundUpToUnit(0, 0.25), 0.25);
  assert.equal(roundUpToUnit(5 * MIN, 1), 1);
});

test('roundUpToUnit supports custom units', () => {
  assert.equal(roundUpToUnit(100 * MIN, 1.5), 3); // 1h40m with 1.5h unit
  assert.equal(roundUpToUnit(90 * MIN, 1.5), 1.5);
  assert.equal(roundUpToUnit(7 * MIN, 0.1), 0.2); // 6-minute unit
  assert.equal(roundUpToUnit(30 * MIN, 0.1), 0.5);
});

test('roundUpToUnit rejects invalid units', () => {
  assert.throws(() => roundUpToUnit(MIN, 0), RangeError);
  assert.throws(() => roundUpToUnit(MIN, -1), RangeError);
  assert.throws(() => roundUpToUnit(MIN, NaN), RangeError);
  assert.equal(isValidUnit(0.0001), false); // rounds to 0 seconds
  assert.equal(isValidUnit(0.25), true);
});

test('canClockOut becomes true exactly when the unit is reached', () => {
  const start = 1_000_000;
  assert.equal(canClockOut(start, start + 15 * MIN - 1, 0.25), false);
  assert.equal(canClockOut(start, start + 15 * MIN, 0.25), true);
  assert.equal(canClockOut(start, start + 3 * HOUR_MS, 2), true);
  assert.equal(canClockOut(start, start + HOUR_MS, 2), false);
  assert.equal(msUntilClockOut(start, start + 10 * MIN, 0.25), 5 * MIN);
  assert.equal(msUntilClockOut(start, start + 20 * MIN, 0.25), 0);
  assert.equal(canClockOut(start, start + HOUR_MS, 0), false);
});

test('a session that just reached the unit records exactly one unit', () => {
  const start = 0;
  const now = start + 30 * MIN;
  assert.equal(canClockOut(start, now, 0.5), true);
  assert.equal(roundUpToUnit(now - start, 0.5), 0.5);
});

test('formatting helpers', () => {
  assert.equal(formatElapsed(3_725_000), '01:02:05');
  assert.equal(formatElapsed(-5), '00:00:00');
  assert.equal(formatCountdown(754_000), '12:34');
  assert.equal(formatCountdown(500), '00:01');
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(1.005), 1.01);
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
});

// ---------------------------------------------------------------------------
// Rounding rules + reminders

const min = (m) => m * 60_000;

test('default rule = round up to the minimum tracked time (same as roundUpToUnit)', () => {
  const clock = { unitHours: 0.25 };
  for (const ms of [min(1), min(15), min(15) + 999, min(16), min(65), min(100)]) {
    assert.equal(recordedHours(ms, clock), roundUpToUnit(ms, 0.25), `${ms} ms`);
  }
  assert.equal(roundingOf(clock).isDefault, true);
});

test('round up / nearest / down with their own step', () => {
  const up = { unitHours: 0.25, rounding: { mode: 'up', stepMinutes: 6 } };
  const nearest = { unitHours: 0.25, rounding: { mode: 'nearest', stepMinutes: 15 } };
  const down = { unitHours: 0.25, rounding: { mode: 'down', stepMinutes: 30 } };
  assert.equal(recordedHours(min(67), up), 1.2); // 67 min -> 72 min
  assert.equal(recordedHours(min(72), up), 1.2); // exact multiple stays
  assert.equal(recordedHours(min(67), nearest), 1); // 67 -> 60
  assert.equal(recordedHours(min(68), nearest), 1.25); // halves round up: 67.5+ -> 75
  assert.equal(recordedHours(min(67) + 30_000, nearest), 1.25);
  assert.equal(recordedHours(min(89), down), 1); // 89 -> 60
  assert.equal(recordedHours(min(90), down), 1.5);
});

test('no rounding records the exact time (2 decimals); never below the minimum', () => {
  const none = { unitHours: 0.25, rounding: { mode: 'none' } };
  assert.equal(recordedHours(min(77), none), 1.28);
  assert.equal(recordedHours(min(5), none), 0.25); // below the minimum -> minimum
  const down = { unitHours: 0.5, rounding: { mode: 'down', stepMinutes: 60 } };
  assert.equal(recordedHours(min(50), down), 0.5); // down to 0 h, raised to the 0.5 h minimum
});

test('roundingOf falls back to defaults for unknown values', () => {
  assert.deepEqual(roundingOf({ unitHours: 0.5, rounding: { mode: 'weird', stepMinutes: -3 } }),
    { mode: 'up', stepMinutes: null, stepHours: 0.5, isDefault: true });
  assert.equal(roundingOf({ unitHours: 0.5, rounding: { mode: 'down', stepMinutes: 10 } }).stepHours, 10 / 60);
});

test('reminders: start after, then repeat every N minutes (or once)', () => {
  const start = Date.UTC(2026, 10, 9, 8, 0);
  const at = (h, m = 0) => start + h * HOUR_MS + min(m);
  const r = { afterHours: 8, everyMinutes: 60 };
  assert.equal(reminderDue({ startedAt: start }, r, at(7, 59)), false);
  assert.equal(reminderDue({ startedAt: start }, r, at(8)), true);
  assert.equal(reminderDue({ startedAt: start, remindedAt: at(8) }, r, at(8, 59)), false);
  assert.equal(reminderDue({ startedAt: start, remindedAt: at(8) }, r, at(9)), true);
  assert.equal(reminderDue({ startedAt: start, remindedAt: at(8) }, { afterHours: 8, everyMinutes: 0 }, at(20)), false);
  assert.equal(reminderDue({ startedAt: start }, { afterHours: null, everyMinutes: 60 }, at(20)), false);
  assert.equal(reminderDue(null, r, at(20)), false);
});

test('reminderOf: defaults for clocks without the setting, explicit off is kept', () => {
  assert.deepEqual(reminderOf({}), { afterHours: 8, everyMinutes: 60 });
  assert.deepEqual(reminderOf({ reminder: { afterHours: null, everyMinutes: 60 } }), { afterHours: null, everyMinutes: 60 });
  assert.deepEqual(reminderOf({ reminder: { afterHours: 4, everyMinutes: 0 } }), { afterHours: 4, everyMinutes: 0 });
});
