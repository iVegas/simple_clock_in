// UI language. English ships with the app (and fills any missing key); other languages are
// fetched only when chosen, and the service worker keeps just the one in use for offline use.
import { shallowReactive, markRaw } from 'vue';
import en from './locales/en.json' with { type: 'json' };
import { DEFAULT_LANGUAGE, isLanguage, matchLanguage } from './languages.js';
import { translate } from './translate.js';
import { setFormatLocale } from '../domain/format.js';

const KEY = 'clockin.language'; // device preference: 'auto' (follow the browser) or a code

export const i18n = shallowReactive({ choice: 'auto', locale: DEFAULT_LANGUAGE, messages: markRaw(en) });

/** t('report.dueNow'), t('sync.waiting', { count: 2, hours: '1.5 h' }) */
export const t = (key, params) => translate(i18n.messages, en, i18n.locale, key, params);

export const browserLanguage = () => matchLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
const resolve = (choice) => (isLanguage(choice) ? choice : browserLanguage());
const localeUrl = (code) => new URL(`./locales/${code}.json`, import.meta.url).href;

async function load(code) {
  if (code === DEFAULT_LANGUAGE) return en;
  const res = await fetch(localeUrl(code));
  if (!res.ok) throw new Error(`Language ${code}: HTTP ${res.status}`);
  return res.json();
}

function apply(code, messages) {
  Object.assign(i18n, { locale: code, messages: markRaw(messages) });
  // Numbers and dates: the browser's regional variant when it speaks this language (en-GB, pt-BR).
  setFormatLocale(navigator.languages?.find((l) => l.toLowerCase().split('-')[0] === code) ?? code);
  document.documentElement.lang = code;
  // Tell the service worker which language to keep offline; it drops the others.
  navigator.serviceWorker?.ready
    .then((reg) => reg.active?.postMessage({ type: 'LOCALE', url: code === DEFAULT_LANGUAGE ? null : localeUrl(code) }))
    .catch(() => {});
}

export async function initI18n() {
  try { i18n.choice = localStorage.getItem(KEY) || 'auto'; } catch { /* storage unavailable */ }
  const code = resolve(i18n.choice);
  try {
    apply(code, await load(code));
  } catch {
    apply(DEFAULT_LANGUAGE, en); // offline before the language was ever stored: English this time
  }
}

/** Switch language ('auto' or a code). Throws (and changes nothing) when it cannot be downloaded. */
export async function setLanguage(choice) {
  const code = resolve(choice);
  const messages = await load(code);
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* storage unavailable: applies to this session only */ }
  i18n.choice = choice;
  apply(code, messages);
}
