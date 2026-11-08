// Install prompt, update prompt, running-clock reminders and toasts.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import { install, canInstall, promptInstall, dismissInstall } from '../pwa/install.js';
import { updates, applyUpdate } from '../pwa/updates.js';
import { toasts, dismissToast } from '../state/toast.js';
import { store } from '../state/store.js';
import { now } from '../state/now.js';
import { dueReminders, dismissReminder } from '../state/reminders.js';
import { clockOut } from '../services/sync.js';
import { go } from '../router.js';
import { formatDuration } from '../domain/format.js';

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

/** "“Acme” is still running · Running for 8 hr, 5 min" with Clock out / dismiss. */
export const ReminderBanner = {
  name: 'ReminderBanner',
  components: { Icon },
  setup() {
    const due = computed(dueReminders);
    const busy = ref(null);
    function open(clock) {
      dismissReminder(clock);
      store.activeClockId = clock.id;
      go('/');
    }
    async function out(clock) {
      busy.value = clock.id;
      try {
        dismissReminder(clock);
        await clockOut(clock);
      } finally {
        busy.value = null;
      }
    }
    return { due, busy, now, open, out, dismissReminder, formatDuration };
  },
  template: /* html */`
    <div v-for="c in due" :key="c.id" class="banner reminder-banner" role="alert">
      <Icon name="clock"/>
      <button type="button" class="banner-text banner-link" @click="open(c)">
        <strong>{{ $t('reminder.title', { name: c.name }) }}</strong>
        <span>{{ $t('reminder.body', { duration: formatDuration(now - c.running.startedAt) }) }}</span>
      </button>
      <button class="btn primary small" :disabled="busy === c.id" @click="out(c)">{{ $t('clock.out') }}</button>
      <button class="btn ghost icon-only" :aria-label="$t('install.dismiss')" :title="$t('install.dismiss')" @click="dismissReminder(c)"><Icon name="close"/></button>
    </div>`,
};
