// Picks the Google backend or the demo (mock) backend once at startup.
import { MOCK } from '../mode.js';
import { createGoogleAuth } from './google-auth.js';
import { createPicker } from './picker.js';
import { createSheetsClient } from './sheets.js';

let impl = null;

/** { auth, picker, sheets } — same interface for Google and demo mode. */
export const backend = {
  get auth() { return impl.auth; },
  get picker() { return impl.picker; },
  get sheets() { return impl.sheets; },
};

export async function initBackend() {
  if (MOCK) {
    const { createMockBackend } = await import('./mock.js');
    impl = createMockBackend();
  } else {
    const auth = createGoogleAuth();
    impl = { auth, picker: createPicker(auth), sheets: createSheetsClient(auth) };
  }
  return impl;
}
