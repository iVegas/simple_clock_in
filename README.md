# Clock In

A one-tap time tracker that installs as an app (PWA), runs entirely in the browser and records
every session in **your own Google Sheet**. Hosted on GitHub Pages, which is also where installed
copies get their updates.

- **Clock in / Clock out**. Clock out unlocks once the *minimum tracked time* has passed.
  Every session is rounded **up** to a multiple of that time.
- **Multiple clocks** (one per client/job). Each has its own currency, hourly rate, minimum time
  and sheet tab, and they can run at the same time.
- **Report**: what is *due now*, filters by month and paid status, payouts grouped by date,
  and a **Mark paid** button that writes today's date into the sheet (with Undo).
- **Offline-first**: clock-outs are saved on the device first and synced when possible.
  Nothing is lost when offline, signed out, or while the sheet layout needs fixing.
- **No backend.** The browser talks to Google directly with the `drive.file` scope, so the app
  can only see spreadsheets you pick or create in it.

## The sheet

Each clock writes to one tab with this layout (row 1 = header):

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Date | Hours | `{currency}/hour` | sum | paid | comment |
| 2026-11-08 | 2.25 | 50 | `=B2*C2` | 2026-11-30 | optional |

- **Clock out** adds the rounded session to the row for that day, or creates the row.
  It writes the current hourly rate into C and the formula `=B*C` into D.
  A session that crosses midnight counts toward the day it started. A day already marked paid
  is never changed: more work on that day goes into a separate, unpaid row.
- **paid** holds the payout date. Older `TRUE`/`FALSE` (checkbox) values are still understood:
  `TRUE` counts as paid with no date. Marking a legacy checkbox row as paid replaces the checkbox
  with a date.
- If you point a clock at an **empty tab**, the app sets up the header (using the clock's
  currency), freezes row 1 and applies number/date formats.
- If the tab **doesn't match** (for example the header says `USD/hour` but the clock uses EUR),
  a warning lists what is expected and what was found. Syncing pauses, sessions stay queued on the
  device, and the warning stays until the sheet or the clock settings are fixed.

## Try it without Google

Open the app with `?mock=1` (for example `http://localhost:8000/?mock=1`). Demo mode uses a fake
spreadsheet in your browser that includes legacy rows, an empty tab and a mismatched tab.
Leave demo mode with `?mock=0`.

## Deploy your own

### 1. GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Every push to `main` runs `.github/workflows/pages.yml`, which tests the code, stamps the
   commit SHA into the service worker and publishes the site.
   Installed apps notice the new version and show **"A new version is ready · Reload"**.

The app lives at `https://<user>.github.io/<repo>/`. Visitors get an **Install** banner;
on iOS it explains *Share → Add to Home Screen*.

### 2. Google Cloud (one time, free, ~5 minutes)

The app also walks you through these steps in its **setup assistant**, with your exact origin
and direct links.

1. [Create a project](https://console.cloud.google.com/projectcreate).
2. Enable the [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
   and the [Google Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com).
3. [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding): enter the app
   name and support email, and set Audience to **External**. Under **Data access**, add the scopes
   `https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/userinfo.email`.
   Both are non-sensitive, so no Google verification is needed. **Publish** the app, or add
   users as testers.
4. [Create an OAuth client](https://console.cloud.google.com/auth/clients/create) of type **Web application**.
   Under **Authorized JavaScript origins** add `https://<user>.github.io`, and add
   `http://localhost:8000` for local development.
5. [Create an API key](https://console.cloud.google.com/apis/credentials) for the file picker.
   Restrict it to **Websites** `https://<user>.github.io/<repo>/*` and to the **Google Picker API**.
6. Copy the **project number** from [IAM & Admin → Settings](https://console.cloud.google.com/iam-admin/settings).
7. Put the three values into `config.js` and push:

   ```js
   window.CLOCKIN_CONFIG = {
     googleClientId: '1234567890-abc.apps.googleusercontent.com',
     googleApiKey: 'AIza…',
     googleAppId: '1234567890',
   };
   ```

   These values are public by design: the OAuth client only works from your authorized origin,
   and the key is restricted. Until `config.js` is filled in, the app shows the setup assistant,
   which can also save the values on a single device.

Google access tokens last one hour. When one expires, the next Clock out or Mark paid shows a
short Google popup that closes by itself.

## Development

Everything runs in Docker (`Dockerfile.dev`, `compose.yaml`), so nothing is installed on the host.
You need `docker` (rootless Docker/Podman works), `make` and `git`.

```sh
make test      # unit tests (node --test) in the container
make serve     # http://localhost:8000, dev mode (service worker is network-first)
make up/down   # the same server in the background
make preview   # build a version-stamped _site/ and serve it (tests installs + updates)
make vendor    # re-vendor Vue (VUE_VERSION=3.5 → latest 3.5.x) into vendor/
make icons     # render PNG icons from assets/icons/icon.svg + tools/icon-maskable.svg
make shell     # shell inside the dev container
```

There is no build step. `index.html` maps `vue` to the vendored `vendor/vue.esm-browser.prod.js`
through an import map, and components are plain ES modules with template strings.
When you add a runtime file, also add it to `ASSETS` in `sw.js`. `tests/sw-assets.test.js`
fails until you do.

```
src/domain/      pure business rules (tested): ledger.js (sheet layout, parsing, write plans,
                 report), time.js (rounding, threshold), format.js
src/services/    google-auth.js, picker.js, sheets.js (REST), mock.js (demo backend),
                 timesheet.js (sheet operations), sync.js (offline queue), config.js
src/state/       store.js (localStorage-backed state), now.js, toast.js
src/components/  Vue components (App, ClockView, ReportView, ClocksView, ClockEditor, …)
src/pwa/         install prompt, service worker updates
sw.js            precache + update channel
tools/           dev scripts (run inside the container)
```

## Data & privacy

- Clocks, running timers and unsynced sessions live in the browser's `localStorage`.
  Installed apps ask the browser to keep that storage persistent.
- Timesheet data only goes to Google Sheets, over the user's own Google account. There is no
  server and no analytics.
