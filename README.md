# Clock In

A one-tap time tracker that installs as an app (PWA), runs entirely in the browser and records
every session in **your own Google Sheet**. Hosted on GitHub Pages, which is also where installed
copies get their updates.

- **Clock in / Clock out**. Clock out unlocks once the *minimum tracked time* has passed.
  Every entry records at least that time and is rounded by the clock's **rounding rule**: up (the
  default), to the nearest or down, by 1–60 minutes or by the minimum itself, or not at all.
- **Reminders** for a clock left running: after a chosen time (default 8 h), then every 15 min to
  2 h, or once. They show as a banner with *Clock out*, plus a system notification while the app is
  open or in the background (once notifications are allowed). Without a server, a closed app can't
  remind you: the banner appears the next time it opens.
- **Multiple clocks** (one per client/job). Each has its own currency, hourly rate, minimum time,
  rounding rule, reminder, sheet tab and header names, and they can run at the same time.
- **Report**: what is *due now*, filters by month and paid status, payouts grouped by date,
  and a **Mark paid** button that writes today's date into the sheet (with Undo). Tap an entry to
  **cancel its payment** or **delete** it; both ask for confirmation first.
- **Manual entries** ("forgot to clock in"): date, hours, rate and an optional comment. They follow
  the same rules as a clocked session (minimum, rounding rule, added to the day's unpaid row).
- **Languages**: English, Ukrainian, Polish, German, French, Spanish and Portuguese. The app follows
  the browser language or the choice in *Clocks → App*. Only English ships with the app; another
  language is downloaded when chosen, and only the one in use is kept on the device for offline use.
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
- **Manual entries** follow the same rule. Their comment goes into F, appended with "; " when the
  day already has one. Hours follow the clock's minimum and rounding rule.
- **Delete** removes the entry's whole row (rows below move up, their formulas follow).
  **Cancel payment** clears the paid cell. Both first re-read the row and stop if it changed.
- **paid** holds the payout date. Older `TRUE`/`FALSE` (checkbox) values are still understood:
  `TRUE` counts as paid with no date. Marking a legacy checkbox row as paid replaces the checkbox
  with a date.
- If you point a clock at an **empty tab**, the app sets it up from the clock's settings: header
  row (bold, frozen), number/date formats, the sheet view and the totals described below.
- If the tab **doesn't match** (for example the header says `USD/hour` but the clock uses EUR),
  a warning lists what is expected and what was found. Syncing pauses, sessions stay queued on the
  device, and the warning stays until the sheet or the clock settings are fixed.

### Header names (clock settings → Advanced settings)

The columns always stay in the order A–F, but their names can be changed per clock: to match an
existing table that uses other names, or to have the sheet in your language.

- **Fill in** with the names in the app's language, the English defaults, or **from this tab**
  (takes the tab's current header row; the currency inside the rate name becomes `{currency}`).
  When an existing tab only differs by its names, the warning offers *Use this tab's names*.
- `{currency}` in the rate name is replaced by the clock's currency, e.g. `Ставка, {currency}/год`.
  The app still notices when the sheet's header names another currency.
- If the tab matched the previous names and only the names change, saving renames the tab's
  header row. Changing the currency never rewrites the header, because the rates already in
  column C are in the old currency.

### Sheet view and totals

New tabs (and existing ones, with *Advanced settings → Apply to this tab*) get:

- a **filter on the header row** that sorts entries by date, newest first, and hides paid rows
  (`TRUE` or a date in *paid*). Anyone can change or remove it in Sheets with the header's filter
  buttons. Sheets doesn't re-sort or re-filter by itself, so after each write the app re-applies
  whatever filter the tab has; a tab without a filter is left alone.
- **totals in `H1:P1`** with the report's numbers: due now (unpaid), paid and total, each as
  amount and hours. They are formulas, so everyone with access sees the same numbers without
  the app. In the sheet a row counts as paid when *paid* holds `TRUE` or a date.

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
   Both are non-sensitive, so no Google verification is needed. Then go to **Audience → Publish app**
   (status *In production*). While the app is in *Testing*, Google shows a
   "Google hasn't verified this app" screen and blocks anyone not on the test-user list.
   Don't upload a logo: that requires brand verification.
4. [Create an OAuth client](https://console.cloud.google.com/auth/clients/create) of type **Web application**.
   Under **Authorized JavaScript origins** add `https://<user>.github.io`, and add
   `http://localhost:8000` for local development.
5. [Create an API key](https://console.cloud.google.com/apis/credentials) for the file picker.
   Restrict it to **Websites** `https://<user>.github.io/*` (plus `http://localhost:8000/*`) and
   to the **Google Picker API**. Use the origin, not the repository path: the picker runs in a
   cross-site frame, so browsers send only the origin as the referrer, and a path pattern makes
   the picker fail with *"The API developer key is invalid"*.
6. Copy the **project number** from [IAM & Admin → Settings](https://console.cloud.google.com/iam-admin/settings).
7. Store the three values as **repository variables**: Settings → Secrets and variables →
   Actions → **Variables** → *New repository variable*:

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | `1234567890-abc.apps.googleusercontent.com` |
   | `GOOGLE_API_KEY` | `AIza…` |
   | `GOOGLE_APP_ID` | `1234567890` (project number) |

   Or use the CLI: `gh variable set GOOGLE_CLIENT_ID --body '…'`, and the same for the other two.

   The workflow generates `config.js` from these on every deploy, so the committed `config.js`
   stays empty. After changing a variable, re-run the latest *Deploy to GitHub Pages* workflow.
   The config is part of the version stamp, so installed apps pick up the change.
   (Committing the values into `config.js` also works; the variables win when they are set.)

   Use *variables*, not *secrets*: the values end up in the published `config.js` anyway.
   They are public by design, because the OAuth client only works from your authorized origin
   and the key is restricted. Until they are set, the app shows the setup assistant, which can
   also save the values on a single device.

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

### Translations

UI text lives in `src/i18n/locales/<code>.json`, grouped one level deep (`report.dueNow`). Use it
in templates as `{{ $t('report.dueNow') }}` and in code via `t()` from `src/i18n/index.js`.
`{name}` placeholders are filled from params. A plural message is an object keyed by
`Intl.PluralRules` category (`one`, `few`, `many`, `other`) and picks its form from `count`.
Numbers, money and dates are formatted with `Intl` in the chosen language.

- New text: add the key to `en.json` and to every other language. `tests/i18n.test.js` fails
  until all languages have the same keys, placeholders and plural forms.
- New language: add `locales/<code>.json` and list it in `src/i18n/languages.js`. Don't add it to
  `ASSETS`: only `en.json` is precached, and the service worker stores just the language in use.
- The Google Cloud setup assistant (shown only to whoever deploys the app) stays in English,
  because it mirrors the Google Cloud Console steps.

```
src/domain/      pure business rules (tested): ledger.js (sheet layout, parsing, write plans,
                 report), time.js (rounding, threshold), format.js (Intl formatting)
src/i18n/        index.js (current language, t()), translate.js, languages.js, locales/*.json
src/services/    google-auth.js, picker.js, sheets.js (REST), mock.js (demo backend),
                 timesheet.js (sheet operations), sync.js (offline queue), config.js
src/state/       store.js (localStorage-backed state), now.js, toast.js
src/components/  Vue components (App, ClockView, ReportView, EntryDialog, EntryForm, Modal, …)
src/pwa/         install prompt, service worker updates
sw.js            precache + update channel
tools/           dev scripts (run inside the container)
```

## Data & privacy

- Clocks, running timers, unsynced entries and the language choice live in the browser's `localStorage`.
  Installed apps ask the browser to keep that storage persistent.
- Timesheet data only goes to Google Sheets, over the user's own Google account. There is no
  server and no analytics.
