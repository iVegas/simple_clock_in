/** Error with a stable `code` the UI can react to. */
export class ApiError extends Error {
  constructor(code, message, { status = 0 } = {}) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const MESSAGES = {
  'auth-required': 'Connect your Google account to sync.',
  'auth-cancelled': 'Google sign-in was cancelled.',
  'auth-popup-blocked': 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'scope-denied': 'Access to your spreadsheets was not granted. Sign in again and allow it.',
  network: 'You appear to be offline. Everything is kept on this device and will sync later.',
  forbidden: 'This app has no access to the spreadsheet. Choose it again in the clock settings.',
  'not-found': 'The spreadsheet was not found. Choose it again in the clock settings.',
  'tab-missing': 'The sheet tab was not found. Pick a tab again in the clock settings.',
  'row-moved': 'The sheet changed since it was loaded. Refresh and try again.',
  'not-configured': 'Google access is not configured yet. Open the setup assistant in Clocks.',
  rate: 'Google is rate-limiting requests. Try again in a minute.',
};

export function describeError(err) {
  return MESSAGES[err?.code] ?? err?.message ?? 'Something went wrong.';
}
