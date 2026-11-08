// Google sign-in via Google Identity Services (token model, no backend).
// Scope drive.file is non-sensitive: the app only sees spreadsheets the user picks or the app creates.
import { reactive } from 'vue';
import { ApiError } from './errors.js';
import { config } from './config.js';
import { loadScript, readJSON, writeJSON } from './util.js';

const KEY = 'clockin.auth';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = [DRIVE_FILE, 'https://www.googleapis.com/auth/userinfo.email'];

async function fetchEmail(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok ? (await res.json()).email ?? '' : '';
}

export function createGoogleAuth() {
  const saved = readJSON(KEY, {});
  const state = reactive({
    email: saved.email ?? '',
    accessToken: saved.accessToken ?? '',
    expiresAt: saved.expiresAt ?? 0,
  });
  const persist = () => writeJSON(KEY, { ...state });

  let gis = null;
  const preload = () => (gis ??= loadScript(GIS_SRC).catch((err) => {
    gis = null;
    throw new ApiError('network', err.message);
  }));

  const hasValidToken = () => !!state.accessToken && state.expiresAt - 60_000 > Date.now();

  function requestToken() {
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: config.googleClientId,
        scope: SCOPES.join(' '),
        // Returning users get a popup that closes by itself; first time shows consent.
        prompt: state.email ? '' : 'consent',
        login_hint: state.email || undefined,
        callback: async (resp) => {
          if (resp.error) {
            reject(new ApiError('auth-cancelled', resp.error_description || resp.error));
            return;
          }
          if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_FILE)) {
            reject(new ApiError('scope-denied'));
            return;
          }
          state.accessToken = resp.access_token;
          state.expiresAt = Date.now() + Number(resp.expires_in || 3600) * 1000;
          if (!state.email) state.email = await fetchEmail(resp.access_token).catch(() => '');
          persist();
          resolve(state.accessToken);
        },
        error_callback: (err) => reject(new ApiError(
          err?.type === 'popup_failed_to_open' ? 'auth-popup-blocked' : 'auth-cancelled',
          err?.message,
        )),
      });
      client.requestAccessToken();
    });
  }

  let inflight = null;

  /**
   * Access token for API calls. `interactive` may open the Google popup, so pass it only
   * from a click handler (browsers block popups without a user gesture).
   */
  async function getToken({ interactive = false } = {}) {
    if (hasValidToken()) return state.accessToken;
    if (!interactive) throw new ApiError('auth-required');
    if (!config.googleClientId) throw new ApiError('not-configured');
    inflight ??= preload().then(requestToken).finally(() => { inflight = null; });
    return inflight;
  }

  function invalidate() {
    state.accessToken = '';
    state.expiresAt = 0;
    persist();
  }

  function signOut() {
    if (state.accessToken) window.google?.accounts?.oauth2?.revoke(state.accessToken, () => {});
    state.email = '';
    invalidate();
    writeJSON(KEY, null);
  }

  return { state, preload, getToken, hasValidToken, invalidate, signOut };
}
