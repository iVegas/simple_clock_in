// Google Picker: the user chooses their timesheet spreadsheet in Google's own file dialog.
// Picking a file grants this app (drive.file scope) access to that one spreadsheet.
import { ApiError } from './errors.js';
import { config } from './config.js';
import { loadScript } from './util.js';

let ready = null;

function load() {
  ready ??= loadScript('https://apis.google.com/js/api.js')
    .then(() => new Promise((resolve, reject) => {
      window.gapi.load('picker', { callback: resolve, onerror: reject });
    }))
    .catch((err) => {
      ready = null;
      throw new ApiError('network', `Could not load Google Picker: ${err?.message ?? err}`);
    });
  return ready;
}

export function createPicker(auth) {
  return {
    preload: load,

    /** @returns {Promise<{id: string, title: string} | null>} null when cancelled */
    async pickSpreadsheet() {
      const token = await auth.getToken({ interactive: true });
      await load();
      const { picker } = window.google;
      return new Promise((resolve) => {
        const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST);
        new picker.PickerBuilder()
          .addView(view)
          .enableFeature(picker.Feature.NAV_HIDDEN)
          .setOAuthToken(token)
          .setDeveloperKey(config.googleApiKey)
          .setAppId(config.googleAppId)
          .setOrigin(location.origin)
          .setTitle('Choose your timesheet spreadsheet')
          .setCallback((data) => {
            const action = data[picker.Response.ACTION];
            if (action === picker.Action.PICKED) {
              const doc = data[picker.Response.DOCUMENTS][0];
              resolve({ id: doc[picker.Document.ID], title: doc[picker.Document.NAME] });
            } else if (action === picker.Action.CANCEL) {
              resolve(null);
            }
          })
          .build()
          .setVisible(true);
      });
    },
  };
}
