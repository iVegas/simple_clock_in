// Report: what is due now, records by month/status, "Mark paid" per unpaid day.
// Tapping an entry opens its details (cancel payment, delete); "Add entry" records time by hand.
import { ref, computed, watch, onMounted } from 'vue';
import Icon from './Icon.js';
import StructureWarning from './StructureWarning.js';
import EntryDialog from './EntryDialog.js';
import EntryForm from './EntryForm.js';
import { store, activeClock, pendingFor } from '../state/store.js';
import { toast } from '../state/toast.js';
import { t } from '../i18n/index.js';
import { syncClock, readSyncState } from '../services/sync.js';
import { markPaid, unmarkPaid, deleteEntry } from '../services/timesheet.js';
import { describeError } from '../services/errors.js';
import { summarize } from '../domain/ledger.js';
import { formatHours, formatMoney, formatNumber, formatDay, formatMonth, formatTime } from '../domain/format.js';

const STATUSES = ['unpaid', 'paid', 'all'];

const EntryRow = {
  name: 'EntryRow',
  components: { Icon },
  props: { r: Object, currency: String, canWrite: Boolean, busy: Boolean },
  emits: ['pay', 'open'],
  setup: () => ({ formatHours, formatMoney, formatNumber, formatDay }),
  template: /* html */`
    <li class="entry">
      <button type="button" class="entry-main" :aria-label="$t('entry.details') + ': ' + formatDay(r.date)" @click="$emit('open', r)">
        <span class="entry-date">{{ formatDay(r.date) }}</span>
        <span class="entry-calc muted">{{ formatHours(r.hours) }} × {{ r.rate === null ? '—' : formatNumber(r.rate) }}</span>
        <span v-if="r.comment" class="entry-comment muted">{{ r.comment }}</span>
      </button>
      <div class="entry-side">
        <span class="entry-sum">{{ formatMoney(r.sum, currency) }}</span>
        <span v-if="r.paid.paid" class="tag ok">{{ r.paid.date ? $t('entry.paidOn', { date: formatDay(r.paid.date) }) : $t('entry.paid') }}</span>
        <button v-else class="btn small" :disabled="!canWrite || busy" @click="$emit('pay', r)">
          {{ busy ? $t('common.saving') : $t('entry.markPaid') }}
        </button>
        <span v-if="r.paid.raw" class="muted small">“{{ r.paid.raw }}”</span>
      </div>
    </li>`,
};

export default {
  name: 'ReportView',
  components: { Icon, StructureWarning, EntryRow, EntryDialog, EntryForm },
  setup() {
    const clock = activeClock;
    const month = ref('all');
    const status = ref('unpaid');
    const error = ref(null);
    const busy = ref(null); // { row, action } while a write runs
    const selected = ref(null); // record shown in the details dialog
    const adding = ref(false);

    const cache = computed(() => store.cache[clock.value?.id]);
    const report = computed(() => summarize(cache.value?.records ?? [], { month: month.value, status: status.value }));
    const loading = computed(() => readSyncState(clock.value?.id).busy);
    const canWrite = computed(() => clock.value?.structure?.state === 'ok');
    const readable = computed(() => clock.value?.structure?.readable !== false);
    const pendingCount = computed(() => pendingFor(clock.value?.id).length);
    const fetchedAt = computed(() => (cache.value?.fetchedAt ? formatTime(cache.value.fetchedAt) : ''));
    const busyFor = (record) => (busy.value?.row === record?.row ? busy.value.action : '');

    async function refresh(interactive = false) {
      if (!clock.value?.spreadsheetId) return;
      try {
        await syncClock(clock.value.id, { interactive });
        error.value = null;
      } catch (err) {
        error.value = err;
      }
    }

    /** Run one write for a record; reload the sheet afterwards (also when the row moved). */
    async function write(record, action, fn) {
      busy.value = { row: record.row, action };
      try {
        await fn();
        selected.value = null;
        await refresh(true);
        return true;
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
        if (err.code === 'row-moved') {
          selected.value = null;
          refresh(true);
        }
        return false;
      } finally {
        busy.value = null;
      }
    }

    async function pay(record) {
      const c = clock.value;
      if (await write(record, 'pay', () => markPaid(c, record))) {
        toast(t('entry.markedPaid', { date: formatDay(record.date) }), {
          tone: 'success',
          timeout: 8000,
          action: { label: t('common.undo'), run: () => unpay(record, c) },
        });
      }
    }

    async function unpay(record, c = clock.value) {
      if (await write(record, 'unpay', () => unmarkPaid(c, record))) {
        toast(t('entry.unpaidAgain', { date: formatDay(record.date) }));
      }
    }

    async function remove(record) {
      const c = clock.value;
      if (await write(record, 'delete', () => deleteEntry(c, record))) {
        toast(t('entry.deleted', { date: formatDay(record.date) }), { tone: 'success' });
      }
    }

    onMounted(() => refresh(false));
    watch(() => clock.value?.id, () => {
      month.value = 'all';
      selected.value = null;
      refresh(false);
    });

    return {
      clock, month, status, error, selected, adding, report, loading, canWrite, readable, pendingCount, fetchedAt, STATUSES,
      busyFor, refresh, pay, unpay, remove, describeError, formatHours, formatMoney, formatDay, formatMonth,
    };
  },
  template: /* html */`
    <section class="report" v-if="clock">
      <StructureWarning :clock="clock"/>

      <div v-if="!clock.spreadsheetId" class="alert info">
        <div class="alert-title"><Icon name="sheet"/> {{ $t('clock.noSheet') }}</div>
        <a class="btn small" :href="'#/clock/' + clock.id">{{ $t('common.connectSheet') }}</a>
      </div>

      <div class="card due">
        <div class="due-head">
          <span class="label">{{ $t('report.dueNow') }}</span>
          <button class="btn icon-only ghost" :class="{ spinning: loading }" :disabled="loading || !clock.spreadsheetId"
                  @click="refresh(true)" :aria-label="$t('report.refresh')" :title="$t('report.refresh')">
            <Icon name="refresh"/>
          </button>
        </div>
        <div class="due-amount">{{ formatMoney(report.dueNow.amount, clock.currency) }}</div>
        <div class="muted small">
          {{ $t('report.dueSummary', { hours: formatHours(report.dueNow.hours), count: report.dueNow.count }) }}
          <template v-if="fetchedAt"> · {{ $t('report.updated', { time: fetchedAt }) }}</template>
        </div>
      </div>

      <div v-if="error" class="alert" :class="error.code === 'network' ? 'info' : 'warn'">
        <p class="small">{{ describeError(error) }}</p>
        <button v-if="error.code === 'auth-required'" class="btn small" @click="refresh(true)"><Icon name="user"/> {{ $t('common.connectGoogle') }}</button>
      </div>

      <p v-if="pendingCount" class="muted small">{{ $t('report.pending', { count: pendingCount }) }}</p>

      <div class="row">
        <button class="btn" @click="adding = true"><Icon name="plus"/> {{ $t('report.addEntry') }}</button>
      </div>

      <template v-if="readable">
        <div class="filters">
          <label class="field compact">
            <span class="sr-only">{{ $t('report.month') }}</span>
            <select v-model="month">
              <option value="all">{{ $t('report.allMonths') }}</option>
              <option v-for="m in report.months" :key="m" :value="m">{{ formatMonth(m) }}</option>
            </select>
          </label>
          <div class="segmented" role="radiogroup" :aria-label="$t('report.status')">
            <button v-for="s in STATUSES" :key="s" role="radio" :aria-checked="status === s"
                    :class="{ on: status === s }" @click="status = s">{{ $t('report.' + s) }}</button>
          </div>
        </div>

        <div class="totals">
          <div><span class="label">{{ $t('report.unpaid') }}</span><strong>{{ formatMoney(report.totals.unpaid.amount, clock.currency) }}</strong><span class="muted small">{{ formatHours(report.totals.unpaid.hours) }}</span></div>
          <div><span class="label">{{ $t('report.paid') }}</span><strong>{{ formatMoney(report.totals.paid.amount, clock.currency) }}</strong><span class="muted small">{{ formatHours(report.totals.paid.hours) }}</span></div>
          <div><span class="label">{{ $t('report.total') }}</span><strong>{{ formatMoney(report.totals.all.amount, clock.currency) }}</strong><span class="muted small">{{ formatHours(report.totals.all.hours) }}</span></div>
        </div>

        <template v-if="status === 'paid'">
          <div v-for="p in report.payouts" :key="p.date ?? 'legacy'" class="payout">
            <div class="payout-head">
              <span>{{ p.date ? $t('report.paidOut', { date: formatDay(p.date) }) : $t('report.paidNoDate') }}</span>
              <strong>{{ formatMoney(p.amount, clock.currency) }}</strong>
            </div>
            <ul class="entries">
              <EntryRow v-for="r in p.rows" :key="r.row" :r="r" :currency="clock.currency" @open="selected = $event"/>
            </ul>
          </div>
        </template>
        <ul v-else class="entries">
          <EntryRow v-for="r in report.rows" :key="r.row" :r="r" :currency="clock.currency"
                    :can-write="canWrite" :busy="busyFor(r) === 'pay'" @pay="pay" @open="selected = $event"/>
        </ul>

        <p v-if="!report.rows.length" class="empty muted">
          {{ status === 'unpaid' ? $t('report.nothingDue') : $t('report.noRecords') }}
        </p>
      </template>

      <EntryDialog v-if="selected" :record="selected" :clock="clock" :can-write="canWrite" :busy="busyFor(selected)"
                   @close="selected = null" @pay="pay" @unpay="unpay" @delete="remove"/>
      <EntryForm v-if="adding" :clock="clock" @close="adding = false"/>
    </section>`,
};
