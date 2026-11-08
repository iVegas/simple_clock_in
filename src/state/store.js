// App state, persisted to localStorage and kept in sync across open windows.
import { reactive, watch, computed } from 'vue';
import { storageKey } from '../mode.js';
import { readJSON, writeJSON } from '../services/util.js';

const KEY = storageKey('v1');

/**
 * clocks:   [{ id, name, currency, rate, unitHours, spreadsheetId, spreadsheetTitle,
 *              sheetId, sheetTitle, running: {startedAt}|null, structure, createdAt }]
 * pending:  [{ id, clockId, date, hours, rate, comment?, manual?, startedAt?, endedAt?, attempts, lastError, expect }]
 * cache:    { [clockId]: { records, locale, fetchedAt } }
 */
const fresh = () => ({ clocks: [], activeClockId: null, pending: [], cache: {} });

export const store = reactive({ ...fresh(), ...readJSON(KEY, {}) });

watch(store, () => writeJSON(KEY, store), { deep: true });

// Another window/tab of the app changed the state.
window.addEventListener('storage', (e) => {
  if (e.key === KEY && e.newValue) Object.assign(store, fresh(), JSON.parse(e.newValue));
});

export const activeClock = computed(
  () => store.clocks.find((c) => c.id === store.activeClockId) ?? store.clocks[0] ?? null,
);

export const clockById = (id) => store.clocks.find((c) => c.id === id) ?? null;

export const pendingFor = (clockId) => store.pending.filter((p) => p.clockId === clockId);

export function removePending(id) {
  const i = store.pending.findIndex((p) => p.id === id);
  if (i >= 0) store.pending.splice(i, 1);
}

export function deleteClock(id) {
  store.clocks = store.clocks.filter((c) => c.id !== id);
  store.pending = store.pending.filter((p) => p.clockId !== id);
  delete store.cache[id];
  if (store.activeClockId === id) store.activeClockId = store.clocks[0]?.id ?? null;
}
