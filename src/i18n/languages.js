// Languages the UI is translated into. To add one: create locales/<code>.json with every key of
// locales/en.json and list it here (tests/i18n.test.js checks both). Only English ships with the
// app; the others are downloaded when chosen, and only the one in use is kept on the device.
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' },
  { code: 'pl', name: 'Polski' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
];

export const DEFAULT_LANGUAGE = 'en';

export const isLanguage = (code) => LANGUAGES.some((l) => l.code === code);

/** First supported language among the user's preferred ones ("de-AT" -> "de"), else English. */
export function matchLanguage(preferred = []) {
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}
