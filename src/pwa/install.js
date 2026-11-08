// "Install the app" prompt. Browsers only show their install dialog from a user gesture,
// so we keep the deferred beforeinstallprompt event and show our own banner.
import { reactive, markRaw } from 'vue';

const DISMISS_KEY = 'clockin.installDismissedUntil';
const standaloneQuery = matchMedia('(display-mode: standalone)');

export const install = reactive({
  deferred: window.__bip ? markRaw(window.__bip) : null, // captured early by index.html
  standalone: standaloneQuery.matches || navigator.standalone === true,
  ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  installed: false,
  dismissedUntil: Number(localStorage.getItem(DISMISS_KEY) || 0),
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  install.deferred = markRaw(e);
});
window.addEventListener('appinstalled', () => {
  install.deferred = null;
  install.installed = true;
});
standaloneQuery.addEventListener('change', (e) => { install.standalone = e.matches; });

/** Can this browser install the app right now (natively or via the iOS share sheet)? */
export const canInstall = () => !install.standalone && !install.installed && (!!install.deferred || install.ios);

export async function promptInstall() {
  const e = install.deferred;
  if (!e) return false;
  install.deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export function dismissInstall(days = 14) {
  install.dismissedUntil = Date.now() + days * 86_400_000;
  try { localStorage.setItem(DISMISS_KEY, String(install.dismissedUntil)); } catch { /* ignore */ }
}
