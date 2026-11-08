import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, setFormatLocale } from '../src/domain/format.js';

test('formatDuration shows whole hours and minutes in the chosen language', () => {
  setFormatLocale('en');
  assert.equal(formatDuration(15 * 60_000), '15 min');
  assert.equal(formatDuration(60 * 60_000), '1 hr');
  assert.match(formatDuration(90 * 60_000), /^1 hr,? 30 min$/);
  assert.equal(formatDuration(0), '0 min');
  setFormatLocale('uk');
  assert.match(formatDuration(8 * 3_600_000 + 5 * 60_000), /8 год.*5 хв/);
  setFormatLocale(undefined);
});
