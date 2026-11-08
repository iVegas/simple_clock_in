// Report: what is due now, records by month/status, "Mark paid" per unpaid day.
import { ref, computed, watch, onMounted } from 'vue';
import Icon from './Icon.js';
import StructureWarning from './StructureWarning.js';
import { store, activeClock, pendingFor } from '../state/store.js';
import { toast } from '../state/toast.js';
import { syncClock, readSyncState } from '../services/sync.js';
import { markPaid, unmarkPaid } from '../services/timesheet.js';
import { describeError } from '../services/errors.js';
import { summarize } from '../domain/ledger.js';
import { formatHours, formatMoney, formatDay, formatMonth } from '../domain/format.js';

const STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
];

const EntryRow = {
  name: 'EntryRow',
  props: { r: Object, currency: String, canWrite: Boolean, busy: Boolean },
  emits: ['pay'],
  setup: () => ({ formatHours, formatMoney, formatDay }),
  template: /* html */`
    <li class="entry">
      <div class="entry-main">
        <span class="entry-date">{{ formatDay(r.date) }}</span>
        <span class="entry-calc muted">{{ formatHours(r.hours) }} × {{ r.rate ?? '—' }}</span>
        <span v-if="r.comment" class="entry-comment muted">{{ r.comment }}</span>
      </div>
      <div class="entry-side">
        <span class="entry-sum">{{ formatMoney(r.sum, currency) }}</span>
        <span v-if="r.paid.paid" class="tag ok">{{ r.paid.date ? 'Paid ' + formatDay(r.paid.date) : 'Paid' }}</span>
        <button v-else class="btn small" :disabled="!canWrite || busy" @click="$emit('pay', r)">
          {{ busy ? 'Saving…' : 'Mark paid' }}
        </button>
        <span v-if="r.paid.raw" class="muted small">“{{ r.paid.raw }}”</span>
      </div>
    </li>`,
};

export default {
  name: 'ReportView',
  components: { Icon, StructureWarning, EntryRow },
  setup() {
    const clock = activeClock;
    const month = ref('all');
    const status = ref('unpaid');
    const error = ref(null);
    const busyRow = ref(null);

    const cache = computed(() => store.cache[clock.value?.id]);
    const report = computed(() => summarize(cache.value?.records ?? [], { month: month.value, status: status.value }));
    const loading = computed(() => readSyncState(clock.value?.id).busy);
    const canWrite = computed(() => clock.value?.structure?.state === 'ok');
    const readable = computed(() => clock.value?.structure?.readable !== false);
    const pendingCount = computed(() => pendingFor(clock.value?.id).length);
    const fetchedAt = computed(() => cache.value?.fetchedAt
      ? new Date(cache.value.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

    async function refresh(interactive = false) {
      if (!clock.value?.spreadsheetId) return;
      try {
        await syncClock(clock.value.id, { interactive });
        error.value = null;
      } catch (err) {
        error.value = err;
      }
    }

    async function pay(record) {
      const c = clock.value;
      busyRow.value = record.row;
      try {
        await markPaid(c, record);
        await refresh(true);
        toast(`${formatDay(record.date)} marked as paid.`, {
          tone: 'success',
          timeout: 8000,
          action: { label: 'Undo', run: () => undo(c, record) },
        });
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
        if (err.code === 'row-moved') refresh(true);
      } finally {
        busyRow.value = null;
      }
    }

    async function undo(c, record) {
      try {
        await unmarkPaid(c, record);
        await refresh(true);
        toast(`${formatDay(record.date)} is unpaid again.`);
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
      }
    }

    onMounted(() => refresh(false));
    watch(() => clock.value?.id, () => { month.value = 'all'; refresh(false); });

    return {
      clock, month, status, error, busyRow, report, loading, canWrite, readable, pendingCount, fetchedAt, STATUSES,
      refresh, pay, describeError, formatHours, formatMoney, formatDay, formatMonth,
    };
  },
  template: /* html */`
    <section class="report" v-if="clock">
      <StructureWarning :clock="clock"/>

      <div v-if="!clock.spreadsheetId" class="alert info">
        <div class="alert-title"><Icon name="sheet"/> No spreadsheet connected</div>
        <a class="btn small" :href="'#/clock/' + clock.id">Connect spreadsheet</a>
      </div>

      <div class="card due">
        <div class="due-head">
          <span class="label">Due now</span>
          <button class="btn icon-only ghost" :class="{ spinning: loading }" :disabled="loading || !clock.spreadsheetId"
                  @click="refresh(true)" aria-label="Refresh from sheet" title="Refresh from sheet">
            <Icon name="refresh"/>
          </button>
        </div>
        <div class="due-amount">{{ formatMoney(report.dueNow.amount, clock.currency) }}</div>
        <div class="muted small">
          {{ formatHours(report.dueNow.hours) }} · {{ report.dueNow.count }} unpaid day{{ report.dueNow.count === 1 ? '' : 's' }}
          <template v-if="fetchedAt"> · updated {{ fetchedAt }}</template>
        </div>
      </div>

      <div v-if="error" class="alert" :class="error.code === 'network' ? 'info' : 'warn'">
        <p class="small">{{ describeError(error) }}</p>
        <button v-if="error.code === 'auth-required'" class="btn small" @click="refresh(true)"><Icon name="user"/> Connect Google</button>
      </div>

      <p v-if="pendingCount" class="muted small">
        {{ pendingCount }} session{{ pendingCount > 1 ? 's' : '' }} waiting to sync {{ pendingCount > 1 ? 'are' : 'is' }} not included yet.
      </p>

      <template v-if="readable">
        <div class="filters">
          <label class="field compact">
            <span class="sr-only">Month</span>
            <select v-model="month">
              <option value="all">All months</option>
              <option v-for="m in report.months" :key="m" :value="m">{{ formatMonth(m) }}</option>
            </select>
          </label>
          <div class="segmented" role="radiogroup" aria-label="Status">
            <button v-for="s in STATUSES" :key="s.value" role="radio" :aria-checked="status === s.value"
                    :class="{ on: status === s.value }" @click="status = s.value">{{ s.label }}</button>
          </div>
        </div>

        <div class="totals">
          <div><span class="label">Unpaid</span><strong>{{ formatMoney(report.totals.unpaid.amount, clock.currency) }}</strong><span class="muted small">{{ formatHours(report.totals.unpaid.hours) }}</span></div>
          <div><span class="label">Paid</span><strong>{{ formatMoney(report.totals.paid.amount, clock.currency) }}</strong><span class="muted small">{{ formatHours(report.totals.paid.hours) }}</span></div>
          <div><span class="label">Total</span><strong>{{ formatMoney(report.totals.all.amount, clock.currency) }}</strong><span class="muted small">{{ formatHours(report.totals.all.hours) }}</span></div>
        </div>

        <template v-if="status === 'paid'">
          <div v-for="p in report.payouts" :key="p.date ?? 'legacy'" class="payout">
            <div class="payout-head">
              <span>{{ p.date ? 'Paid out ' + formatDay(p.date) : 'Paid (no date recorded)' }}</span>
              <strong>{{ formatMoney(p.amount, clock.currency) }}</strong>
            </div>
            <ul class="entries">
              <EntryRow v-for="r in p.rows" :key="r.row" :r="r" :currency="clock.currency"/>
            </ul>
          </div>
        </template>
        <ul v-else class="entries">
          <EntryRow v-for="r in report.rows" :key="r.row" :r="r" :currency="clock.currency"
                    :can-write="canWrite" :busy="busyRow === r.row" @pay="pay"/>
        </ul>

        <p v-if="!report.rows.length" class="empty muted">
          {{ status === 'unpaid' ? 'Nothing is waiting to be paid.' : 'No records for this filter.' }}
        </p>
      </template>
    </section>`,
};
