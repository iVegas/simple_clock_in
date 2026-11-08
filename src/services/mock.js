// Demo backend (?mock=1): same interface as google-auth + picker + sheets, backed by a fake
// spreadsheet in localStorage. Emulates the Sheets behaviour the app relies on:
// USER_ENTERED parsing, formula results, serial dates, grid limits, checkbox booleans.
// Set localStorage['clockin.mock.offline'] = '1' (or go offline) to simulate network failure.
import { reactive } from 'vue';
import { ApiError } from './errors.js';
import { readJSON, writeJSON, sleep, uid } from './util.js';
import { isoToSerial } from '../domain/ledger.js';
import { localDateKey } from '../domain/time.js';

const DATA_KEY = 'clockin.mock.data';
const AUTH_KEY = 'clockin.mock.auth';
const DEMO_ID = 'demo-timesheet';

const daysAgo = (n) => isoToSerial(localDateKey(Date.now() - n * 86_400_000));

function seed() {
  const header = ['Date', 'Hours', 'USD/hour', 'sum', 'paid', 'comment'];
  const legacy = [
    header,
    [daysAgo(45), 6, 40, '=B2*C2', true, 'Onboarding'],
    [daysAgo(44), 7.5, 40, '=B3*C3', true],
    [daysAgo(30), 5, 40, '=B4*C4', false],
    [daysAgo(20), 4, 40, '=B5*C5', daysAgo(10)],
    [daysAgo(9), 3.25, 45, '=B6*C6', false, 'Rate change'],
    [daysAgo(2), 2, 45, '=B7*C7', ''],
  ];
  return {
    spreadsheets: {
      [DEMO_ID]: {
        title: 'Demo timesheet',
        locale: 'en_GB',
        tabs: [
          // rowCount equals the data size, so the next new day must grow the grid.
          { sheetId: 101, title: 'Legacy', rowCount: legacy.length, cells: legacy },
          { sheetId: 102, title: 'Empty', rowCount: 1000, cells: [] },
          { sheetId: 103, title: 'Wrong layout', rowCount: 1000, cells: [['Day', 'Time', 'Rate', 'Total', 'Status'], [daysAgo(1), 2, 30, 60, 'open']] },
        ],
      },
    },
  };
}

export function resetMockData() {
  writeJSON(DATA_KEY, seed());
}

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RANGE_RE = /^'((?:[^']|'')*)'!([A-Z])(\d+)(?::([A-Z])(\d+)?)?$/;

function parseRange(range) {
  const m = RANGE_RE.exec(range);
  if (!m) throw new ApiError('bad-request', `Unable to parse range: ${range}`);
  return {
    title: m[1].replace(/''/g, "'"),
    c1: COLS.indexOf(m[2]), r1: Number(m[3]) - 1,
    c2: m[4] ? COLS.indexOf(m[4]) : COLS.indexOf(m[2]),
    r2: m[4] ? (m[5] ? Number(m[5]) - 1 : Infinity) : Number(m[3]) - 1,
  };
}

/** Value as typed by a user (valueInputOption=USER_ENTERED). */
function userEntered(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1); // forced text
  if (v.startsWith('=')) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return isoToSerial(v);
  if (/^(TRUE|FALSE)$/i.test(v)) return v.toUpperCase() === 'TRUE';
  if (v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return v;
}

function evaluate(cells, v, depth = 0) {
  if (typeof v !== 'string' || !v.startsWith('=')) return v ?? '';
  const m = /^=([A-Z])(\d+)\*([A-Z])(\d+)$/.exec(v);
  if (!m || depth > 3) return 0;
  const get = (c, r) => Number(evaluate(cells, cells[Number(r) - 1]?.[COLS.indexOf(c)], depth + 1)) || 0;
  return get(m[1], m[2]) * get(m[3], m[4]);
}

/** sortRange on whole rows. Like Sheets, a formula that refers to its own row follows the row. */
function sortRows(tab, { range, sortSpecs }) {
  const start = range.startRowIndex ?? 0;
  const end = Math.min(range.endRowIndex ?? Infinity, tab.cells.length);
  if (end <= start) return;
  const rows = tab.cells.slice(start, end).map((cells, i) => ({ cells: cells ?? [], from: start + i + 1 }));
  const value = (row, col) => evaluate(tab.cells, row.cells[col]);
  rows.sort((a, b) => {
    for (const { dimensionIndex: col, sortOrder } of sortSpecs) {
      const [x, y] = [value(a, col), value(b, col)];
      if (x === '' || y === '') { if (x !== y) return x === '' ? 1 : -1; continue; } // blanks always last
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      if (cmp) return sortOrder === 'DESCENDING' ? -cmp : cmp;
    }
    return 0;
  });
  rows.forEach((row, i) => {
    const to = start + i + 1;
    tab.cells[to - 1] = row.cells.map((v) => (typeof v === 'string' && v.startsWith('=')
      ? v.replace(/([A-Z])(\d+)/g, (m, c, r) => (Number(r) === row.from ? `${c}${to}` : m)) : v));
  });
}

export function createMockBackend() {
  const db = () => readJSON(DATA_KEY) ?? (resetMockData(), readJSON(DATA_KEY));
  const save = (data) => writeJSON(DATA_KEY, data);

  async function network() {
    await sleep(150);
    if (!navigator.onLine || localStorage.getItem('clockin.mock.offline') === '1') {
      throw new ApiError('network', 'Network request failed (demo offline)');
    }
  }

  function spreadsheet(data, id) {
    const s = data.spreadsheets[id];
    if (!s) throw new ApiError('not-found', 'Requested entity was not found.', { status: 404 });
    return s;
  }

  function tabBy(s, pred, label) {
    const tab = s.tabs.find(pred);
    if (!tab) throw new ApiError('bad-request', `Unable to find sheet ${label}`);
    return tab;
  }

  const meta = (id, s) => ({
    id, title: s.title, locale: s.locale,
    tabs: s.tabs.map((t, index) => ({
      sheetId: t.sheetId, title: t.title, index, rowCount: t.rowCount, columnCount: 26, basicFilter: t.basicFilter ?? null,
    })),
  });

  // --- auth -------------------------------------------------------------------
  const saved = readJSON(AUTH_KEY, {});
  const authState = reactive({ email: saved.email ?? '', accessToken: saved.accessToken ?? '', expiresAt: saved.expiresAt ?? 0 });
  const hasValidToken = () => !!authState.accessToken && authState.expiresAt - 60_000 > Date.now();
  const auth = {
    state: authState,
    preload: async () => {},
    hasValidToken,
    async getToken({ interactive = false } = {}) {
      if (hasValidToken()) return authState.accessToken;
      if (!interactive) throw new ApiError('auth-required');
      await sleep(300); // "popup"
      Object.assign(authState, { email: 'demo@example.com', accessToken: `mock-${uid()}`, expiresAt: Date.now() + 3_600_000 });
      writeJSON(AUTH_KEY, { ...authState });
      return authState.accessToken;
    },
    invalidate() {
      Object.assign(authState, { accessToken: '', expiresAt: 0 });
      writeJSON(AUTH_KEY, { ...authState });
    },
    signOut() {
      Object.assign(authState, { email: '', accessToken: '', expiresAt: 0 });
      writeJSON(AUTH_KEY, null);
    },
  };

  // --- picker -----------------------------------------------------------------
  const picker = {
    preload: async () => {},
    async pickSpreadsheet() {
      await auth.getToken({ interactive: true });
      const data = db();
      if (!data.spreadsheets[DEMO_ID]) {
        data.spreadsheets[DEMO_ID] = seed().spreadsheets[DEMO_ID];
        save(data);
      }
      return { id: DEMO_ID, title: data.spreadsheets[DEMO_ID].title };
    },
  };

  // --- sheets -----------------------------------------------------------------
  const sheets = {
    async getMeta(id, opts) {
      await auth.getToken(opts);
      await network();
      return meta(id, spreadsheet(db(), id));
    },

    async getValues(id, range, opts) {
      await auth.getToken(opts);
      await network();
      const { title, c1, r1, c2, r2 } = parseRange(range);
      const tab = tabBy(spreadsheet(db(), id), (t) => t.title === title, title);
      const rows = [];
      for (let r = r1; r <= Math.min(r2, tab.cells.length - 1); r++) {
        const row = [];
        for (let c = c1; c <= c2; c++) row.push(evaluate(tab.cells, tab.cells[r]?.[c]));
        while (row.length && row.at(-1) === '') row.pop(); // the API trims trailing empty cells
        rows.push(row);
      }
      while (rows.length && !rows.at(-1).length) rows.pop(); // ...and trailing empty rows
      return rows;
    },

    async writeCells(id, data, opts) {
      await auth.getToken(opts);
      await network();
      const all = db();
      const s = spreadsheet(all, id);
      for (const { range, values } of data) {
        const { title, c1, r1 } = parseRange(range);
        const tab = tabBy(s, (t) => t.title === title, title);
        values.forEach((row, dr) => row.forEach((v, dc) => {
          const r = r1 + dr;
          if (r >= tab.rowCount) throw new ApiError('bad-request', `Range (${range}) exceeds grid limits. Max rows: ${tab.rowCount}`);
          (tab.cells[r] ??= [])[c1 + dc] = userEntered(v);
        }));
      }
      save(all);
      return {};
    },

    async batchUpdate(id, requests, opts) {
      await auth.getToken(opts);
      await network();
      const all = db();
      const s = spreadsheet(all, id);
      for (const req of requests) {
        if (req.appendDimension) {
          tabBy(s, (t) => t.sheetId === req.appendDimension.sheetId, req.appendDimension.sheetId).rowCount += req.appendDimension.length;
        } else if (req.deleteDimension) {
          const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
          const tab = tabBy(s, (t) => t.sheetId === sheetId, sheetId);
          const n = endIndex - startIndex;
          tab.cells.splice(startIndex, n);
          tab.rowCount -= n;
          // Formulas below the removed rows follow them up (=B7*C7 -> =B6*C6), like Sheets does.
          const shift = (f) => f.replace(/([A-Z])(\d+)/g, (m, c, r) => (Number(r) > endIndex ? `${c}${Number(r) - n}` : m));
          for (const row of tab.cells) row?.forEach((v, c) => { if (typeof v === 'string' && v.startsWith('=')) row[c] = shift(v); });
        } else if (req.setBasicFilter) {
          const { filter } = req.setBasicFilter;
          tabBy(s, (t) => t.sheetId === filter.range.sheetId, filter.range.sheetId).basicFilter = filter; // hiding rows: display only
        } else if (req.clearBasicFilter) {
          delete tabBy(s, (t) => t.sheetId === req.clearBasicFilter.sheetId, req.clearBasicFilter.sheetId).basicFilter;
        } else if (req.sortRange) {
          sortRows(tabBy(s, (t) => t.sheetId === req.sortRange.range.sheetId, req.sortRange.range.sheetId), req.sortRange);
        } else if (req.updateCells) {
          const u = req.updateCells;
          const sheetId = u.start?.sheetId ?? u.range.sheetId;
          const tab = tabBy(s, (t) => t.sheetId === sheetId, sheetId);
          const r0 = u.start?.rowIndex ?? u.range.startRowIndex;
          const c0 = u.start?.columnIndex ?? u.range.startColumnIndex;
          if (!u.fields.split(',').includes('userEnteredValue')) continue;
          u.rows.forEach((row, dr) => row.values.forEach((cell, dc) => {
            const v = cell.userEnteredValue;
            const value = v ? (v.stringValue ?? v.numberValue ?? v.boolValue ?? v.formulaValue) : undefined;
            (tab.cells[r0 + dr] ??= [])[c0 + dc] = value;
          }));
        }
        // updateSheetProperties / repeatCell only affect formatting: nothing to emulate.
      }
      save(all);
      return {};
    },

    async create({ title, tabTitle }, opts) {
      await auth.getToken(opts);
      await network();
      const all = db();
      const id = `mock-${uid()}`;
      all.spreadsheets[id] = { title, locale: 'en_GB', tabs: [{ sheetId: 0, title: tabTitle, rowCount: 1000, cells: [] }] };
      save(all);
      return meta(id, all.spreadsheets[id]);
    },
  };

  return { auth, picker, sheets };
}
