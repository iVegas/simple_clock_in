// Advanced clock settings (collapsed): header names of the tab, and the sheet view
// (newest first, paid rows hidden, totals in H1:P1) for an existing tab.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import { i18n, t } from '../i18n/index.js';
import { LANGUAGES } from '../i18n/languages.js';
import { toast } from '../state/toast.js';
import { applySheetView } from '../services/timesheet.js';
import { describeError } from '../services/errors.js';
import { HEADER_KEYS, COLUMN_LETTERS, DEFAULT_HEADERS, CURRENCY_TOKEN, TOTALS_RANGE } from '../domain/ledger.js';

const ROLE_KEYS = { date: 'roleDate', hours: 'roleHours', rate: 'roleRate', sum: 'roleSum', paid: 'rolePaid', comment: 'roleComment' };

export default {
  name: 'ClockAdvanced',
  components: { Icon },
  props: {
    headers: { type: Object, required: true }, // reactive draft, edited in place
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

    return { busy, fields, languageName, i18n, fillLanguage, fillDefaults, applyView, CURRENCY_TOKEN, TOTALS_RANGE };
  },
  template: /* html */`
    <details class="card advanced">
      <summary>{{ $t('editor.advanced') }}</summary>
      <div class="advanced-body">
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
