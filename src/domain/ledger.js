// Timesheet business rules: sheet structure, cell parsing, write planning, report aggregation.
// Pure functions only (no DOM, no network, no Vue). Unit-tested in tests/ledger.test.js.
//
// Expected sheet layout (row 1 = header):
//   A Date | B Hours | C {currency}/hour | D sum (=B*C) | E paid | F comment (optional)
import { round2 } from './time.js';

export const COL = { date: 0, hours: 1, rate: 2, sum: 3, paid: 4, comment: 5 };
export const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** Columns read from the sheet (A1 notation, without the tab name). */
export const DATA_RANGE = 'A1:F';

const DAY_MS = 86_400_000;
const SHEETS_EPOCH = Date.UTC(1899, 11, 30); // Google Sheets / Excel serial day 0
const DATE_FORMAT = { type: 'DATE', pattern: 'yyyy-mm-dd' };
const NUMBER_FORMAT = { type: 'NUMBER', pattern: '0.00' };

export const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
const RATE_HEADER = /^(.+?)\s*\/\s*h(?:ou)?r?$/i;

// ---------------------------------------------------------------------------
// Structure

export function expectedHeader(currency) {
  return ['Date', 'Hours', `${String(currency ?? '').trim()}/hour`, 'sum', 'paid', 'comment'];
}

/**
 * Compare the sheet's header row with the structure expected for a clock's settings.
 * @param {Array<Array<*>>} values rows as returned by values.get (may be ragged)
 * @returns {{state: 'empty'|'ok'|'mismatch', issues: Array, readable: boolean}}
 *   readable: rows can still be interpreted (only the currency differs).
 */
export function validateStructure(values, currency) {
  const rows = values ?? [];
  if (rows.every((row) => (row ?? []).every(isBlank))) return { state: 'empty', issues: [], readable: false };

  const header = rows[0] ?? [];
  const expected = expectedHeader(currency);
  const issues = [];
  const found = (i) => (isBlank(header[i]) ? '' : String(header[i]).trim());

  for (const i of [COL.date, COL.hours, COL.rate, COL.sum, COL.paid]) {
    if (i === COL.rate) {
      const m = RATE_HEADER.exec(found(i));
      if (m && norm(m[1]) === norm(currency)) continue;
      issues.push({
        column: COLUMN_LETTERS[i], expected: expected[i], found: found(i),
        ...(m ? { kind: 'currency', sheetCurrency: m[1].trim() } : {}),
      });
    } else if (norm(header[i]) !== norm(expected[i])) {
      issues.push({ column: COLUMN_LETTERS[i], expected: expected[i], found: found(i) });
    }
  }
  if (found(COL.comment) && !/^comments?$/i.test(found(COL.comment))) {
    issues.push({ column: 'F', expected: expected[COL.comment], found: found(COL.comment), optional: true });
  }

  // Issues are data ({column, expected, found, kind?, optional?}); the UI words them per language.
  return {
    state: issues.length ? 'mismatch' : 'ok',
    issues,
    readable: issues.every((i) => i.kind === 'currency'),
  };
}

/** Sheets batchUpdate requests that set up an empty tab for a clock. */
export function setupRequests(sheetId, currency) {
  const formatColumns = (start, end, numberFormat) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: start, endColumnIndex: end },
      cell: { userEnteredFormat: { numberFormat } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
  return [
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [{
          values: expectedHeader(currency).map((v) => ({
            userEnteredValue: { stringValue: v },
            userEnteredFormat: { textFormat: { bold: true } },
          })),
        }],
        fields: 'userEnteredValue,userEnteredFormat.textFormat.bold',
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    formatColumns(COL.date, COL.date + 1, DATE_FORMAT),
    formatColumns(COL.hours, COL.sum + 1, NUMBER_FORMAT),
    formatColumns(COL.paid, COL.paid + 1, DATE_FORMAT),
  ];
}

// ---------------------------------------------------------------------------
// Cells

export function serialToISO(serial) {
  return new Date(SHEETS_EPOCH + Math.floor(serial) * DAY_MS).toISOString().slice(0, 10);
}

export function isoToSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - SHEETS_EPOCH) / DAY_MS);
}

function isoFromParts(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const monthFirst = (locale) => /^en[_-]US/i.test(locale ?? '');

/**
 * Date cell -> "YYYY-MM-DD" | null.
 * Accepts serial numbers (real date cells) and text: ISO, d.m.yyyy, a/b/yyyy (order by locale).
 */
export function parseDateCell(value, locale = '') {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? serialToISO(value) : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s))) return isoFromParts(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) return isoFromParts(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    return monthFirst(locale) ? isoFromParts(+m[3], +m[1], +m[2]) : isoFromParts(+m[3], +m[2], +m[1]);
  }
  return null;
}

/**
 * "paid" cell -> status. Supports legacy booleans (checkboxes) and payout dates.
 * Unknown text counts as unpaid (shown with its raw value) so money is never hidden.
 * @returns {{paid: boolean, date: string|null, legacy: boolean, raw: string|null}}
 */
export function parsePaid(value, locale = '') {
  const status = (paid, extra = {}) => ({ paid, date: null, legacy: false, raw: null, ...extra });
  if (value === true) return status(true, { legacy: true });
  if (value === false || isBlank(value)) return status(false);
  if (typeof value === 'number') return value > 0 ? status(true, { date: serialToISO(value) }) : status(false);
  const s = String(value).trim();
  if (/^(true|yes|paid|✓|✔)$/i.test(s)) return status(true, { legacy: true });
  if (/^(false|no)$/i.test(s)) return status(false);
  const date = parseDateCell(s, locale);
  return date ? status(true, { date }) : status(false, { raw: s });
}

export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Data rows -> records. Rows without a valid date (blank rows, totals rows) are skipped.
 * `row` is the 1-based sheet row number.
 */
export function parseRecords(values, locale = '') {
  const records = [];
  for (let i = 1; i < (values?.length ?? 0); i++) {
    const row = values[i] ?? [];
    const date = parseDateCell(row[COL.date], locale);
    if (!date) continue;
    const hours = toNumber(row[COL.hours]) ?? 0;
    const rate = toNumber(row[COL.rate]);
    const sum = toNumber(row[COL.sum]) ?? (rate !== null ? round2(hours * rate) : 0);
    records.push({
      row: i + 1,
      date,
      hours,
      rate,
      sum,
      paid: parsePaid(row[COL.paid], locale),
      comment: isBlank(row[COL.comment]) ? '' : String(row[COL.comment]),
    });
  }
  return records;
}

/** Last 1-based row that has a Date or Hours value (the header counts as row 1). */
export function lastDataRow(values) {
  for (let i = (values?.length ?? 0) - 1; i > 0; i--) {
    const row = values[i] ?? [];
    if (!isBlank(row[COL.date]) || !isBlank(row[COL.hours])) return i + 1;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Writes

/**
 * Plan the cell writes for one entry (a clocked session or a manual entry).
 * Unpaid row for the date -> Hours = existing + entry; otherwise a new row after the last one.
 * (A day already marked paid is never changed: later work that day gets its own unpaid row.)
 * The rate column always gets the entry's rate, and sum is (re)written as =B*C.
 * A comment is appended to the day's comment ("; "-separated).
 * @returns {{row, isNew, newHours, cells: Array<{cell, value}>, appendRows: number}}
 */
export function planSession({ values, rowCount = Infinity, date, hours, rate, comment = '', locale = '' }) {
  const existing = parseRecords(values, locale).find((r) => r.date === date && !r.paid.paid);
  const row = existing ? existing.row : lastDataRow(values) + 1;
  const newHours = round2((existing?.hours ?? 0) + hours);
  const cells = [];
  if (!existing) cells.push({ cell: `A${row}`, value: date });
  cells.push(
    { cell: `B${row}`, value: newHours },
    { cell: `C${row}`, value: rate },
    { cell: `D${row}`, value: `=B${row}*C${row}` },
  );
  const note = String(comment ?? '').trim();
  if (note) {
    // Leading apostrophe: Sheets keeps the text as typed (never a number, date or formula).
    cells.push({ cell: `F${row}`, value: `'${existing?.comment ? `${existing.comment}; ${note}` : note}` });
  }
  return { row, isNew: !existing, newHours, cells, appendRows: Math.max(0, row - rowCount) };
}

/** Remove a whole row from the tab (rows below move up; their =B*C formulas follow). */
export function deleteRowRequest(sheetId, row) {
  return { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } };
}

/** Does a freshly read [date, hours] pair still describe the record (guards writes against moved rows)? */
export function rowMatches(cells, record, locale = '') {
  return parseDateCell(cells?.[COL.date], locale) === record.date && (toNumber(cells?.[COL.hours]) ?? 0) === record.hours;
}

/** Write a payout date into "paid". Also drops a legacy checkbox validation so a date is accepted. */
export function markPaidRequest(sheetId, row, isoDate) {
  return {
    updateCells: {
      range: paidCell(sheetId, row),
      rows: [{
        values: [{
          userEnteredValue: { numberValue: isoToSerial(isoDate) },
          userEnteredFormat: { numberFormat: DATE_FORMAT },
        }],
      }],
      fields: 'userEnteredValue,userEnteredFormat.numberFormat,dataValidation',
    },
  };
}

/** Clear "paid" (undo). An empty cell means unpaid. */
export function clearPaidRequest(sheetId, row) {
  return { updateCells: { range: paidCell(sheetId, row), rows: [{ values: [{}] }], fields: 'userEnteredValue' } };
}

function paidCell(sheetId, row) {
  return { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: COL.paid, endColumnIndex: COL.paid + 1 };
}

// ---------------------------------------------------------------------------
// Report

export function totalsOf(records) {
  return {
    amount: round2(records.reduce((a, r) => a + (r.sum || 0), 0)),
    hours: round2(records.reduce((a, r) => a + (r.hours || 0), 0)),
    count: records.length,
  };
}

export function hoursOn(records, date) {
  return round2((records ?? []).filter((r) => r.date === date).reduce((a, r) => a + r.hours, 0));
}

/**
 * Report model.
 * @param {{month?: 'all'|string, status?: 'unpaid'|'paid'|'all'}} filter month = "YYYY-MM" (work date)
 */
export function summarize(records, { month = 'all', status = 'unpaid' } = {}) {
  const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.row - a.row;
  const inMonth = month === 'all' ? records : records.filter((r) => r.date.startsWith(month));
  const rows = inMonth
    .filter((r) => status === 'all' || (status === 'paid') === r.paid.paid)
    .sort(byDateDesc);

  const groups = new Map();
  for (const r of rows.filter((x) => x.paid.paid)) {
    const key = r.paid.date ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const payouts = [...groups]
    .map(([key, list]) => ({ date: key || null, ...totalsOf(list), rows: list }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')); // newest first, undated legacy last

  return {
    dueNow: totalsOf(records.filter((r) => !r.paid.paid)),
    months: [...new Set(records.map((r) => r.date.slice(0, 7)))].sort().reverse(),
    totals: {
      unpaid: totalsOf(inMonth.filter((r) => !r.paid.paid)),
      paid: totalsOf(inMonth.filter((r) => r.paid.paid)),
      all: totalsOf(inMonth),
    },
    rows,
    payouts,
  };
}
