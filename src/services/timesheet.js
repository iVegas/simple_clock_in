// Timesheet operations for a clock: read + validate the sheet, set up an empty tab,
// record a session, mark a day paid. Rules live in domain/ledger.js; this file does the I/O.
import { backend } from './backend.js';
import { quoteSheet } from './sheets.js';
import { ApiError } from './errors.js';
import { store } from '../state/store.js';
import { localDateKey } from '../domain/time.js';
import {
  DATA_RANGE, validateStructure, parseRecords, planSession, rowMatches,
  setupRequests, markPaidRequest, clearPaidRequest, deleteRowRequest,
} from '../domain/ledger.js';

/**
 * Read the clock's tab, validate its structure against the clock settings and refresh the cache.
 * Also keeps the clock's spreadsheet/tab names current (they may be renamed in Sheets).
 */
export async function loadSheet(clock, { interactive = false } = {}) {
  const opts = { interactive };
  const meta = await backend.sheets.getMeta(clock.spreadsheetId, opts);
  const tab = meta.tabs.find((t) => t.sheetId === clock.sheetId) ?? meta.tabs.find((t) => t.title === clock.sheetTitle);
  if (!tab) throw new ApiError('tab-missing');
  const values = await backend.sheets.getValues(clock.spreadsheetId, `${quoteSheet(tab.title)}!${DATA_RANGE}`, opts);

  const structure = validateStructure(values, clock.currency);
  const records = structure.readable ? parseRecords(values, meta.locale) : [];
  Object.assign(clock, {
    spreadsheetTitle: meta.title,
    sheetId: tab.sheetId,
    sheetTitle: tab.title,
    structure: { ...structure, checkedAt: Date.now() },
  });
  store.cache[clock.id] = { records, locale: meta.locale, fetchedAt: Date.now() };
  return { meta, tab, values, structure, records };
}

/** Write the header and formats for an empty tab, based on the clock's settings. */
export function setupSheet(spreadsheetId, sheetId, currency, opts) {
  return backend.sheets.batchUpdate(spreadsheetId, setupRequests(sheetId, currency), opts);
}

/** Create a new spreadsheet with one tab already set up for the clock. */
export async function createTimesheet({ title, currency }, opts) {
  const meta = await backend.sheets.create({ title, tabTitle: 'Timesheet' }, opts);
  const tab = meta.tabs[0];
  await setupSheet(meta.id, tab.sheetId, currency, opts);
  return { spreadsheetId: meta.id, spreadsheetTitle: meta.title, sheetId: tab.sheetId, sheetTitle: tab.title };
}

/**
 * Add one pending entry (session or manual) to the day's row (create the row if needed).
 * `sheet` must be a fresh loadSheet() result with structure "ok".
 */
export async function recordSession(clock, sheet, item, opts) {
  const plan = planSession({
    values: sheet.values,
    rowCount: sheet.tab.rowCount,
    date: item.date,
    hours: item.hours,
    rate: item.rate,
    comment: item.comment,
    locale: sheet.meta.locale,
  });
  if (plan.appendRows) {
    await backend.sheets.batchUpdate(clock.spreadsheetId, [{
      appendDimension: { sheetId: sheet.tab.sheetId, dimension: 'ROWS', length: plan.appendRows },
    }], opts);
  }
  // Remember the expected result: if the response is lost after a successful write,
  // the next sync sees the row already has these hours and does not add them twice.
  item.expect = { date: item.date, row: plan.row, hours: plan.newHours };
  const prefix = `${quoteSheet(sheet.tab.title)}!`;
  await backend.sheets.writeCells(
    clock.spreadsheetId,
    plan.cells.map(({ cell, value }) => ({ range: prefix + cell, values: [[value]] })),
    opts,
  );
  return plan;
}

/** Make sure the row still holds the same entry (day + hours) before changing or deleting it. */
async function assertRow(clock, record, opts) {
  const values = await backend.sheets.getValues(clock.spreadsheetId, `${quoteSheet(clock.sheetTitle)}!A${record.row}:B${record.row}`, opts);
  if (!rowMatches(values?.[0], record, store.cache[clock.id]?.locale ?? '')) throw new ApiError('row-moved');
}

/** Record today as the payout date of a day. */
export async function markPaid(clock, record, opts = { interactive: true }) {
  await assertRow(clock, record, opts);
  await backend.sheets.batchUpdate(clock.spreadsheetId, [markPaidRequest(clock.sheetId, record.row, localDateKey())], opts);
}

/** Cancel a payment: clear the "paid" cell (empty = unpaid). */
export async function unmarkPaid(clock, record, opts = { interactive: true }) {
  await assertRow(clock, record, opts);
  await backend.sheets.batchUpdate(clock.spreadsheetId, [clearPaidRequest(clock.sheetId, record.row)], opts);
}

/** Delete the entry's row from the sheet. */
export async function deleteEntry(clock, record, opts = { interactive: true }) {
  await assertRow(clock, record, opts);
  await backend.sheets.batchUpdate(clock.spreadsheetId, [deleteRowRequest(clock.sheetId, record.row)], opts);
  // Rows below moved up: keep the "already written?" check of queued entries pointing at the right row.
  for (const p of store.pending) {
    if (p.clockId === clock.id && p.expect?.row > record.row) p.expect.row -= 1;
  }
}
