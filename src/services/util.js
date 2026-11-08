export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const uid = () => crypto.randomUUID();

const scripts = new Map();

/** Load a classic <script> once (Google Identity Services, Google API loader). */
export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        el.remove();
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.append(el);
    }));
  }
  return scripts.get(src);
}

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Could not save ${key}`, err);
  }
}

export const spreadsheetUrl = (id, sheetId) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit${sheetId !== undefined && sheetId !== null ? `#gid=${sheetId}` : ''}`;
