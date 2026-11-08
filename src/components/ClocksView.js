// Clocks list + Google account + language + app info.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import LanguageSelect from './LanguageSelect.js';
import { store, pendingFor, deleteClock } from '../state/store.js';
import { toast } from '../state/toast.js';
import { t } from '../i18n/index.js';
import { go } from '../router.js';
import { MOCK } from '../mode.js';
import { backend } from '../services/backend.js';
import { isConfigured, hasOverride } from '../services/config.js';
import { describeError } from '../services/errors.js';
import { install, canInstall, promptInstall } from '../pwa/install.js';
import { updates, checkForUpdate, applyUpdate } from '../pwa/updates.js';
import { APP_VERSION, IS_DEV_BUILD } from '../version.js';
import { formatHours, formatMoney, formatList } from '../domain/format.js';

export default {
  name: 'ClocksView',
  components: { Icon, LanguageSelect },
  setup() {
    const auth = backend.auth.state;
    const confirmId = ref(null);
    const version = IS_DEV_BUILD ? t('appInfo.devBuild') : APP_VERSION;
    const configured = computed(() => MOCK || isConfigured());

    function use(clock) {
      store.activeClockId = clock.id;
      go('/');
    }

    function remove(clock) {
      if (confirmId.value !== clock.id) {
        confirmId.value = clock.id;
        setTimeout(() => { if (confirmId.value === clock.id) confirmId.value = null; }, 5000);
        return;
      }
      deleteClock(clock.id);
      confirmId.value = null;
      toast(t('clocks.deleted', { name: clock.name }));
      if (!store.clocks.length) go('/setup');
    }

    const deleteWarning = (clock) => {
      const count = pendingFor(clock.id).length;
      const lost = [];
      if (clock.running) lost.push(t('clocks.lossRunning'));
      if (count) lost.push(t('clocks.lossPending', { count }));
      return lost.length ? t('clocks.deleteConfirmLoss', { what: formatList(lost) }) : t('clocks.deleteConfirm');
    };

    async function signIn() {
      try {
        await backend.auth.getToken({ interactive: true });
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
      }
    }

    function signOut() {
      backend.auth.signOut();
      toast(t('account.signedOut'));
    }

    async function check() {
      const found = await checkForUpdate({ force: true });
      if (!found) toast(updates.supported ? t('appInfo.latest') : t('appInfo.unsupported'));
    }

    async function resetDemo() {
      const { resetMockData } = await import('../services/mock.js');
      resetMockData();
      toast(t('account.demoReset'));
    }

    return {
      store, auth, confirmId, version, configured, install, updates, MOCK,
      use, remove, deleteWarning, signIn, signOut, check, resetDemo, applyUpdate,
      canInstall, promptInstall, hasOverride, pendingFor, formatHours, formatMoney,
    };
  },
  template: /* html */`
    <section class="clocks">
      <div class="page-head"><h1>{{ $t('clocks.title') }}</h1></div>

      <ul class="clock-list">
        <li v-for="c in store.clocks" :key="c.id" class="card clock-card" :class="{ active: c.id === store.activeClockId }">
          <button class="clock-card-main" @click="use(c)">
            <span class="clock-name">
              <span v-if="c.running" class="dot" :aria-label="$t('clocks.running')"></span>{{ c.name }}
            </span>
            <span class="muted small">{{ $t('clocks.rateLine', { rate: formatMoney(c.rate, c.currency), unit: formatHours(c.unitHours) }) }}</span>
            <span class="muted small" v-if="c.spreadsheetId">{{ c.spreadsheetTitle }} › {{ c.sheetTitle }}</span>
            <span class="tags">
              <span v-if="c.id === store.activeClockId" class="tag">{{ $t('clocks.active') }}</span>
              <span v-if="!c.spreadsheetId" class="tag warn">{{ $t('clocks.noSheet') }}</span>
              <span v-if="c.structure?.state === 'mismatch'" class="tag warn">{{ $t('clocks.mismatch') }}</span>
              <span v-if="pendingFor(c.id).length" class="tag info">{{ $t('clocks.toSync', { count: pendingFor(c.id).length }) }}</span>
            </span>
          </button>
          <div class="clock-card-actions">
            <a class="btn small" :href="'#/clock/' + c.id">{{ $t('common.edit') }}</a>
            <button class="btn small ghost" :class="{ danger: confirmId === c.id }" @click="remove(c)">
              {{ confirmId === c.id ? deleteWarning(c) : $t('common.delete') }}
            </button>
          </div>
        </li>
      </ul>
      <a class="btn" href="#/clock/new"><Icon name="plus"/> {{ $t('clocks.add') }}</a>

      <div class="card">
        <h2>{{ $t('account.title') }}</h2>
        <template v-if="MOCK">
          <p class="small muted">{{ $t('account.demo') }}</p>
          <div class="row wrap">
            <button class="btn small" @click="resetDemo">{{ $t('account.resetDemo') }}</button>
            <a class="btn small ghost" href="?mock=0">{{ $t('account.leaveDemo') }}</a>
          </div>
        </template>
        <template v-else-if="!configured">
          <p class="small muted">{{ $t('account.notConfigured') }}</p>
          <a class="btn small" href="#/google-setup">{{ $t('account.openAssistant') }}</a>
        </template>
        <template v-else>
          <p class="small" v-if="auth.email">{{ $t('account.signedInAs', { email: auth.email }) }}</p>
          <p class="small muted" v-else>{{ $t('account.notSignedIn') }}</p>
          <div class="row wrap">
            <button v-if="auth.email" class="btn small" @click="signOut">{{ $t('account.signOut') }}</button>
            <button v-else class="btn small primary" @click="signIn"><Icon name="user"/> {{ $t('account.signIn') }}</button>
            <a class="btn small ghost" href="#/google-setup">{{ hasOverride() ? $t('account.googleSetupCustom') : $t('account.googleSetup') }}</a>
          </div>
        </template>
      </div>

      <div class="card">
        <h2>{{ $t('appInfo.title') }}</h2>
        <LanguageSelect/>
        <p class="small muted">{{ $t('appInfo.version', { version }) }}</p>
        <div class="row wrap">
          <button v-if="updates.waiting" class="btn small primary" @click="applyUpdate">{{ $t('appInfo.updateNow') }}</button>
          <button v-else class="btn small" :disabled="updates.checking" @click="check">
            <Icon name="refresh"/> {{ updates.checking ? $t('appInfo.checking') : $t('appInfo.check') }}
          </button>
          <button v-if="install.deferred && canInstall()" class="btn small" @click="promptInstall"><Icon name="download"/> {{ $t('appInfo.install') }}</button>
          <span v-else-if="install.standalone" class="small muted">{{ $t('appInfo.installed') }}</span>
        </div>
      </div>
    </section>`,
};
