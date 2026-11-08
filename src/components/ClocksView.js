// Clocks list + Google account + app info.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import { store, pendingFor, deleteClock } from '../state/store.js';
import { toast } from '../state/toast.js';
import { go } from '../router.js';
import { MOCK } from '../mode.js';
import { backend } from '../services/backend.js';
import { isConfigured, hasOverride } from '../services/config.js';
import { describeError } from '../services/errors.js';
import { install, canInstall, promptInstall } from '../pwa/install.js';
import { updates, checkForUpdate, applyUpdate } from '../pwa/updates.js';
import { APP_VERSION, IS_DEV_BUILD } from '../version.js';
import { formatHours, formatMoney } from '../domain/format.js';

export default {
  name: 'ClocksView',
  components: { Icon },
  setup() {
    const auth = backend.auth.state;
    const confirmId = ref(null);
    const version = IS_DEV_BUILD ? 'development build' : APP_VERSION;
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
      toast(`“${clock.name}” deleted. Its spreadsheet was not touched.`);
      if (!store.clocks.length) go('/setup');
    }

    const deleteWarning = (clock) => {
      const n = pendingFor(clock.id).length;
      const parts = [];
      if (clock.running) parts.push('the running session');
      if (n) parts.push(`${n} unsynced session${n > 1 ? 's' : ''}`);
      return parts.length ? `Tap again to delete — ${parts.join(' and ')} will be lost` : 'Tap again to delete';
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
      toast('Signed out of Google.');
    }

    async function check() {
      const found = await checkForUpdate({ force: true });
      if (!found) toast(updates.supported ? 'You have the latest version.' : 'Updates are not supported in this browser.');
    }

    async function resetDemo() {
      const { resetMockData } = await import('../services/mock.js');
      resetMockData();
      toast('Demo spreadsheet reset.');
    }

    return {
      store, auth, confirmId, version, configured, install, updates, MOCK,
      use, remove, deleteWarning, signIn, signOut, check, resetDemo, applyUpdate,
      canInstall, promptInstall, hasOverride, pendingFor, formatHours, formatMoney,
    };
  },
  template: /* html */`
    <section class="clocks">
      <div class="page-head"><h1>Clocks</h1></div>

      <ul class="clock-list">
        <li v-for="c in store.clocks" :key="c.id" class="card clock-card" :class="{ active: c.id === store.activeClockId }">
          <button class="clock-card-main" @click="use(c)">
            <span class="clock-name">
              <span v-if="c.running" class="dot" aria-label="running"></span>{{ c.name }}
            </span>
            <span class="muted small">{{ formatMoney(c.rate, c.currency) }}/hour · min {{ formatHours(c.unitHours) }}</span>
            <span class="muted small" v-if="c.spreadsheetId">{{ c.spreadsheetTitle }} › {{ c.sheetTitle }}</span>
            <span class="tags">
              <span v-if="c.id === store.activeClockId" class="tag">Active</span>
              <span v-if="!c.spreadsheetId" class="tag warn">No spreadsheet</span>
              <span v-if="c.structure?.state === 'mismatch'" class="tag warn">Layout mismatch</span>
              <span v-if="pendingFor(c.id).length" class="tag info">{{ pendingFor(c.id).length }} to sync</span>
            </span>
          </button>
          <div class="clock-card-actions">
            <a class="btn small" :href="'#/clock/' + c.id">Edit</a>
            <button class="btn small ghost" :class="{ danger: confirmId === c.id }" @click="remove(c)">
              {{ confirmId === c.id ? deleteWarning(c) : 'Delete' }}
            </button>
          </div>
        </li>
      </ul>
      <a class="btn" href="#/clock/new"><Icon name="plus"/> Add clock</a>

      <div class="card">
        <h2>Google account</h2>
        <template v-if="MOCK">
          <p class="small muted">Demo mode: a fake spreadsheet stored in this browser, no Google account involved.</p>
          <div class="row wrap">
            <button class="btn small" @click="resetDemo">Reset demo spreadsheet</button>
            <a class="btn small ghost" href="?mock=0">Leave demo mode</a>
          </div>
        </template>
        <template v-else-if="!configured">
          <p class="small muted">Google access isn’t configured for this app yet.</p>
          <a class="btn small" href="#/google-setup">Open setup assistant</a>
        </template>
        <template v-else>
          <p class="small" v-if="auth.email">Signed in as <strong>{{ auth.email }}</strong></p>
          <p class="small muted" v-else>Not signed in.</p>
          <div class="row wrap">
            <button v-if="auth.email" class="btn small" @click="signOut">Sign out</button>
            <button v-else class="btn small primary" @click="signIn"><Icon name="user"/> Sign in with Google</button>
            <a class="btn small ghost" href="#/google-setup">Google setup{{ hasOverride() ? ' (custom)' : '' }}</a>
          </div>
        </template>
      </div>

      <div class="card">
        <h2>App</h2>
        <p class="small muted">Version: {{ version }}</p>
        <div class="row wrap">
          <button v-if="updates.waiting" class="btn small primary" @click="applyUpdate">Update now</button>
          <button v-else class="btn small" :disabled="updates.checking" @click="check">
            <Icon name="refresh"/> {{ updates.checking ? 'Checking…' : 'Check for updates' }}
          </button>
          <button v-if="install.deferred && canInstall()" class="btn small" @click="promptInstall"><Icon name="download"/> Install app</button>
          <span v-else-if="install.standalone" class="small muted">Installed ✓</span>
        </div>
      </div>
    </section>`,
};
