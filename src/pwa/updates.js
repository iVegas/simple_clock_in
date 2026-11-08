// Service worker registration + update flow. GitHub Pages is the update source:
// each deploy changes sw.js (version stamp), the browser installs it in the background,
// and we offer a one-tap reload once it is waiting.
import { reactive, markRaw } from 'vue';

export const updates = reactive({
  supported: 'serviceWorker' in navigator,
  waiting: null,
  checking: false,
  lastCheck: 0,
});

let registration = null;
let reloadRequested = false;

function track(worker) {
  worker?.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) updates.waiting = markRaw(worker);
  });
}

export async function registerServiceWorker() {
  if (!updates.supported) return;
  registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  updates.lastCheck = Date.now();
  if (registration.waiting && navigator.serviceWorker.controller) updates.waiting = markRaw(registration.waiting);
  track(registration.installing);
  registration.addEventListener('updatefound', () => track(registration.installing));

  // Reload only when the user asked for the update (not on the very first install).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

/** Ask the browser to re-fetch sw.js. Throttled to once an hour unless forced. */
export async function checkForUpdate({ force = false } = {}) {
  if (!registration || (!force && Date.now() - updates.lastCheck < 3_600_000)) return false;
  updates.lastCheck = Date.now();
  updates.checking = true;
  try {
    await registration.update();
  } catch { /* offline */ } finally {
    updates.checking = false;
  }
  return !!(updates.waiting || registration.installing);
}

export function applyUpdate() {
  if (!updates.waiting) return;
  reloadRequested = true;
  updates.waiting.postMessage({ type: 'SKIP_WAITING' });
}
