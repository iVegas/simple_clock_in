// Sentences shared by several views, built from translated parts.
import { t } from '../i18n/index.js';
import { roundingOf, HOUR_MS } from '../domain/time.js';
import { formatDuration } from '../domain/format.js';

/**
 * "rounded up to 15 min", "rounded to the nearest 6 min", "not rounded".
 * withMin: prefix the minimum when the rule doesn't already say it ("min 15 min, rounded down to 6 min").
 */
export function roundingText(clock, { withMin = false } = {}) {
  const { mode, stepHours, isDefault } = roundingOf(clock);
  const rule = mode === 'none' ? t('rounding.none') : t(`rounding.${mode}`, { step: formatDuration(stepHours * HOUR_MS) });
  return withMin && !isDefault ? t('rounding.withMin', { min: formatDuration(clock.unitHours * HOUR_MS), rule }) : rule;
}
