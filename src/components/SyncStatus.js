// Pending sessions for a clock + manual retry / Google reconnect.
import { computed } from 'vue';
import Icon from './Icon.js';
import { pendingFor } from '../state/store.js';
import { syncClock, readSyncState } from '../services/sync.js';
import { describeError } from '../services/errors.js';
import { formatHours, formatDay } from '../domain/format.js';
import { round2 } from '../domain/time.js';
import { toast } from '../state/toast.js';

export default {
  name: 'SyncStatus',
  components: { Icon },
  props: { clock: { type: Object, required: true } },
  setup(props) {
    const pending = computed(() => pendingFor(props.clock.id));
    const state = computed(() => readSyncState(props.clock.id));
    const total = computed(() => round2(pending.value.reduce((a, p) => a + p.hours, 0)));
    const needsAuth = computed(() => state.value.error === 'auth-required');

    async function retry() {
      try {
        const res = await syncClock(props.clock.id, { interactive: true });
        if (res.status === 'ok' && res.synced) toast(`Synced ${res.synced} session(s).`, { tone: 'success' });
        if (res.status === 'not-connected') location.hash = `#/clock/${props.clock.id}`;
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
      }
    }

    return { pending, state, total, needsAuth, retry, formatHours, formatDay };
  },
  template: /* html */`
    <div v-if="pending.length" class="alert info sync" role="status">
      <div class="alert-title">
        <Icon name="cloud"/>
        <span v-if="state.busy">Syncing…</span>
        <span v-else>{{ pending.length }} session{{ pending.length > 1 ? 's' : '' }} ({{ formatHours(total) }}) waiting to sync</span>
      </div>
      <ul class="pending-list small">
        <li v-for="p in pending" :key="p.id">{{ formatDay(p.date) }} · {{ formatHours(p.hours) }}</li>
      </ul>
      <p v-if="state.message && !state.busy" class="small muted">{{ state.message }}</p>
      <div class="row" v-if="!state.busy && state.error !== 'structure'">
        <button class="btn small" @click="retry">
          <Icon :name="needsAuth ? 'user' : 'refresh'"/> {{ !clock.spreadsheetId ? 'Connect spreadsheet' : needsAuth ? 'Connect Google' : 'Sync now' }}
        </button>
      </div>
    </div>`,
};
