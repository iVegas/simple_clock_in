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
    <div v-if="visible" class="banner install-banner" role="region" :aria-label="$t('install.region')">
      <img src="assets/icons/icon.svg" alt="" width="40" height="40">
      <div class="banner-text">
        <strong>{{ $t('install.title') }}</strong>
        <span v-if="install.deferred">{{ $t('install.pitch') }}</span>
        <span v-else>{{ $t('install.ios') }}</span>
      </div>
      <button v-if="install.deferred" class="btn primary small" @click="promptInstall">{{ $t('install.button') }}</button>
      <button class="btn ghost icon-only" :aria-label="$t('install.notNow')" :title="$t('install.notNow')" @click="dismissInstall()"><Icon name="close"/></button>
    </div>`,
};

export const UpdateBanner = {
  name: 'UpdateBanner',
  setup: () => ({ updates, applyUpdate }),
  template: /* html */`
    <div v-if="updates.waiting" class="banner update-banner" role="status">
      <div class="banner-text"><strong>{{ $t('install.ready') }}</strong></div>
      <button class="btn primary small" @click="applyUpdate">{{ $t('install.reload') }}</button>
    </div>`,
};

export const Toasts = {
  name: 'Toasts',
  setup() {
    const run = (item) => {
      dismissToast(item.id);
      item.action.run();
    };
    return { toasts, dismissToast, run };
  },
  template: /* html */`
    <div class="toasts" role="status" aria-live="polite">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="item.tone">
        <span class="toast-text">{{ item.message }}</span>
        <button v-if="item.action" class="btn small ghost" @click="run(item)">{{ item.action.label }}</button>
        <button class="toast-close" :aria-label="$t('install.dismiss')" @click="dismissToast(item.id)">×</button>
      </div>
    </div>`,
};
