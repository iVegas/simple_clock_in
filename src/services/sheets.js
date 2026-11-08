// Thin Google Sheets REST v4 client (fetch). Retries 429/5xx, refreshes the token once on 401.
import { ApiError } from './errors.js';
import { sleep } from './util.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const META_FIELDS = 'spreadsheetId,properties(title,locale),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))';

/** 'My tab' -> "'My tab'" for A1 ranges. */
export const quoteSheet = (title) => `'${String(title).replace(/'/g, "''")}'`;

const codeFor = (status) => ({ 401: 'auth-required', 403: 'forbidden', 404: 'not-found', 429: 'rate' })[status]
  ?? (status >= 500 ? 'server' : 'bad-request');

/** Normalized spreadsheet metadata (shared shape with the mock backend). */
export function normalizeMeta(json) {
  return {
    id: json.spreadsheetId,
    title: json.properties?.title ?? '',
    locale: json.properties?.locale ?? '',
    tabs: (json.sheets ?? []).map(({ properties: p }) => ({
      sheetId: p.sheetId,
      title: p.title,
      index: p.index,
      rowCount: p.gridProperties?.rowCount ?? 1000,
      columnCount: p.gridProperties?.columnCount ?? 26,
    })),
  };
}

export function createSheetsClient(auth) {
  async function request(method, url, body, { interactive = false } = {}) {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await auth.getToken({ interactive });
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new ApiError('network', 'Network request failed');
      }
      if (res.ok) return res.json();
      if (res.status === 401 && !refreshed) {
        auth.invalidate();
        refreshed = true;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await sleep(700 * 2 ** attempt);
        continue;
      }
      const message = (await res.json().catch(() => null))?.error?.message || res.statusText;
      throw new ApiError(codeFor(res.status), message, { status: res.status });
    }
  }

  const id = (spreadsheetId) => encodeURIComponent(spreadsheetId);

  return {
    async getMeta(spreadsheetId, opts) {
      const json = await request('GET', `${BASE}/${id(spreadsheetId)}?fields=${encodeURIComponent(META_FIELDS)}`, null, opts);
      return normalizeMeta(json);
    },

    /** Raw values: numbers stay numbers, dates come as serial numbers, formulas as results. */
    async getValues(spreadsheetId, range, opts) {
      const q = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
      const json = await request('GET', `${BASE}/${id(spreadsheetId)}/values/${encodeURIComponent(range)}?${q}`, null, opts);
      return json.values ?? [];
    },

    /** @param {Array<{range: string, values: Array<Array<*>>}>} data written as if typed by the user */
    writeCells(spreadsheetId, data, opts) {
      return request('POST', `${BASE}/${id(spreadsheetId)}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data }, opts);
    },

    batchUpdate(spreadsheetId, requests, opts) {
      return request('POST', `${BASE}/${id(spreadsheetId)}:batchUpdate`, { requests }, opts);
    },

    async create({ title, tabTitle }, opts) {
      const json = await request('POST', BASE, {
        properties: { title },
        sheets: [{ properties: { title: tabTitle } }],
      }, opts);
      return normalizeMeta(json);
    },
  };
}
