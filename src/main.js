import { createApp } from 'vue';
import { MOCK } from './mode.js';
import { install } from './pwa/install.js';
import { registerServiceWorker } from './pwa/updates.js';
import { initBackend } from './services/backend.js';
import { isConfigured } from './services/config.js';
import { syncInBackground } from './services/sync.js';
import App from './components/App.js';

const backend = await initBackend();

createApp(App).mount('#app');

registerServiceWorker().catch((err) => console.warn('Service worker registration failed', err));

// Load Google sign-in early so a later click can open its popup without delay.
if (!MOCK && isConfigured()) backend.auth.preload().catch(() => {});

// Installed app: ask the browser not to evict our local data (timers, unsynced sessions).
if (install.standalone) navigator.storage?.persist?.().catch(() => {});

// Flush sessions saved while offline / signed out, and refresh today's totals. Never opens popups.
syncInBackground();
window.addEventListener('online', () => syncInBackground({ maxAgeMs: 0 }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncInBackground();
});
