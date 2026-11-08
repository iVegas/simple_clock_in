// Install prompt, update prompt and toasts.
import { computed } from 'vue';
import Icon from './Icon.js';
import { install, canInstall, promptInstall, dismissInstall } from '../pwa/install.js';
import { updates, applyUpdate } from '../pwa/updates.js';
import { toasts, dismissToast } from '../state/toast.js';

export const InstallBanner = {
  name: 'InstallBanner',
  components: { Icon },
  setup() {
    const visible = computed(() => canInstall() && Date.now() > install.dismissedUntil);
    return { install, visible, promptInstall, dismissInstall };
  },
  template: /* html */`
    <div v-if="visible" class="banner install-banner" role="region" aria-label="Install app">
      <img src="assets/icons/icon.svg" alt="" width="40" height="40">
      <div class="banner-text">
        <strong>Install Clock In</strong>
        <span v-if="install.deferred">One tap to clock in, works offline, updates itself.</span>
        <span v-else>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
      </div>
      <button v-if="install.deferred" class="btn primary small" @click="promptInstall">Install</button>
      <button class="btn ghost icon-only" aria-label="Not now" title="Not now" @click="dismissInstall()"><Icon name="close"/></button>
    </div>`,
};

export const UpdateBanner = {
  name: 'UpdateBanner',
  setup: () => ({ updates, applyUpdate }),
  template: /* html */`
    <div v-if="updates.waiting" class="banner update-banner" role="status">
      <div class="banner-text"><strong>A new version is ready.</strong></div>
      <button class="btn primary small" @click="applyUpdate">Reload</button>
    </div>`,
};

export const Toasts = {
  name: 'Toasts',
  setup() {
    const run = (t) => {
      dismissToast(t.id);
      t.action.run();
    };
    return { toasts, dismissToast, run };
  },
  template: /* html */`
    <div class="toasts" role="status" aria-live="polite">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.tone">
        <span class="toast-text">{{ t.message }}</span>
        <button v-if="t.action" class="btn small ghost" @click="run(t)">{{ t.action.label }}</button>
        <button class="toast-close" aria-label="Dismiss" @click="dismissToast(t.id)">×</button>
      </div>
    </div>`,
};
