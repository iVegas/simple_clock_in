// Timesheet business rules: sheet structure, cell parsing, write planning, report aggregation.
// Pure functions only (no DOM, no network, no Vue). Unit-tested in tests/ledger.test.js.
//
// Expected sheet layout (row 1 = header):
//   A Date | B Hours | C {currency}/hour | D sum (=B*C) | E paid | F comment (optional)
// (header names can be renamed per clock; the column order is fixed). Totals live in H1:P1.
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
/** Whitespace-normalized text ("USD / hour" -> "USD/hour"), case kept. */
const squash = (v) => String(v ?? '').trim().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
const norm = (v) => squash(v).toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Structure

/** Header names, one per column A–F. A clock may rename them (advanced settings). */
export const HEADER_KEYS = ['date', 'hours', 'rate', 'sum', 'paid', 'comment'];
export const CURRENCY_TOKEN = '{currency}';
export const DEFAULT_HEADERS = Object.freeze({
  date: 'Date', hours: 'Hours', rate: `${CURRENCY_TOKEN}/hour`, sum: 'sum', paid: 'paid', comment: 'comment',
});

/** Clock's header names with defaults for anything missing or blank. */
export function headersOf(custom) {
  const out = { ...DEFAULT_HEADERS };
  for (const key of HEADER_KEYS) if (!isBlank(custom?.[key])) out[key] = String(custom[key]).trim();
  return out;
}

/** Same names as the defaults (so nothing needs storing)? */
export const isDefaultHeaders = (custom) => HEADER_KEYS.every((k) => headersOf(custom)[k] === DEFAULT_HEADERS[k]);

/** Every column needs a name of its own (case-insensitive). */
export function headersValid(custom) {
  const names = HEADER_KEYS.map((k) => custom?.[k]);
  if (names.some(isBlank)) return false;
  return new Set(names.map(norm)).size === names.length;
}

const fillCurrency = (template, currency) => template.split(CURRENCY_TOKEN).join(String(currency ?? '').trim());

export function expectedHeader(currency, headers) {
  const h = headersOf(headers);
  return HEADER_KEYS.map((k) => fillCurrency(h[k], currency));
}

/**
 * Regex for the rate header ({currency} captured), or null when the name has no {currency}.
 * The default name also accepts the short forms "USD/h" and "USD/hr".
 */
function rateMatcher(template) {
  if (norm(template) === norm(DEFAULT_HEADERS.rate)) return /^(.+?)\/h(?:ou)?r?$/i;
  const parts = squash(template).split(CURRENCY_TOKEN);
  return parts.length < 2 ? null : new RegExp(`^${parts.map(escapeRe).join('(.+?)')}$`, 'i');
}

/**
 * Compare the sheet's header row with the structure expected for a clock's settings.
 * @param {Array<Array<*>>} values rows as returned by values.get (may be ragged)
 * @param {object} [headers] the clock's header names (defaults when omitted)
 * @returns {{state: 'empty'|'ok'|'mismatch', issues: Array, readable: boolean}}
 *   readable: rows can still be interpreted (only the currency differs).
 */
export function validateStructure(values, currency, headers) {
  const rows = values ?? [];
  if (rows.every((row) => (row ?? []).every(isBlank))) return { state: 'empty', issues: [], readable: false };

  const h = headersOf(headers);
  const header = rows[0] ?? [];
  const expected = expectedHeader(currency, h);
  const issues = [];
  const found = (i) => (isBlank(header[i]) ? '' : String(header[i]).trim());

  for (const i of [COL.date, COL.hours, COL.rate, COL.sum, COL.paid]) {
    if (norm(header[i]) === norm(expected[i])) continue;
    const m = i === COL.rate ? rateMatcher(h.rate)?.exec(squash(found(i))) : null;
    if (m && norm(m[1]) === norm(currency)) continue;
    issues.push({
      column: COLUMN_LETTERS[i], expected: expected[i], found: found(i),
      ...(m ? { kind: 'currency', sheetCurrency: m[1].trim() } : {}),
    });
  }
  const comment = found(COL.comment);
  if (comment && norm(comment) !== norm(expected[COL.comment]) && !/^comments?$/i.test(comment)) {
    issues.push({ column: 'F', expected: expected[COL.comment], found: comment, optional: true });
  }

  // Issues are data ({column, expected, found, kind?, optional?}); the UI words them per language.
  return {
    state: issues.length ? 'mismatch' : 'ok',
    issues,
    readable: issues.every((i) => i.kind === 'currency'),
  };
}

/**
 * Header names taken from an existing tab's first row (to adopt a table with the same column order).
 * The currency inside the rate header becomes {currency}; blank cells keep the current names.
 */
export function headersFromSheet(headerRow, currency, current) {
  const h = headersOf(current);
  const out = { ...h };
  HEADER_KEYS.forEach((key, i) => {
    const cell = squash(headerRow?.[i]);
    if (!cell) return;
    if (key !== 'rate') {
      out[key] = cell;
      return;
    }
    const code = String(currency ?? '').trim();
    const at = code ? cell.toLowerCase().indexOf(code.toLowerCase()) : -1;
    if (at >= 0) out.rate = cell.slice(0, at) + CURRENCY_TOKEN + cell.slice(at + code.length);
    else if (!rateMatcher(h.rate)?.test(cell)) out.rate = cell; // otherwise: other currency, keep the pattern
  });
  return out;
}

/** Write the header row (bold) with the clock's names. */
export function headerRequest(sheetId, currency, headers) {
  return {
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: 0 },
      rows: [{
        values: expectedHeader(currency, headers).map((v) => ({
          userEnteredValue: { stringValue: v },
          userEnteredFormat: { textFormat: { bold: true } },
        })),
      }],
      fields: 'userEnteredValue,userEnteredFormat.textFormat.bold',
    },
  };
}

// ---------------------------------------------------------------------------
// Sheet view: newest first, paid rows hidden, totals in the header row.

/** Row is paid in the sheet's own terms: TRUE (legacy checkbox) or a date. */
const PAID_FORMULA = 'SIGN((E2:E=TRUE)+ISNUMBER(E2:E))';
const sumWhere = (column, condition) => `=ARRAYFORMULA(SUM(IFERROR(ISNUMBER(A2:A)*${condition}*${column}2:${column},0)))`;

/** First column of the totals block (H) and its cells: label, amount, hours × due/paid/total. */
export const TOTALS_COLUMN = 7;
export const TOTALS_RANGE = 'H1:P1';

/**
 * Basic filter on A–F: entries sorted by date, newest first, and paid rows hidden.
 * In Sheets anyone can change or remove it from the header row.
 */
export function viewFilter(sheetId) {
  return {
    range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: COL.comment + 1 },
    sortSpecs: [{ dimensionIndex: COL.date, sortOrder: 'DESCENDING' }],
    filterSpecs: [{
      columnIndex: COL.paid,
      filterCriteria: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=AND(E2<>TRUE,NOT(ISNUMBER(E2)))' }] } },
    }],
  };
}

/**
 * (Re)apply a basic filter: Sheets does not re-sort or re-hide rows by itself after edits.
 * @param {object} filter the filter to set (the tab's current one when refreshing)
 * @param {boolean} hasFilter the tab already has one: clear it first so every row is sorted
 */
export function filterRequests(sheetId, filter, { hasFilter = false } = {}) {
  const { criteria, ...withoutCriteria } = filter; // deprecated mirror of filterSpecs, rejected together with it
  const clean = { ...(filter.filterSpecs ? withoutCriteria : filter), range: { ...filter.range, sheetId } };
  const requests = hasFilter ? [{ clearBasicFilter: { sheetId } }] : [];
  if (clean.sortSpecs?.length) {
    const { startRowIndex = 0, endRowIndex, startColumnIndex = 0, endColumnIndex } = clean.range;
    requests.push({
      sortRange: {
        range: { sheetId, startRowIndex: startRowIndex + 1, endRowIndex, startColumnIndex, endColumnIndex },
        sortSpecs: clean.sortSpecs,
      },
    });
  }
  requests.push({ setBasicFilter: { filter: clean } });
  return requests;
}

/**
 * Totals in H1:P1, the same numbers as the report: due now (unpaid), paid, total — amount and hours.
 * @param {{due: string, paid: string, total: string, hoursUnit: string}} labels in the UI language
 */
export function totalsRequest(sheetId, currency, labels) {
  const text = (s) => String(s ?? '').replace(/"/g, '');
  const label = (v) => ({ userEnteredValue: { stringValue: v }, userEnteredFormat: { textFormat: { bold: true } } });
  const number = (formula, pattern) => ({
    userEnteredValue: { formulaValue: formula },
    userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern }, textFormat: { bold: false } },
  });
  const money = `#,##0.00" ${text(currency)}"`;
  const hours = `0.00" ${text(labels.hoursUnit)}"`;
  const unpaid = `(1-${PAID_FORMULA})`;
  return {
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: TOTALS_COLUMN },
      rows: [{
        values: [
          label(labels.due), number(sumWhere('D', unpaid), money), number(sumWhere('B', unpaid), hours),
          label(labels.paid), number(sumWhere('D', PAID_FORMULA), money), number(sumWhere('B', PAID_FORMULA), hours),
          label(labels.total), number(sumWhere('D', '1'), money), number(sumWhere('B', '1'), hours),
        ],
      }],
      fields: 'userEnteredValue,userEnteredFormat.numberFormat,userEnteredFormat.textFormat.bold',
    },
  };
}

/** Sheets batchUpdate requests that set up an empty tab for a clock (layout + view + totals). */
export function setupRequests(sheetId, currency, { headers, totals } = {}) {
  const formatColumns = (start, end, numberFormat) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: start, endColumnIndex: end },
      cell: { userEnteredFormat: { numberFormat } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
  return [
    headerRequest(sheetId, currency, headers),
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    formatColumns(COL.date, COL.date + 1, DATE_FORMAT),
    formatColumns(COL.hours, COL.sum + 1, NUMBER_FORMAT),
    formatColumns(COL.paid, COL.paid + 1, DATE_FORMAT),
    { setBasicFilter: { filter: viewFilter(sheetId) } },
    ...(totals ? [totalsRequest(sheetId, currency, totals)] : []),
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
