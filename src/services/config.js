// Google API configuration: config.js (set once by whoever deploys the app),
// optionally overridden per device from the in-app setup assistant.
import { reactive } from 'vue';
import { readJSON, writeJSON } from './util.js';

const OVERRIDE_KEY = 'clockin.config';
export const CONFIG_FIELDS = ['googleClientId', 'googleApiKey', 'googleAppId'];

function compute() {
  const base = window.CLOCKIN_CONFIG ?? {};
  const override = readJSON(OVERRIDE_KEY, {});
  return Object.fromEntries(CONFIG_FIELDS.map((f) => [f, String(override[f] || base[f] || '').trim()]));
}

export const config = reactive(compute());

export const isConfigured = () => CONFIG_FIELDS.every((f) => config[f]);

export const hasOverride = () => !!readJSON(OVERRIDE_KEY);

export function saveOverride(values) {
  writeJSON(OVERRIDE_KEY, Object.fromEntries(CONFIG_FIELDS.map((f) => [f, String(values[f] ?? '').trim()])));
  Object.assign(config, compute());
}

export function clearOverride() {
  writeJSON(OVERRIDE_KEY, null);
  Object.assign(config, compute());
}
