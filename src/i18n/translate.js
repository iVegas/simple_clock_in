// Message lookup, plurals and {placeholder} interpolation. Pure (tested in tests/i18n.test.js).
//
// Messages are grouped one level deep ("report.dueNow"). A plural message is an object keyed by
// Intl.PluralRules category ({ one, few, many, other }) and is chosen by params.count.

const rules = new Map();
const pluralRules = (locale) => {
  if (!rules.has(locale)) rules.set(locale, new Intl.PluralRules(locale));
  return rules.get(locale);
};

export const isPlural = (v) => !!v && typeof v === 'object' && typeof v.other === 'string';

export function lookup(messages, key) {
  let v = messages;
  for (const part of key.split('.')) v = v?.[part];
  return typeof v === 'string' || isPlural(v) ? v : undefined;
}

/**
 * @param {object} messages current language
 * @param {object} fallback English (used for keys missing in `messages`)
 * @param {string} locale  plural rules locale
 * @returns {string} the key itself when no language has it
 */
export function translate(messages, fallback, locale, key, params = {}) {
  let msg = lookup(messages, key) ?? lookup(fallback, key) ?? key;
  if (isPlural(msg)) msg = msg[pluralRules(locale).select(Number(params.count) || 0)] ?? msg.other;
  return msg.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m));
}
