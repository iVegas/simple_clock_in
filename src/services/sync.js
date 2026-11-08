// Pending-session queue: clock-outs are stored locally first, then written to the sheet.
// Nothing is lost when offline, signed out, or while the sheet structure needs fixing.
import { reactive } from 'vue';
import { store, clockById, pendingFor, removePending, activeClock } from '../state/store.js';
import { describeError } from './errors.js';
import { loadSheet, setupSheet, recordSession } from './timesheet.js';

/** Per-clock UI state: { busy, error (code), message, at }. Not persisted. */
export const syncState = reactive({});

const inflight = new Map();

const IDLE = Object.freeze({ busy: false, error: null, message: '', at: 0 });
const syncStateOf = (clockId) => (syncState[clockId] ??= { ...IDLE });

/** Read-only view for components (never mutates during render). */
export const readSyncState = (clockId) => syncState[clockId] ?? IDLE;

/**
 * Refresh the clock's sheet and flush its pending sessions.
 * @returns {Promise<{status: 'ok'|'blocked'|'not-connected', synced?: number}>}
 *   blocked = the sheet structure does not match; sessions stay queued.
 */
export function syncClock(clockId, opts = {}) {
  const current = inflight.get(clockId);
  // A background sync may not include a session queued just now (or may lack a token):
  // user-initiated syncs always run after it instead of reusing its result.
  if (current && !opts.interactive) return current;
  const next = (current ? current.catch(() => {}) : Promise.resolve())
    .then(() => run(clockId, opts))
    .finally(() => { if (inflight.get(clockId) === next) inflight.delete(clockId); });
  inflight.set(clockId, next);
  return next;
}

async function run(clockId, { interactive = false } = {}) {
  const clock = clockById(clockId);
  if (!clock?.spreadsheetId) return { status: 'not-connected' };
  const opts = { interactive };
  const st = syncStateOf(clockId);
  st.busy = true;
  try {
    let sheet = await loadSheet(clock, opts);
    if (sheet.structure.state === 'empty') {
      await setupSheet(clock.spreadsheetId, sheet.tab.sheetId, clock.currency, opts);
      sheet = await loadSheet(clock, opts);
    }

    let synced = 0;
    const items = pendingFor(clockId);
    if (items.length && sheet.structure.state !== 'ok') {
      Object.assign(st, { error: 'structure', message: 'Sheet layout needs fixing; sessions are kept on this device.' });
      return { status: 'blocked' };
    }
    for (const item of items) {
      const alreadyWritten = !!item.expect && sheet.records.some(
        (r) => r.row === item.expect.row && r.date === item.expect.date && r.hours === item.expect.hours,
      );
      if (!alreadyWritten) await recordSession(clock, sheet, item, opts);
      removePending(item.id);
      synced++;
      sheet = await loadSheet(clock, opts);
    }
    Object.assign(st, { error: null, message: '', at: Date.now() });
    return { status: 'ok', synced };
  } catch (err) {
    Object.assign(st, { error: err.code ?? 'error', message: describeError(err) });
    for (const p of pendingFor(clockId)) {
      p.attempts = (p.attempts ?? 0) + 1;
      p.lastError = st.message;
    }
    throw err;
  } finally {
    st.busy = false;
  }
}

/**
 * Background sync (no popups): clocks with pending sessions, plus the active clock
 * when its cached data is older than `maxAgeMs`.
 */
export function syncInBackground({ maxAgeMs = 5 * 60_000 } = {}) {
  const active = activeClock.value;
  const ids = new Set(store.pending.map((p) => p.clockId));
  if (active && Date.now() - (store.cache[active.id]?.fetchedAt ?? 0) > maxAgeMs) ids.add(active.id);
  return Promise.allSettled([...ids].filter((id) => clockById(id)?.spreadsheetId).map((id) => syncClock(id)));
}
