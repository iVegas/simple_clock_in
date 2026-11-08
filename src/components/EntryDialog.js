// One sheet entry: details plus Mark paid / Cancel payment / Delete.
// Cancel payment and Delete ask for confirmation first; the parent does the writing.
import { ref, computed } from 'vue';
import Modal from './Modal.js';
import Icon from './Icon.js';
import { t } from '../i18n/index.js';
import { spreadsheetUrl } from '../services/util.js';
import { formatHours, formatMoney, formatNumber, formatDay, formatDayLong } from '../domain/format.js';

export default {
  name: 'EntryDialog',
  components: { Modal, Icon },
  props: {
    record: { type: Object, required: true },
    clock: { type: Object, required: true },
    canWrite: Boolean,
    busy: { type: String, default: '' }, // '' | 'pay' | 'unpay' | 'delete'
  },
  emits: ['close', 'pay', 'unpay', 'delete'],
  setup(props) {
    const confirming = ref(null); // null | 'unpay' | 'delete'
    const r = computed(() => props.record);
    const money = (n) => formatMoney(n, props.clock.currency);
    const day = computed(() => formatDay(r.value.date));
    const title = computed(() => ({ delete: t('entry.deleteTitle'), unpay: t('entry.unpayTitle') })[confirming.value]
      ?? formatDayLong(r.value.date));
    const status = computed(() => {
      const paid = r.value.paid;
      if (!paid.paid) return t('entry.unpaid');
      return paid.date ? t('entry.paidOn', { date: formatDay(paid.date) }) : t('report.paidNoDate');
    });
    const rowUrl = computed(() => `${spreadsheetUrl(props.clock.spreadsheetId, props.clock.sheetId)}&range=A${r.value.row}`);
    const deleteText = computed(() => t('entry.deleteText', { date: day.value, hours: formatHours(r.value.hours), sum: money(r.value.sum) }));
    const unpayText = computed(() => (r.value.paid.date
      ? t('entry.unpayText', { date: day.value, sum: money(r.value.sum), paidDate: formatDay(r.value.paid.date) })
      : t('entry.unpayTextNoDate', { date: day.value, sum: money(r.value.sum) })));

    return { confirming, r, title, status, rowUrl, deleteText, unpayText, money, formatHours, formatNumber };
  },
  template: /* html */`
    <Modal :title="title" @close="$emit('close')">
      <template v-if="confirming === 'delete'">
        <p>{{ deleteText }}</p>
        <p v-if="r.paid.paid" class="small warn-text"><Icon name="warning"/> {{ $t('entry.deletePaid') }}</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" :disabled="!!busy" @click="confirming = null">{{ $t('entry.keep') }}</button>
          <button type="button" class="btn destructive" :disabled="!!busy" @click="$emit('delete', r)">
            <Icon name="trash"/> {{ busy === 'delete' ? $t('common.saving') : $t('entry.deleteConfirm') }}
          </button>
        </div>
      </template>

      <template v-else-if="confirming === 'unpay'">
        <p>{{ unpayText }}</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" :disabled="!!busy" @click="confirming = null">{{ $t('entry.keep') }}</button>
          <button type="button" class="btn primary" :disabled="!!busy" @click="$emit('unpay', r)">
            {{ busy === 'unpay' ? $t('common.saving') : $t('entry.unpayConfirm') }}
          </button>
        </div>
      </template>

      <template v-else>
        <dl class="details">
          <dt>{{ $t('entry.hours') }}</dt><dd>{{ formatHours(r.hours) }}</dd>
          <dt>{{ $t('entry.rate') }}</dt><dd>{{ r.rate === null ? '—' : $t('common.perHour', { amount: money(r.rate) }) }}</dd>
          <dt>{{ $t('entry.sum') }}</dt><dd><strong>{{ money(r.sum) }}</strong></dd>
          <dt>{{ $t('entry.status') }}</dt><dd><span class="tag" :class="r.paid.paid ? 'ok' : 'warn'">{{ status }}</span></dd>
          <template v-if="r.comment"><dt>{{ $t('entry.comment') }}</dt><dd class="pre-line">{{ r.comment }}</dd></template>
        </dl>
        <a class="small" :href="rowUrl" target="_blank" rel="noopener">{{ $t('entry.row', { row: r.row }) }} · {{ $t('common.openInSheets') }} <Icon name="external"/></a>
        <p v-if="!canWrite" class="small muted">{{ $t('entry.readOnly') }}</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost danger" :disabled="!canWrite || !!busy" @click="confirming = 'delete'">
            <Icon name="trash"/> {{ $t('entry.delete') }}
          </button>
          <button v-if="r.paid.paid" type="button" class="btn" :disabled="!canWrite || !!busy" @click="confirming = 'unpay'">
            {{ $t('entry.cancelPayment') }}
          </button>
          <button v-else type="button" class="btn primary" :disabled="!canWrite || !!busy" @click="$emit('pay', r)">
            <Icon name="check"/> {{ busy === 'pay' ? $t('common.saving') : $t('entry.markPaid') }}
          </button>
        </div>
      </template>
    </Modal>`,
};
