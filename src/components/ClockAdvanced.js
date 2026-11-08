// Advanced clock settings (collapsed): rounding rule, running-clock reminder, header names of the
// tab, and the sheet view
// (newest first, paid rows hidden, totals in H1:P1) for an existing tab.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import { i18n, t } from '../i18n/index.js';
import { LANGUAGES } from '../i18n/languages.js';
import { toast } from '../state/toast.js';
import { applySheetView } from '../services/timesheet.js';
import { describeError } from '../services/errors.js';
import { HEADER_KEYS, COLUMN_LETTERS, DEFAULT_HEADERS, CURRENCY_TOKEN, TOTALS_RANGE } from '../domain/ledger.js';
import {
  HOUR_MS, ROUNDING_MODES, ROUNDING_STEPS, REMINDER_AFTER_HOURS, REMINDER_EVERY_MINUTES, recordedHours, isValidUnit,
} from '../domain/time.js';
import { formatDuration, formatHours } from '../domain/format.js';
import { notifications, allowNotifications } from '../state/reminders.js';

const MODE_KEYS = { up: 'roundUp', nearest: 'roundNearest', down: 'roundDown', none: 'roundNone' };
const EXAMPLE_MINUTES = [52, 67, 83];
const ROLE_KEYS = { date: 'roleDate', hours: 'roleHours', rate: 'roleRate', sum: 'roleSum', paid: 'rolePaid', comment: 'roleComment' };

export default {
  name: 'ClockAdvanced',
  components: { Icon },
  props: {
    headers: { type: Object, required: true }, // reactive drafts, edited in place
    rounding: { type: Object, required: true }, // { mode, stepMinutes }
    reminder: { type: Object, required: true }, // { afterHours, everyMinutes }
    unitHours: { type: Number, default: 0 }, // minimum tracked time (draft)
    currency: { type: String, default: '' },
    spreadsheetId: { type: String, default: '' },
    tab: { type: Object, default: null }, // selected tab (getMeta), when loaded
    canAdopt: Boolean, // the tab has a header row to take names from
    layoutOk: Boolean, // the tab matches the (draft) layout
    error: { type: String, default: '' },
  },
  emits: ['adopt', 'applied'],
  setup(props, { emit }) {
    const busy = ref(false);
    const languageName = computed(() => LANGUAGES.find((l) => l.code === i18n.locale)?.name);
    const fields = HEADER_KEYS.map((key, i) => ({ key, column: COLUMN_LETTERS[i], role: ROLE_KEYS[key] }));

    const fill = (names) => Object.assign(props.headers, names);
    // "52 min → 1 hr · 1 hr, 7 min → 1.25 hr …" for the current draft rule.
    const examples = computed(() => (isValidUnit(props.unitHours)
      ? EXAMPLE_MINUTES.map((m) => `${formatDuration(m * 60_000)} → ${formatHours(recordedHours(m * 60_000, { unitHours: props.unitHours, rounding: props.rounding }))}`).join(' · ')
      : ''));
    const minLabel = computed(() => (isValidUnit(props.unitHours) ? formatDuration(props.unitHours * HOUR_MS) : '—'));
    const fillLanguage = () => fill(Object.fromEntries(HEADER_KEYS.map((k) => [k, t(`sheetHeaders.${k}`)])));
    const fillDefaults = () => fill(DEFAULT_HEADERS);

    async function applyView() {
      busy.value = true;
      try {
        await applySheetView(props.spreadsheetId, props.tab, { currency: props.currency }, { interactive: true });
        toast(t('editor.viewApplied', { range: TOTALS_RANGE }), { tone: 'success' });
        emit('applied');
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
      } finally {
        busy.value = false;
      }
    }

    return {
      busy, fields, languageName, i18n, fillLanguage, fillDefaults, applyView, examples, minLabel, notifications, allowNotifications,
      formatDuration, CURRENCY_TOKEN, TOTALS_RANGE, HOUR_MS, ROUNDING_MODES, ROUNDING_STEPS, REMINDER_AFTER_HOURS, REMINDER_EVERY_MINUTES, MODE_KEYS,
    };
  },
  template: /* html */`
    <details class="card advanced">
      <summary>{{ $t('editor.advanced') }}</summary>
      <div class="advanced-body">
        <section class="advanced-group">
          <h3 id="rounding-title">{{ $t('editor.roundingTitle') }}</h3>
          <p class="hint">{{ $t('editor.roundingHint') }}</p>
          <div class="segmented wrap" role="radiogroup" aria-labelledby="rounding-title">
            <button v-for="m in ROUNDING_MODES" :key="m" type="button" role="radio" :aria-checked="rounding.mode === m"
                    :class="{ on: rounding.mode === m }" @click="rounding.mode = m">{{ $t('editor.' + MODE_KEYS[m]) }}</button>
          </div>
          <label v-if="rounding.mode !== 'none'" class="field">
            <span class="field-label">{{ $t('editor.roundingStep') }}</span>
            <select v-model="rounding.stepMinutes">
              <option :value="null">{{ $t('editor.stepSameAsMin', { unit: minLabel }) }}</option>
              <option v-for="s in ROUNDING_STEPS" :key="s" :value="s">{{ formatDuration(s * 60000) }}</option>
            </select>
          </label>
          <p v-if="examples" class="hint">{{ $t('editor.roundingExamples') }} {{ examples }}</p>
        </section>

        <section class="advanced-group">
          <h3>{{ $t('editor.reminderTitle') }}</h3>
          <div class="field-row">
            <label class="field">
              <span class="field-label">{{ $t('editor.reminderAfter') }}</span>
              <select v-model="reminder.afterHours">
                <option :value="null">{{ $t('editor.reminderOff') }}</option>
                <option v-for="h in REMINDER_AFTER_HOURS" :key="h" :value="h">{{ formatDuration(h * HOUR_MS) }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">{{ $t('editor.reminderEvery') }}</span>
              <select v-model="reminder.everyMinutes" :disabled="!reminder.afterHours">
                <option :value="0">{{ $t('editor.reminderOnce') }}</option>
                <option v-for="m in REMINDER_EVERY_MINUTES" :key="m" :value="m">{{ formatDuration(m * 60000) }}</option>
              </select>
            </label>
          </div>
          <p class="hint">{{ $t('editor.reminderHint') }}</p>
          <div v-if="notifications.supported && reminder.afterHours" class="row wrap">
            <span v-if="notifications.permission === 'granted'" class="ok-line small"><Icon name="check"/> {{ $t('editor.notifyOn') }}</span>
            <span v-else-if="notifications.permission === 'denied'" class="hint">{{ $t('editor.notifyBlocked') }}</span>
            <button v-else type="button" class="btn small" @click="allowNotifications">{{ $t('editor.notifyAllow') }}</button>
          </div>
        </section>

        <section class="advanced-group">
          <h3>{{ $t('editor.headersTitle') }}</h3>
          <p class="hint">{{ $t('editor.headersHint') }}</p>
          <div class="headers-grid">
            <label v-for="f in fields" :key="f.key" class="field">
              <span class="field-label"><span class="col-letter">{{ f.column }}</span> {{ $t('editor.' + f.role) }}</span>
              <input v-model="headers[f.key]" autocomplete="off" spellcheck="false" :aria-invalid="!!error">
            </label>
          </div>
          <p class="hint">{{ $t('editor.rateHint', { token: CURRENCY_TOKEN }) }}</p>
          <span v-if="error" class="field-error">{{ error }}</span>
          <div class="row wrap">
            <span class="small muted">{{ $t('editor.fillIn') }}</span>
            <button v-if="i18n.locale !== 'en'" type="button" class="btn small" @click="fillLanguage">{{ languageName }}</button>
            <button type="button" class="btn small" @click="fillDefaults">English</button>
            <button v-if="canAdopt" type="button" class="btn small" @click="$emit('adopt')">{{ $t('editor.fromTab') }}</button>
          </div>
        </section>

        <section class="advanced-group">
          <h3>{{ $t('editor.viewTitle') }}</h3>
          <p class="hint">{{ $t('editor.viewHint', { range: TOTALS_RANGE }) }}</p>
          <div class="row wrap">
            <button type="button" class="btn small" :disabled="!tab || !layoutOk || busy" @click="applyView">
              <Icon name="sheet"/> {{ busy ? $t('common.saving') : $t('editor.applyView') }}
            </button>
            <span v-if="tab && !layoutOk" class="hint">{{ $t('editor.viewNeedsLayout') }}</span>
          </div>
        </section>
      </div>
    </details>`,
};
