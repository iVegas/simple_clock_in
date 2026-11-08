// Create / edit a clock: settings first (they define the sheet layout), then the Google Sheet.
import { ref, reactive, computed, onMounted } from 'vue';
import Icon from './Icon.js';
import { store, clockById } from '../state/store.js';
import { toast } from '../state/toast.js';
import { go } from '../router.js';
import { MOCK } from '../mode.js';
import { backend } from '../services/backend.js';
import { isConfigured } from '../services/config.js';
import { quoteSheet } from '../services/sheets.js';
import { setupSheet, createTimesheet } from '../services/timesheet.js';
import { syncClock } from '../services/sync.js';
import { describeError } from '../services/errors.js';
import { uid, spreadsheetUrl } from '../services/util.js';
import { DATA_RANGE, validateStructure, describeIssue, expectedHeader } from '../domain/ledger.js';
import { UNIT_PRESETS, isValidUnit, round2 } from '../domain/time.js';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'UAH', 'PLN', 'CZK', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'JPY', 'INR', 'BRL', 'MXN'];

export default {
  name: 'ClockEditor',
  components: { Icon },
  props: { id: { type: String, default: 'new' }, wizard: Boolean },
  setup(props) {
    const isNew = props.id === 'new';
    const existing = isNew ? null : clockById(props.id);
    if (!isNew && !existing) go('/clocks');

    const auth = backend.auth.state;
    const draft = reactive({
      name: existing?.name ?? (store.clocks.length ? '' : 'My work'),
      currency: existing?.currency ?? 'USD',
      rate: existing?.rate ?? '',
      spreadsheetId: existing?.spreadsheetId ?? '',
      spreadsheetTitle: existing?.spreadsheetTitle ?? '',
      sheetId: existing?.sheetId ?? null,
      sheetTitle: existing?.sheetTitle ?? '',
    });
    const initialUnit = existing?.unitHours ?? 0.25;
    const unitChoice = ref(UNIT_PRESETS.includes(initialUnit) ? initialUnit : 'custom');
    const customUnit = ref(unitChoice.value === 'custom' ? initialUnit : '');
    const unitHours = computed(() => (unitChoice.value === 'custom' ? Number(customUnit.value) : unitChoice.value));
    const unitMinutes = computed(() => (isValidUnit(unitHours.value) ? round2(unitHours.value * 60) : null));

    const sheet = reactive({ tabs: [], values: null });
    const busy = ref('');
    const touched = ref(false);

    const configured = computed(() => MOCK || isConfigured());
    const structure = computed(() => (sheet.values ? validateStructure(sheet.values, draft.currency.trim()) : null));
    const header = computed(() => expectedHeader(draft.currency.trim() || '{currency}').join(' | '));
    const url = computed(() => (draft.spreadsheetId ? spreadsheetUrl(draft.spreadsheetId, draft.sheetId) : ''));
    const conflict = computed(() => (draft.spreadsheetId
      ? store.clocks.find((c) => c.id !== existing?.id && c.spreadsheetId === draft.spreadsheetId && c.sheetId === draft.sheetId)
      : null));

    const errors = computed(() => ({
      name: draft.name.trim() ? '' : 'Give the clock a name.',
      currency: draft.currency.trim() ? '' : 'Enter a currency, e.g. USD.',
      rate: typeof draft.rate === 'number' && draft.rate >= 0 ? '' : 'Enter the current cost of an hour.',
      unit: isValidUnit(unitHours.value) ? '' : 'Enter the minimum tracked time in hours, e.g. 1.5.',
    }));
    const invalid = computed(() => Object.values(errors.value).some(Boolean));

    async function run(name, fn) {
      busy.value = name;
      try {
        return await fn();
      } catch (err) {
        toast(describeError(err), { tone: err.code === 'auth-cancelled' ? 'info' : 'error' });
      } finally {
        busy.value = '';
      }
    }

    async function selectTab(sheetId, interactive = true) {
      const tab = sheet.tabs.find((t) => t.sheetId === sheetId);
      draft.sheetId = tab.sheetId;
      draft.sheetTitle = tab.title;
      sheet.values = null;
      sheet.values = await backend.sheets.getValues(draft.spreadsheetId, `${quoteSheet(tab.title)}!${DATA_RANGE}`, { interactive });
    }

    async function loadTabs(interactive = true) {
      const meta = await backend.sheets.getMeta(draft.spreadsheetId, { interactive });
      sheet.tabs = meta.tabs;
      draft.spreadsheetTitle = meta.title;
      const tab = meta.tabs.find((t) => t.sheetId === draft.sheetId)
        ?? meta.tabs.find((t) => t.title === draft.sheetTitle)
        ?? meta.tabs[0];
      await selectTab(tab.sheetId, interactive);
    }

    const signIn = () => run('signin', () => backend.auth.getToken({ interactive: true }));

    const choose = () => run('pick', async () => {
      const picked = await backend.picker.pickSpreadsheet();
      if (!picked) return;
      Object.assign(draft, { spreadsheetId: picked.id, spreadsheetTitle: picked.title, sheetId: null, sheetTitle: '' });
      sheet.tabs = [];
      sheet.values = null;
      await loadTabs(true);
    });

    const createNew = () => run('create', async () => {
      if (errors.value.currency) throw new Error('Enter the currency first: the new sheet’s header uses it.');
      const created = await createTimesheet(
        { title: `${draft.name.trim() || 'Clock In'} – timesheet`, currency: draft.currency.trim() },
        { interactive: true },
      );
      Object.assign(draft, created);
      await loadTabs(true);
      toast('New spreadsheet created in your Google Drive.', { tone: 'success' });
    });

    const changeTab = (e) => run('tabs', () => selectTab(Number(e.target.value)));
    const checkLayout = () => run('tabs', () => loadTabs(true));

    const save = () => run('save', async () => {
      touched.value = true;
      if (invalid.value) return;
      if (conflict.value) {
        toast(`“${conflict.value.name}” already uses this tab. Pick another tab or spreadsheet.`, { tone: 'warn' });
        return;
      }
      const currency = draft.currency.trim();
      if (draft.spreadsheetId && draft.sheetId !== null && structure.value?.state === 'empty') {
        await setupSheet(draft.spreadsheetId, draft.sheetId, currency, { interactive: true });
      }
      const data = {
        name: draft.name.trim(),
        currency,
        rate: draft.rate,
        unitHours: unitHours.value,
        spreadsheetId: draft.spreadsheetId || null,
        spreadsheetTitle: draft.spreadsheetTitle,
        sheetId: draft.sheetId,
        sheetTitle: draft.sheetTitle,
      };
      let clock = existing;
      if (clock) {
        const sheetChanged = clock.spreadsheetId !== data.spreadsheetId || clock.sheetId !== data.sheetId;
        Object.assign(clock, data);
        if (sheetChanged) {
          clock.structure = null;
          delete store.cache[clock.id];
        }
      } else {
        store.clocks.push({ id: uid(), createdAt: Date.now(), running: null, structure: null, ...data });
        clock = store.clocks.at(-1);
      }
      store.activeClockId = clock.id;
      if (clock.spreadsheetId) {
        await syncClock(clock.id, { interactive: true }).catch((err) => toast(describeError(err), { tone: 'warn' }));
      }
      toast(isNew ? `“${clock.name}” is ready.` : 'Clock saved.', { tone: 'success' });
      go('/');
    });

    onMounted(() => {
      if (draft.spreadsheetId && backend.auth.hasValidToken()) {
        busy.value = 'tabs';
        loadTabs(false).catch(() => {}).finally(() => { busy.value = ''; });
      }
    });

    return {
      isNew, draft, auth, sheet, busy, touched, configured, structure, header, url, conflict, errors,
      unitChoice, customUnit, unitHours, unitMinutes, UNIT_PRESETS, CURRENCIES,
      signIn, choose, createNew, changeTab, checkLayout, save, describeIssue,
    };
  },
  template: /* html */`
    <form class="editor" @submit.prevent="save" novalidate>
      <div v-if="!wizard" class="page-head">
        <a href="#/clocks" class="btn ghost icon-only" aria-label="Back to clocks"><Icon name="back"/></a>
        <h1>{{ isNew ? 'New clock' : 'Clock settings' }}</h1>
      </div>

      <fieldset class="card">
        <legend>{{ wizard ? '1. Your rate' : 'Clock' }}</legend>
        <label class="field">
          <span class="field-label">Name</span>
          <input v-model="draft.name" autocomplete="off" placeholder="e.g. Acme Corp" :aria-invalid="touched && !!errors.name">
          <span v-if="touched && errors.name" class="field-error">{{ errors.name }}</span>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field-label">Currency</span>
            <input v-model="draft.currency" list="currency-list" autocomplete="off" autocapitalize="characters" placeholder="USD"
                   :aria-invalid="touched && !!errors.currency">
            <datalist id="currency-list"><option v-for="c in CURRENCIES" :key="c" :value="c"/></datalist>
            <span v-if="touched && errors.currency" class="field-error">{{ errors.currency }}</span>
          </label>
          <label class="field">
            <span class="field-label">Cost per hour</span>
            <input v-model.number="draft.rate" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"
                   :aria-invalid="touched && !!errors.rate">
            <span v-if="touched && errors.rate" class="field-error">{{ errors.rate }}</span>
          </label>
        </div>
        <div class="field">
          <span class="field-label" id="unit-label">Minimum tracked time</span>
          <div class="segmented wrap" role="radiogroup" aria-labelledby="unit-label">
            <button v-for="u in UNIT_PRESETS" :key="u" type="button" role="radio" :aria-checked="unitChoice === u"
                    :class="{ on: unitChoice === u }" @click="unitChoice = u">{{ u }} h</button>
            <button type="button" role="radio" :aria-checked="unitChoice === 'custom'"
                    :class="{ on: unitChoice === 'custom' }" @click="unitChoice = 'custom'">Custom</button>
          </div>
          <div v-if="unitChoice === 'custom'" class="inline-input">
            <input v-model.number="customUnit" type="number" inputmode="decimal" min="0.01" step="0.05" placeholder="1.5"
                   aria-label="Custom minimum tracked time in hours" :aria-invalid="touched && !!errors.unit">
            <span>hours</span>
          </div>
          <span v-if="touched && errors.unit" class="field-error">{{ errors.unit }}</span>
          <span v-else-if="unitMinutes" class="hint">
            Clock out unlocks after {{ unitMinutes }} min. Every session is rounded up to the next multiple of {{ unitHours }} h.
          </span>
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>{{ wizard ? '2. Google Sheet' : 'Google Sheet' }}</legend>

        <div v-if="!configured" class="alert warn">
          <p class="small">Google access isn’t configured for this app yet.</p>
          <a class="btn small" href="#/google-setup">Open setup assistant</a>
        </div>

        <template v-else-if="!auth.email">
          <p class="small muted">Sign in so the app can write to your timesheet. It only gets access to the spreadsheet you choose or create here.</p>
          <button type="button" class="btn primary" :disabled="!!busy" @click="signIn"><Icon name="user"/> Sign in with Google</button>
        </template>

        <template v-else>
          <p class="small muted">Signed in as {{ auth.email }}</p>

          <div v-if="!draft.spreadsheetId" class="row wrap">
            <button type="button" class="btn primary" :disabled="!!busy" @click="choose"><Icon name="sheet"/> Choose spreadsheet</button>
            <button type="button" class="btn" :disabled="!!busy" @click="createNew"><Icon name="plus"/> Create new timesheet</button>
          </div>

          <template v-else>
            <div class="picked">
              <Icon name="sheet"/>
              <div class="picked-text">
                <strong>{{ draft.spreadsheetTitle || 'Spreadsheet' }}</strong>
                <a :href="url" target="_blank" rel="noopener" class="small">Open in Sheets <Icon name="external"/></a>
              </div>
              <button type="button" class="btn small ghost" :disabled="!!busy" @click="choose">Change</button>
            </div>

            <label v-if="sheet.tabs.length" class="field">
              <span class="field-label">Tab</span>
              <select :value="draft.sheetId" :disabled="!!busy" @change="changeTab">
                <option v-for="t in sheet.tabs" :key="t.sheetId" :value="t.sheetId">{{ t.title }}</option>
              </select>
            </label>
            <div v-else class="row">
              <span class="small muted" v-if="draft.sheetTitle">Tab: {{ draft.sheetTitle }}</span>
              <button type="button" class="btn small" :disabled="!!busy" @click="checkLayout"><Icon name="refresh"/> Check layout</button>
            </div>

            <p v-if="busy === 'tabs' || busy === 'pick' || busy === 'create'" class="small muted">Checking the sheet…</p>
            <div v-else-if="structure?.state === 'empty'" class="alert info">
              <p class="small">This tab is empty. On save it will be set up as:</p>
              <code class="small">{{ header }}</code>
            </div>
            <p v-else-if="structure?.state === 'ok'" class="ok-line small"><Icon name="check"/> Layout matches.</p>
            <div v-else-if="structure?.state === 'mismatch'" class="alert warn">
              <div class="alert-title"><Icon name="warning"/> This tab doesn’t match the expected layout</div>
              <ul class="issues">
                <li v-for="issue in structure.issues" :key="issue.column">
                  {{ describeIssue(issue) }}<template v-if="issue.kind === 'currency'"> — or set the currency to “{{ issue.sheetCurrency }}”.</template>
                </li>
              </ul>
              <p class="small">Expected header row: <code>{{ header }}</code></p>
              <p class="small">You can save anyway; syncing stays paused (sessions are kept) until the sheet or settings are fixed.</p>
            </div>
            <div v-if="conflict" class="alert warn">
              <p class="small">“{{ conflict.name }}” already uses this tab. Each clock needs its own tab.</p>
            </div>
          </template>
        </template>
      </fieldset>

      <div class="form-actions">
        <a v-if="!wizard" href="#/clocks" class="btn ghost">Cancel</a>
        <button type="submit" class="btn primary large" :disabled="!!busy">
          {{ busy === 'save' ? 'Saving…' : wizard ? 'Start tracking' : 'Save' }}
        </button>
      </div>
      <p v-if="wizard && !draft.spreadsheetId" class="small muted center">You can connect the spreadsheet later; sessions are kept on this device meanwhile.</p>
    </form>`,
};
