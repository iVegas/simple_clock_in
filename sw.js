// Service worker: offline app shell + update channel.
// tools/build-site.sh stamps VERSION with the commit SHA on deploy, so every deploy changes
// this file -> the browser installs the new worker -> the app offers "Reload".
const VERSION = '__APP_VERSION__';
const DEV = VERSION.startsWith('__'); // unstamped local checkout: network-first, no stale files
const CACHE = `clockin-${VERSION}`;

// Every file the app needs offline (tests/sw-assets.test.js keeps this list complete).
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './assets/app.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './vendor/vue.esm-browser.prod.js',
  './src/main.js',
  './src/mode.js',
  './src/router.js',
  './src/version.js',
  './src/components/App.js',
  './src/components/Banners.js',
  './src/components/ClockEditor.js',
  './src/components/ClockView.js',
  './src/components/ClocksView.js',
  './src/components/Icon.js',
  './src/components/ReportView.js',
  './src/components/SetupAssistant.js',
  './src/components/SetupView.js',
  './src/components/StructureWarning.js',
  './src/components/SyncStatus.js',
  './src/domain/format.js',
  './src/domain/ledger.js',
  './src/domain/time.js',
  './src/pwa/install.js',
  './src/pwa/updates.js',
  './src/services/backend.js',
  './src/services/config.js',
  './src/services/errors.js',
  './src/services/google-auth.js',
  './src/services/mock.js',
  './src/services/picker.js',
  './src/services/sheets.js',
  './src/services/sync.js',
  './src/services/timesheet.js',
  './src/services/util.js',
  './src/state/now.js',
  './src/state/store.js',
  './src/state/toast.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the HTTP cache (GitHub Pages serves max-age=600).
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('clockin-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// The page asks the waiting worker to take over when the user taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return; // Google APIs: network only
  event.respondWith(DEV ? networkFirst(request) : cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  if (request.mode === 'navigate') return (await cache.match('./index.html')) ?? fetch(request);
  return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request.mode === 'navigate' ? './index.html' : request, response.clone());
    return response;
  } catch {
    if (request.mode === 'navigate') return (await cache.match('./index.html')) ?? Response.error();
    return (await cache.match(request, { ignoreSearch: true })) ?? Response.error();
  }
}
