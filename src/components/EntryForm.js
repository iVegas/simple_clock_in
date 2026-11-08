// Manual entry ("forgot to clock in"): date + hours, saved like a clocked session.
// Hours are rounded up to the clock's minimum tracked time, same rule as the timer.
import { ref, reactive, computed } from 'vue';
import Modal from './Modal.js';
import { t } from '../i18n/index.js';
import { store } from '../state/store.js';
import { addEntry } from '../services/sync.js';
import { localDateKey, roundUpToUnit, round2 } from '../domain/time.js';
import { formatHours } from '../domain/format.js';

export default {
  name: 'EntryForm',
  components: { Modal },
  props: { clock: { type: Object, required: true } },
  emits: ['close'],
  setup(props, { emit }) {
    const today = localDateKey();
    const form = reactive({ date: today, hours: '', rate: props.clock.rate, comment: '' });
    const touched = ref(false);

    const validHours = computed(() => typeof form.hours === 'number' && form.hours > 0 && form.hours <= 24);
    const recorded = computed(() => (validHours.value
      ? roundUpToUnit(Math.round(form.hours * 3600) * 1000, props.clock.unitHours) : 0));
    const rounded = computed(() => validHours.value && recorded.value !== round2(form.hours));
    // The day's unpaid row this entry will be added to (same rule as clock out).
    const existing = computed(() => (store.cache[props.clock.id]?.records ?? [])
      .find((r) => r.date === form.date && !r.paid.paid));

    const errors = computed(() => ({
      date: /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? '' : t('entryForm.errDate'),
      hours: validHours.value ? '' : t('entryForm.errHours'),
      rate: typeof form.rate === 'number' && form.rate >= 0 ? '' : t('entryForm.errRate'),
    }));

    function submit() {
      touched.value = true;
      if (Object.values(errors.value).some(Boolean)) return;
      const entry = { date: form.date, hours: recorded.value, rate: form.rate, comment: form.comment.trim(), manual: true };
      emit('close');
      addEntry(props.clock, entry);
    }

    return { today, form, touched, errors, recorded, rounded, existing, submit, formatHours };
  },
  template: /* html */`
    <Modal :title="$t('entryForm.title')" @close="$emit('close')">
      <form class="entry-form" @submit.prevent="submit" novalidate>
        <div class="field-row">
          <label class="field">
            <span class="field-label">{{ $t('entryForm.date') }}</span>
            <input v-model="form.date" type="date" :max="today" required :aria-invalid="touched && !!errors.date">
            <span v-if="touched && errors.date" class="field-error">{{ errors.date }}</span>
          </label>
          <label class="field">
            <span class="field-label">{{ $t('entryForm.hours') }}</span>
            <input v-model.number="form.hours" type="number" inputmode="decimal" min="0" max="24" step="0.01" placeholder="1.5"
                   autofocus :aria-invalid="touched && !!errors.hours">
            <span v-if="touched && errors.hours" class="field-error">{{ errors.hours }}</span>
          </label>
        </div>
        <p v-if="rounded" class="hint">{{ $t('entryForm.rounded', { hours: formatHours(recorded), unit: formatHours(clock.unitHours) }) }}</p>
        <p v-if="existing" class="hint">
          {{ $t('entryForm.addsToDay', { hours: formatHours(existing.hours) }) }}
          <template v-if="existing.rate !== null && existing.rate !== form.rate">{{ $t('entryForm.dayRate') }}</template>
        </p>
        <label class="field">
          <span class="field-label">{{ $t('entryForm.rate') }} ({{ clock.currency }})</span>
          <input v-model.number="form.rate" type="number" inputmode="decimal" min="0" step="0.01" :aria-invalid="touched && !!errors.rate">
          <span v-if="touched && errors.rate" class="field-error">{{ errors.rate }}</span>
        </label>
        <label class="field">
          <span class="field-label">{{ $t('entryForm.comment') }}</span>
          <input v-model="form.comment" maxlength="200" autocomplete="off" :placeholder="$t('entryForm.commentPlaceholder')">
        </label>
        <div class="modal-actions">
          <button type="button" class="btn ghost" @click="$emit('close')">{{ $t('common.cancel') }}</button>
          <button type="submit" class="btn primary">{{ $t('entryForm.add') }}</button>
        </div>
      </form>
    </Modal>`,
};
