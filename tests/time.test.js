import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR_MS, roundUpToUnit, canClockOut, msUntilClockOut, formatElapsed, formatCountdown,
  localDateKey, round2, isValidUnit,
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
