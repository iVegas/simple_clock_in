import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStructure, expectedHeader, setupRequests, deleteRowRequest, rowMatches,
  headersOf, headersValid, isDefaultHeaders, headersFromSheet, headerRequest,
  viewFilter, filterRequests, totalsRequest, TOTALS_COLUMN,
  serialToISO, isoToSerial, parseDateCell, parsePaid, toNumber,
  parseRecords, lastDataRow, planSession, markPaidRequest, clearPaidRequest,
  summarize, hoursOn,
} from '../src/domain/ledger.js';

const HEADER = ['Date', 'Hours', 'USD/hour', 'sum', 'paid', 'comment'];
const s = isoToSerial;

// ---------------------------------------------------------------------------
// Structure

test('empty tab is detected', () => {
  assert.equal(validateStructure([], 'USD').state, 'empty');
  assert.equal(validateStructure(undefined, 'USD').state, 'empty');
  assert.equal(validateStructure([[], ['', '  ']], 'USD').state, 'empty');
});

test('matching header is ok (case/space insensitive, comment optional)', () => {
  assert.equal(validateStructure([HEADER], 'USD').state, 'ok');
  assert.equal(validateStructure([[' date', 'HOURS', 'usd / hour', 'Sum', 'Paid', '']], 'USD').state, 'ok');
  assert.equal(validateStructure([['Date', 'Hours', 'USD/hour', 'sum', 'paid']], 'USD').state, 'ok');
  assert.equal(validateStructure([['Date', 'Hours', 'USD/hr', 'sum', 'paid', 'Comments']], 'USD').state, 'ok');
  assert.equal(validateStructure([['Date', 'Hours', '€/hour', 'sum', 'paid', 'comment']], '€').state, 'ok');
});

test('currency mismatch is reported, rows stay readable', () => {
  const res = validateStructure([HEADER, [s('2026-11-01'), 2, 40, 80, false]], 'EUR');
  assert.equal(res.state, 'mismatch');
  assert.equal(res.readable, true);
  assert.deepEqual(res.issues, [{ column: 'C', expected: 'EUR/hour', found: 'USD/hour', kind: 'currency', sheetCurrency: 'USD' }]);
});

test('renamed / missing columns are reported and not readable', () => {
  const res = validateStructure([['Day', 'Hours', 'Rate', 'sum']], 'USD');
  assert.equal(res.state, 'mismatch');
  assert.equal(res.readable, false);
  assert.deepEqual(res.issues.map((i) => i.column), ['A', 'C', 'E']);
  assert.equal(res.issues[2].found, '');
  assert.equal(res.issues[1].kind, undefined); // "Rate" is not a {currency}/hour header
});

test('unexpected F header is reported', () => {
  const res = validateStructure([[...HEADER.slice(0, 5), 'status']], 'USD');
  assert.equal(res.state, 'mismatch');
  assert.deepEqual(res.issues, [{ column: 'F', expected: 'comment', found: 'status', optional: true }]);
});

test('data without a header is a mismatch', () => {
  const res = validateStructure([[s('2026-11-01'), 2, 40, 80, false]], 'USD');
  assert.equal(res.state, 'mismatch');
  assert.equal(res.readable, false);
});

test('setupRequests writes the header for the currency and formats columns', () => {
  assert.deepEqual(expectedHeader('EUR'), ['Date', 'Hours', 'EUR/hour', 'sum', 'paid', 'comment']);
  const req = setupRequests(7, 'EUR');
  const header = req[0].updateCells.rows[0].values.map((v) => v.userEnteredValue.stringValue);
  assert.deepEqual(header, expectedHeader('EUR'));
  assert.equal(req[0].updateCells.start.sheetId, 7);
  assert.equal(req[1].updateSheetProperties.properties.gridProperties.frozenRowCount, 1);
  assert.equal(req.filter((r) => r.repeatCell).length, 3);
});

// ---------------------------------------------------------------------------
// Cells

test('serial <-> ISO date conversion', () => {
  assert.equal(serialToISO(45658), '2025-01-01');
  assert.equal(isoToSerial('2025-01-01'), 45658);
  assert.equal(serialToISO(45658.75), '2025-01-01'); // time fraction ignored
  assert.equal(serialToISO(isoToSerial('2026-11-08')), '2026-11-08');
  assert.equal(isoToSerial('1899-12-31'), 1);
});

test('parseDateCell handles serials and locale-dependent text', () => {
  assert.equal(parseDateCell(45658), '2025-01-01');
  assert.equal(parseDateCell('2025-01-31'), '2025-01-31');
  assert.equal(parseDateCell('2025-1-5'), '2025-01-05');
  assert.equal(parseDateCell('31.01.2025'), '2025-01-31');
  assert.equal(parseDateCell('02/03/2025', 'en_US'), '2025-02-03');
  assert.equal(parseDateCell('02/03/2025', 'en_GB'), '2025-03-02');
  assert.equal(parseDateCell('02/03/2025', 'uk_UA'), '2025-03-02');
  assert.equal(parseDateCell('31/02/2025', 'en_GB'), null); // invalid day
  assert.equal(parseDateCell('Total'), null);
  assert.equal(parseDateCell(''), null);
  assert.equal(parseDateCell(true), null);
  assert.equal(parseDateCell(0), null);
});

test('parsePaid supports legacy booleans, dates and empty cells', () => {
  assert.deepEqual(parsePaid(true), { paid: true, date: null, legacy: true, raw: null });
  assert.deepEqual(parsePaid(false), { paid: false, date: null, legacy: false, raw: null });
  assert.equal(parsePaid('').paid, false);
  assert.equal(parsePaid(undefined).paid, false);
  assert.equal(parsePaid(null).paid, false);
  assert.equal(parsePaid('TRUE').legacy, true);
  assert.equal(parsePaid('FALSE').paid, false);
  assert.deepEqual(parsePaid(s('2026-10-31')), { paid: true, date: '2026-10-31', legacy: false, raw: null });
  assert.equal(parsePaid('2026-10-31').date, '2026-10-31');
  assert.equal(parsePaid('31.10.2026').date, '2026-10-31');
  assert.equal(parsePaid(0).paid, false);
  assert.deepEqual(parsePaid('partial'), { paid: false, date: null, legacy: false, raw: 'partial' });
});

test('toNumber accepts numbers and numeric text', () => {
  assert.equal(toNumber(7.5), 7.5);
  assert.equal(toNumber('7,5'), 7.5);
  assert.equal(toNumber(' 8 '), 8);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('abc'), null);
  assert.equal(toNumber(true), null);
});

// ---------------------------------------------------------------------------
// Records

const SHEET = [
  HEADER,
  [s('2026-10-01'), 6, 40, 240, true, 'legacy paid'],
  [s('2026-10-02'), 4, 40, 160, false],
  [s('2026-10-03'), 2.5, 40, 100, s('2026-10-31')],
  [s('2026-11-02'), 3, 45, 135, ''],
  [s('2026-11-03'), 1, 45], // sum not computed yet -> fallback hours*rate
  [],
  ['Total', 16.5, '', 635], // totals row is skipped
];

test('parseRecords maps rows and skips non-date rows', () => {
  const records = parseRecords(SHEET);
  assert.equal(records.length, 5);
  assert.deepEqual(records.map((r) => r.row), [2, 3, 4, 5, 6]);
  assert.equal(records[0].paid.legacy, true);
  assert.equal(records[0].comment, 'legacy paid');
  assert.equal(records[2].paid.date, '2026-10-31');
  assert.equal(records[4].sum, 45);
  assert.equal(hoursOn(records, '2026-11-02'), 3);
  assert.equal(hoursOn(records, '2026-12-01'), 0);
});

test('lastDataRow uses Date/Hours columns only', () => {
  assert.equal(lastDataRow([HEADER]), 1);
  assert.equal(lastDataRow(SHEET), 8); // totals row has Hours
  // Pre-filled checkboxes / formulas below the data do not count.
  assert.equal(lastDataRow([HEADER, [s('2026-10-01'), 1, 40, 40, false], ['', '', '', 0, false], ['', '', '', 0, false]]), 2);
});

// ---------------------------------------------------------------------------
// Session write planning

test('planSession updates the existing row of the day', () => {
  const plan = planSession({ values: SHEET, rowCount: 1000, date: '2026-11-02', hours: 1.25, rate: 50 });
  assert.equal(plan.row, 5);
  assert.equal(plan.isNew, false);
  assert.equal(plan.newHours, 4.25);
  assert.deepEqual(plan.cells, [
    { cell: 'B5', value: 4.25 },
    { cell: 'C5', value: 50 },
    { cell: 'D5', value: '=B5*C5' },
  ]);
  assert.equal(plan.appendRows, 0);
});

test('planSession appends a new row after the last data row', () => {
  const values = [HEADER, [s('2026-11-02'), 3, 45, 135, '']];
  const plan = planSession({ values, rowCount: 1000, date: '2026-11-08', hours: 0.75, rate: 45 });
  assert.equal(plan.row, 3);
  assert.equal(plan.isNew, true);
  assert.deepEqual(plan.cells, [
    { cell: 'A3', value: '2026-11-08' },
    { cell: 'B3', value: 0.75 },
    { cell: 'C3', value: 45 },
    { cell: 'D3', value: '=B3*C3' },
  ]);
});

test('planSession never changes a day already marked paid: new unpaid row instead', () => {
  const values = [HEADER, [s('2026-11-08'), 2, 50, 100, s('2026-11-08')], [s('2026-11-09'), 1, 50, 50, true]];
  const plan = planSession({ values, date: '2026-11-08', hours: 0.5, rate: 50 });
  assert.equal(plan.isNew, true);
  assert.equal(plan.row, 4);
  assert.equal(plan.newHours, 0.5);
  // ...and an unpaid row of that day is the one that gets updated later.
  const next = [...values, [s('2026-11-08'), 0.5, 50, 25]];
  const plan2 = planSession({ values: next, date: '2026-11-08', hours: 0.25, rate: 50 });
  assert.deepEqual([plan2.row, plan2.isNew, plan2.newHours], [4, false, 0.75]);
});

test('planSession on a freshly set up sheet writes row 2', () => {
  const plan = planSession({ values: [HEADER], rowCount: 1000, date: '2026-11-08', hours: 0.25, rate: 10 });
  assert.equal(plan.row, 2);
  assert.equal(plan.isNew, true);
});

test('planSession asks to grow the grid when the row is past rowCount', () => {
  const values = [HEADER, [s('2026-11-02'), 3, 45, 135, '']];
  assert.equal(planSession({ values, rowCount: 2, date: '2026-11-08', hours: 1, rate: 45 }).appendRows, 1);
  assert.equal(planSession({ values, rowCount: 3, date: '2026-11-08', hours: 1, rate: 45 }).appendRows, 0);
});

test('planSession normalizes accumulated hours', () => {
  const values = [HEADER, [s('2026-11-08'), 0.1, 10, 1, '']];
  assert.equal(planSession({ values, date: '2026-11-08', hours: 0.2, rate: 10 }).newHours, 0.3);
});

test('mark paid writes a date serial, clears legacy checkbox validation; undo clears value', () => {
  const req = markPaidRequest(3, 5, '2026-11-08').updateCells;
  assert.deepEqual(req.range, { sheetId: 3, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 4, endColumnIndex: 5 });
  assert.equal(req.rows[0].values[0].userEnteredValue.numberValue, isoToSerial('2026-11-08'));
  assert.match(req.fields, /dataValidation/);
  const undo = clearPaidRequest(3, 5).updateCells;
  assert.deepEqual(undo.rows, [{ values: [{}] }]);
  assert.equal(undo.fields, 'userEnteredValue');
});

test('planSession writes a comment as text on a new row, appends it on an existing one', () => {
  const fresh = planSession({ values: [HEADER], date: '2026-11-08', hours: 1, rate: 10, comment: '  Forgot to clock in ' });
  assert.deepEqual(fresh.cells.at(-1), { cell: 'F2', value: "'Forgot to clock in" });

  const values = [HEADER, [s('2026-11-08'), 1, 10, 10, '', 'Morning']];
  const plan = planSession({ values, date: '2026-11-08', hours: 0.5, rate: 10, comment: 'Call' });
  assert.deepEqual(plan.cells.at(-1), { cell: 'F2', value: "'Morning; Call" });

  // No comment: F is left alone.
  assert.ok(planSession({ values, date: '2026-11-08', hours: 0.5, rate: 10 }).cells.every((c) => !c.cell.startsWith('F')));
});

test('deleteRowRequest removes exactly that sheet row', () => {
  assert.deepEqual(deleteRowRequest(3, 5), {
    deleteDimension: { range: { sheetId: 3, dimension: 'ROWS', startIndex: 4, endIndex: 5 } },
  });
});

test('rowMatches guards writes against rows that moved or changed', () => {
  const record = { date: '2026-11-08', hours: 2.5 };
  assert.equal(rowMatches([s('2026-11-08'), 2.5], record), true);
  assert.equal(rowMatches(['2026-11-08', '2,5'], record), true);
  assert.equal(rowMatches([s('2026-11-08'), 3], record), false); // same day, other row
  assert.equal(rowMatches([s('2026-11-09'), 2.5], record), false);
  assert.equal(rowMatches(undefined, record), false);
});

// ---------------------------------------------------------------------------
// Report

test('summarize: due now across all time, unpaid list by default', () => {
  const r = summarize(parseRecords(SHEET));
  assert.deepEqual(r.dueNow, { amount: 340, hours: 8, count: 3 });
  assert.deepEqual(r.months, ['2026-11', '2026-10']);
  assert.deepEqual(r.rows.map((x) => x.date), ['2026-11-03', '2026-11-02', '2026-10-02']);
});

test('summarize: month filter applies to list and totals, not to due now', () => {
  const r = summarize(parseRecords(SHEET), { month: '2026-10', status: 'all' });
  assert.deepEqual(r.rows.map((x) => x.date), ['2026-10-03', '2026-10-02', '2026-10-01']);
  assert.deepEqual(r.totals.unpaid, { amount: 160, hours: 4, count: 1 });
  assert.deepEqual(r.totals.paid, { amount: 340, hours: 8.5, count: 2 });
  assert.equal(r.dueNow.amount, 340);
});

test('summarize: paid view groups by payout date, legacy (undated) last', () => {
  const r = summarize(parseRecords(SHEET), { status: 'paid' });
  assert.deepEqual(r.payouts.map((p) => [p.date, p.amount]), [['2026-10-31', 100], [null, 240]]);
});

// ---------------------------------------------------------------------------
// Custom header names

const UK = { date: 'Дата', hours: 'Години', rate: 'Ставка, {currency}/год', sum: 'Сума', paid: 'Оплачено', comment: 'Коментар' };

test('custom header names define the expected header (currency filled in)', () => {
  assert.deepEqual(expectedHeader('UAH', UK), ['Дата', 'Години', 'Ставка, UAH/год', 'Сума', 'Оплачено', 'Коментар']);
  assert.equal(validateStructure([['дата', 'ГОДИНИ', 'Ставка, uah / год', 'Сума', 'Оплачено', '']], 'UAH', UK).state, 'ok');
  // ...and the default English names no longer match that clock.
  assert.equal(validateStructure([HEADER], 'UAH', UK).state, 'mismatch');
});

test('custom rate name: another currency is reported as a currency issue', () => {
  const res = validateStructure([['Дата', 'Години', 'Ставка, USD/год', 'Сума', 'Оплачено']], 'UAH', UK);
  assert.deepEqual(res.issues, [{ column: 'C', expected: 'Ставка, UAH/год', found: 'Ставка, USD/год', kind: 'currency', sheetCurrency: 'USD' }]);
  assert.equal(res.readable, true);
});

test('rate name without {currency} is compared literally', () => {
  const h = { ...UK, rate: 'Ставка' };
  assert.equal(validateStructure([['Дата', 'Години', 'ставка', 'Сума', 'Оплачено']], 'UAH', h).state, 'ok');
  const res = validateStructure([['Дата', 'Години', 'Rate', 'Сума', 'Оплачено']], 'UAH', h);
  assert.equal(res.issues[0].kind, undefined);
});

test('custom comment name or blank F header is fine', () => {
  assert.equal(validateStructure([['Дата', 'Години', 'Ставка, UAH/год', 'Сума', 'Оплачено', 'Коментар']], 'UAH', UK).state, 'ok');
  assert.equal(validateStructure([['Дата', 'Години', 'Ставка, UAH/год', 'Сума', 'Оплачено', 'Нотатки']], 'UAH', UK).state, 'mismatch');
});

test('headersOf / isDefaultHeaders / headersValid', () => {
  assert.equal(headersOf({ sum: '  ', paid: 'Paid on' }).sum, 'sum');
  assert.equal(headersOf({ paid: 'Paid on' }).paid, 'Paid on');
  assert.equal(isDefaultHeaders(null), true);
  assert.equal(isDefaultHeaders({ date: 'Date' }), true);
  assert.equal(isDefaultHeaders(UK), false);
  assert.equal(headersValid(UK), true);
  assert.equal(headersValid({ ...UK, sum: 'дата' }), false); // duplicates (case-insensitive)
  assert.equal(headersValid({ ...UK, comment: '' }), false);
});

test('headersFromSheet adopts an existing header row', () => {
  // The clock's currency inside the rate header becomes {currency}.
  assert.deepEqual(headersFromSheet(['Day', 'Time', 'UAH per hour', 'Total', 'Paid on', ''], 'UAH'),
    { date: 'Day', hours: 'Time', rate: '{currency} per hour', sum: 'Total', paid: 'Paid on', comment: 'comment' });
  // Another currency in the default pattern keeps the pattern (the currency issue then shows).
  assert.equal(headersFromSheet(['Date', 'Hours', 'USD/hour'], 'EUR').rate, '{currency}/hour');
  // Adopted names validate against that row.
  const row = ['Day', 'Time', 'uah per hour', 'Total', 'Paid on'];
  assert.equal(validateStructure([row], 'UAH', headersFromSheet(row, 'UAH')).state, 'ok');
});

test('headerRequest writes the names in bold into A1:F1', () => {
  const req = headerRequest(5, 'EUR', UK).updateCells;
  assert.deepEqual(req.start, { sheetId: 5, rowIndex: 0, columnIndex: 0 });
  assert.deepEqual(req.rows[0].values.map((v) => v.userEnteredValue.stringValue), expectedHeader('EUR', UK));
});

// ---------------------------------------------------------------------------
// Sheet view + totals

test('viewFilter sorts by date (newest first) and hides paid rows on A–F', () => {
  const f = viewFilter(9);
  assert.deepEqual(f.range, { sheetId: 9, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 6 });
  assert.deepEqual(f.sortSpecs, [{ dimensionIndex: 0, sortOrder: 'DESCENDING' }]);
  assert.equal(f.filterSpecs[0].columnIndex, 4);
  assert.match(f.filterSpecs[0].filterCriteria.condition.values[0].userEnteredValue, /E2<>TRUE/);
});

test('setupRequests sets the view and, when labels are given, the totals', () => {
  const plain = setupRequests(7, 'EUR');
  assert.ok(plain.some((r) => r.setBasicFilter));
  assert.ok(!plain.some((r) => r.updateCells?.start?.columnIndex === TOTALS_COLUMN));
  const labels = { due: 'Due now', paid: 'Paid', total: 'Total', hoursUnit: 'hr' };
  assert.ok(setupRequests(7, 'EUR', { totals: labels }).some((r) => r.updateCells?.start?.columnIndex === TOTALS_COLUMN));
});

test('filterRequests re-applies an existing filter: clear, sort data rows, set (without legacy criteria)', () => {
  const existing = { ...viewFilter(3), criteria: { 4: { condition: {} } } };
  const reqs = filterRequests(3, existing, { hasFilter: true });
  assert.deepEqual(reqs.map((r) => Object.keys(r)[0]), ['clearBasicFilter', 'sortRange', 'setBasicFilter']);
  assert.equal(reqs[1].sortRange.range.startRowIndex, 1); // header stays on top
  assert.equal(reqs[2].setBasicFilter.filter.criteria, undefined);
  // A filter without sorting (changed in Sheets) is re-applied as is.
  const unsorted = { range: { sheetId: 3, startRowIndex: 0 }, filterSpecs: [] };
  assert.deepEqual(filterRequests(3, unsorted).map((r) => Object.keys(r)[0]), ['setBasicFilter']);
});

test('totalsRequest: due / paid / total, amount and hours, in H1:P1', () => {
  const req = totalsRequest(2, 'USD', { due: 'Due now', paid: 'Paid', total: 'Total', hoursUnit: 'hr' }).updateCells;
  assert.deepEqual(req.start, { sheetId: 2, rowIndex: 0, columnIndex: 7 });
  const cells = req.rows[0].values;
  assert.equal(cells.length, 9);
  assert.deepEqual([0, 3, 6].map((i) => cells[i].userEnteredValue.stringValue), ['Due now', 'Paid', 'Total']);
  assert.match(cells[1].userEnteredValue.formulaValue, /^=ARRAYFORMULA\(SUM\(.*\(1-SIGN\(\(E2:E=TRUE\)\+ISNUMBER\(E2:E\)\)\)\*D2:D/);
  assert.match(cells[5].userEnteredValue.formulaValue, /\*B2:B/);
  assert.equal(cells[7].userEnteredFormat.numberFormat.pattern, '#,##0.00" USD"');
  assert.equal(cells[8].userEnteredFormat.numberFormat.pattern, '0.00" hr"');
});
