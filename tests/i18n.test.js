// Every language must translate exactly the English keys, keep the {placeholders}, and provide
// the plural forms its grammar needs. Adding a key to en.json fails here until all languages have it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES, matchLanguage } from '../src/i18n/languages.js';
import { translate, isPlural } from '../src/i18n/translate.js';

const dir = new URL('../src/i18n/locales/', import.meta.url);
const load = (code) => JSON.parse(readFileSync(new URL(`${code}.json`, dir), 'utf8'));
const en = load('en');

/** { "group.key": string | {plural} } */
function flatten(messages) {
  const out = {};
  for (const [group, entries] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(entries)) out[`${group}.${key}`] = value;
  }
  return out;
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const texts = (v) => (isPlural(v) ? Object.values(v) : [v]);
// Plural categories that whole counts (0..200) select in a language.
const countCategories = (code) => [...new Set(Array.from({ length: 201 }, (_, n) => new Intl.PluralRules(code).select(n)))];

test('every listed language has a file, and every file is listed', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
  assert.deepEqual(files, LANGUAGES.map((l) => l.code).sort());
});

test('English messages are well-formed', () => {
  for (const [key, value] of Object.entries(flatten(en))) {
    assert.ok(typeof value === 'string' || isPlural(value), `${key}: string or plural object expected`);
    if (isPlural(value)) assert.match(value.other, /\{count\}/, `${key}: plural messages show {count}`);
  }
});

for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) {
  test(`${code}: same keys, placeholders and plural forms as English`, () => {
    const base = flatten(en);
    const msgs = flatten(load(code));
    assert.deepEqual(Object.keys(msgs).filter((k) => !(k in base)), [], 'keys not in en.json');
    assert.deepEqual(Object.keys(base).filter((k) => !(k in msgs)), [], 'missing translations');

    for (const [key, source] of Object.entries(base)) {
      const target = msgs[key];
      assert.equal(isPlural(target), isPlural(source), `${key}: plural shape differs from English`);
      const expected = placeholders(texts(source)[0]);
      for (const text of texts(target)) {
        assert.ok(text.trim(), `${key}: empty translation`);
        assert.deepEqual([...new Set(placeholders(text))], [...new Set(expected)], `${key}: placeholders differ in "${text}"`);
      }
      if (isPlural(target)) {
        for (const cat of countCategories(code)) assert.ok(cat in target, `${key}: plural form "${cat}" missing`);
      }
    }
  });
}

test('translate: lookup, English fallback, interpolation, plurals', () => {
  const uk = { sync: { waiting: { one: '{count} запис', few: '{count} записи', many: '{count} записів', other: '{count} запису' } } };
  const base = { sync: { waiting: { one: '{count} entry', other: '{count} entries' } }, nav: { hi: 'Hi {name}' } };
  assert.equal(translate(uk, base, 'uk', 'sync.waiting', { count: 1 }), '1 запис');
  assert.equal(translate(uk, base, 'uk', 'sync.waiting', { count: 3 }), '3 записи');
  assert.equal(translate(uk, base, 'uk', 'sync.waiting', { count: 5 }), '5 записів');
  assert.equal(translate(uk, base, 'uk', 'nav.hi', { name: 'Ann' }), 'Hi Ann'); // falls back to English
  assert.equal(translate(uk, base, 'uk', 'nav.missing'), 'nav.missing');
  assert.equal(translate(base, base, 'en', 'nav.hi'), 'Hi {name}'); // missing params stay visible
});

test('matchLanguage picks the first supported browser language', () => {
  assert.equal(matchLanguage(['de-AT', 'en-US']), 'de');
  assert.equal(matchLanguage(['ja', 'uk-UA']), 'uk');
  assert.equal(matchLanguage(['ja']), 'en');
  assert.equal(matchLanguage([]), 'en');
});
