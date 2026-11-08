// Demo mode: `?mock=1` runs the app against an in-browser fake spreadsheet (no Google account).
// The choice persists until `?mock=0`. Demo data is stored under separate keys.
const KEY = 'clockin.mockMode';

const params = new URLSearchParams(location.search);
if (params.has('mock')) {
  try {
    if (params.get('mock') === '0') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '1');
  } catch { /* storage unavailable */ }
  params.delete('mock');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
}

export const MOCK = (() => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
})();

/** localStorage key, namespaced so demo data never mixes with real data. */
export const storageKey = (name) => (MOCK ? `clockin.mock.${name}` : `clockin.${name}`);
