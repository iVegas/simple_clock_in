// Create / edit a clock: settings first (they define the sheet layout), then the Google Sheet.
import { ref, reactive, computed, onMounted } from 'vue';
import Icon from './Icon.js';
import ClockAdvanced from './ClockAdvanced.js';
import { store, clockById } from '../state/store.js';
import { toast } from '../state/toast.js';
import { t } from '../i18n/index.js';
import { issueText } from './StructureWarning.js';
import { go } from '../router.js';
import { MOCK } from '../mode.js';
import { backend } from '../services/backend.js';
import { isConfigured } from '../services/config.js';
import { quoteSheet } from '../services/sheets.js';
import { setupSheet, createTimesheet, writeHeader } from '../services/timesheet.js';
import { syncClock } from '../services/sync.js';
import { describeError } from '../services/errors.js';
import { uid, spreadsheetUrl } from '../services/util.js';
import {
  DATA_RANGE, validateStructure, expectedHeader, headersOf, headersValid, isDefaultHeaders, headersFromSheet,
} from '../domain/ledger.js';
import { formatHours, formatDuration } from '../domain/format.js';
import { UNIT_PRESETS, HOUR_MS, isValidUnit, round2, roundingOf, reminderOf } from '../domain/time.js';
import { roundingText } from './phrases.js';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'UAH', 'PLN', 'CZK', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'JPY', 'INR', 'BRL', 'MXN'];

export default {
  name: 'ClockEditor',
  components: { Icon, ClockAdvanced },
  props: { id: { type: String, default: 'new' }, wizard: Boolean },
  setup(props) {
    const isNew = props.id === 'new';
    const existing = isNew ? null : clockById(props.id);
    if (!isNew && !existing) go('/clocks');

    const auth = backend.auth.state;
    const draft = reactive({
      name: existing?.name ?? (store.clocks.length ? '' : t('editor.defaultName')),
      currency: existing?.currency ?? 'USD',
      rate: existing?.rate ?? '',
      spreadsheetId: existing?.spreadsheetId ?? '',
      spreadsheetTitle: existing?.spreadsheetTitle ?? '',
      sheetId: existing?.sheetId ?? null,
      sheetTitle: existing?.sheetTitle ?? '',
    });
    const headers = reactive(headersOf(existing?.headers)); // advanced: header names
    const { mode, stepMinutes } = roundingOf(existing ?? {});
    const rounding = reactive({ mode, stepMinutes }); // advanced: rounding rule
    const reminder = reactive(reminderOf(existing)); // advanced: running-clock reminder
    const initialUnit = existing?.unitHours ?? 0.25;
    const unitChoice = ref(UNIT_PRESETS.includes(initialUnit) ? initialUnit : 'custom');
    const customUnit = ref(unitChoice.value === 'custom' ? initialUnit : '');
    const unitHours = computed(() => (unitChoice.value === 'custom' ? Number(customUnit.value) : unitChoice.value));
    const unitMinutes = computed(() => (isValidUnit(unitHours.value) ? round2(unitHours.value * 60) : null));
    const unitHint = computed(() => (unitMinutes.value ? t('editor.unitHint', {
      minutes: unitMinutes.value,
      unit: formatDuration(unitHours.value * HOUR_MS),
      rule: roundingText({ unitHours: unitHours.value, rounding }),
    }) : ''));

    const sheet = reactive({ tabs: [], values: null });
    const busy = ref('');
    const touched = ref(false);

    const configured = computed(() => MOCK || isConfigured());
    const structure = computed(() => (sheet.values ? validateStructure(sheet.values, draft.currency.trim(), headers) : null));
    const selectedTab = computed(() => sheet.tabs.find((tab) => tab.sheetId === draft.sheetId) ?? null);
    // Only the names differ from what the tab had (previous names, or the defaults): rename its header on save.
    const renameHeader = computed(() => {
      if (structure.value?.state !== 'mismatch') return false;
      const sameTab = existing && existing.spreadsheetId === draft.spreadsheetId && existing.sheetId === draft.sheetId;
      return validateStructure(sheet.values, draft.currency.trim(), sameTab ? existing.headers : null).state === 'ok';
    });
    const header = computed(() => expectedHeader(draft.currency.trim() || '{currency}', headers).join(' | '));
    const url = computed(() => (draft.spreadsheetId ? spreadsheetUrl(draft.spreadsheetId, draft.sheetId) : ''));
    const conflict = computed(() => (draft.spreadsheetId
      ? store.clocks.find((c) => c.id !== existing?.id && c.spreadsheetId === draft.spreadsheetId && c.sheetId === draft.sheetId)
      : null));

    const errors = computed(() => ({
      name: draft.name.trim() ? '' : t('editor.errName'),
      currency: draft.currency.trim() ? '' : t('editor.errCurrency'),
      rate: typeof draft.rate === 'number' && draft.rate >= 0 ? '' : t('editor.errRate'),
      unit: isValidUnit(unitHours.value) ? '' : t('editor.errUnit'),
      headers: headersValid(headers) ? '' : t('editor.errHeaders'),
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
      if (errors.value.currency) throw new Error(t('editor.currencyFirst'));
      const created = await createTimesheet(
        { title: t('editor.timesheetTitle', { name: draft.name.trim() || 'Clock In' }), currency: draft.currency.trim(), headers },
        { interactive: true },
      );
      Object.assign(draft, created);
      await loadTabs(true);
      toast(t('editor.created'), { tone: 'success' });
    });

    const adoptTabHeaders = () => Object.assign(headers, headersFromSheet(sheet.values?.[0], draft.currency.trim(), headers));
    const changeTab = (e) => run('tabs', () => selectTab(Number(e.target.value)));
    const checkLayout = () => run('tabs', () => loadTabs(true));

    const save = () => run('save', async () => {
      touched.value = true;
      if (invalid.value) return;
      if (conflict.value) {
        toast(t('editor.conflictToast', { name: conflict.value.name }), { tone: 'warn' });
        return;
      }
      const currency = draft.currency.trim();
      if (draft.spreadsheetId && draft.sheetId !== null && structure.value?.state === 'empty') {
        await setupSheet(draft.spreadsheetId, draft.sheetId, { currency, headers }, { interactive: true });
      } else if (draft.spreadsheetId && renameHeader.value) {
        await writeHeader(draft.spreadsheetId, draft.sheetId, { currency, headers }, { interactive: true });
        toast(t('editor.headerRenamed'), { tone: 'success' });
      }
      const data = {
        name: draft.name.trim(),
        currency,
        rate: draft.rate,
        unitHours: unitHours.value,
        headers: isDefaultHeaders(headers) ? null : headersOf(headers),
        rounding: roundingOf({ rounding }).isDefault ? null : { mode: rounding.mode, stepMinutes: rounding.stepMinutes },
        reminder: { afterHours: reminder.afterHours, everyMinutes: reminder.everyMinutes },
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
      toast(isNew ? t('editor.ready', { name: clock.name }) : t('editor.saved'), { tone: 'success' });
      go('/');
    });

    onMounted(() => {
      if (draft.spreadsheetId && backend.auth.hasValidToken()) {
        busy.value = 'tabs';
        loadTabs(false).catch(() => {}).finally(() => { busy.value = ''; });
      }
    });

    return {
      isNew, draft, headers, rounding, reminder, unitHint, auth, sheet, busy, touched, configured, structure, selectedTab, renameHeader, header, url, conflict, errors,
      unitChoice, customUnit, unitHours, unitMinutes, UNIT_PRESETS, CURRENCIES,
      signIn, choose, createNew, changeTab, checkLayout, adoptTabHeaders, save, issueText, formatHours,
    };
  },
  template: /* html */`
    <form class="editor" @submit.prevent="save" novalidate>
      <div v-if="!wizard" class="page-head">
        <a href="#/clocks" class="btn ghost icon-only" :aria-label="$t('editor.back')"><Icon name="back"/></a>
        <h1>{{ isNew ? $t('editor.new') : $t('editor.settings') }}</h1>
      </div>

      <fieldset class="card">
        <legend>{{ wizard ? $t('editor.stepRate') : $t('editor.clock') }}</legend>
        <label class="field">
          <span class="field-label">{{ $t('editor.name') }}</span>
          <input v-model="draft.name" autocomplete="off" :placeholder="$t('editor.namePlaceholder')" :aria-invalid="touched && !!errors.name">
          <span v-if="touched && errors.name" class="field-error">{{ errors.name }}</span>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field-label">{{ $t('editor.currency') }}</span>
            <input v-model="draft.currency" list="currency-list" autocomplete="off" autocapitalize="characters" placeholder="USD"
                   :aria-invalid="touched && !!errors.currency">
            <datalist id="currency-list"><option v-for="c in CURRENCIES" :key="c" :value="c"/></datalist>
            <span v-if="touched && errors.currency" class="field-error">{{ errors.currency }}</span>
          </label>
          <label class="field">
            <span class="field-label">{{ $t('editor.rate') }}</span>
            <input v-model.number="draft.rate" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"
                   :aria-invalid="touched && !!errors.rate">
            <span v-if="touched && errors.rate" class="field-error">{{ errors.rate }}</span>
          </label>
        </div>
        <div class="field">
          <span class="field-label" id="unit-label">{{ $t('editor.unit') }}</span>
          <div class="segmented wrap" role="radiogroup" aria-labelledby="unit-label">
            <button v-for="u in UNIT_PRESETS" :key="u" type="button" role="radio" :aria-checked="unitChoice === u"
                    :class="{ on: unitChoice === u }" @click="unitChoice = u">{{ formatHours(u) }}</button>
            <button type="button" role="radio" :aria-checked="unitChoice === 'custom'"
                    :class="{ on: unitChoice === 'custom' }" @click="unitChoice = 'custom'">{{ $t('editor.custom') }}</button>
          </div>
          <div v-if="unitChoice === 'custom'" class="inline-input">
            <input v-model.number="customUnit" type="number" inputmode="decimal" min="0.01" step="0.05" placeholder="1.5"
                   :aria-label="$t('editor.customAria')" :aria-invalid="touched && !!errors.unit">
            <span>{{ $t('editor.hours') }}</span>
          </div>
          <span v-if="touched && errors.unit" class="field-error">{{ errors.unit }}</span>
          <span v-else-if="unitHint" class="hint">{{ unitHint }}</span>
        </div>
      </fieldset>

      <fieldset class="card">
        <legend>{{ wizard ? $t('editor.stepSheet') : $t('editor.sheet') }}</legend>

        <div v-if="!configured" class="alert warn">
          <p class="small">{{ $t('account.notConfigured') }}</p>
          <a class="btn small" href="#/google-setup">{{ $t('account.openAssistant') }}</a>
        </div>

        <template v-else-if="!auth.email">
          <p class="small muted">{{ $t('editor.signInHint') }}</p>
          <button type="button" class="btn primary" :disabled="!!busy" @click="signIn"><Icon name="user"/> {{ $t('account.signIn') }}</button>
        </template>

        <template v-else>
          <p class="small muted">{{ $t('account.signedInAs', { email: auth.email }) }}</p>

          <div v-if="!draft.spreadsheetId" class="row wrap">
            <button type="button" class="btn primary" :disabled="!!busy" @click="choose"><Icon name="sheet"/> {{ $t('editor.choose') }}</button>
            <button type="button" class="btn" :disabled="!!busy" @click="createNew"><Icon name="plus"/> {{ $t('editor.create') }}</button>
          </div>

          <template v-else>
            <div class="picked">
              <Icon name="sheet"/>
              <div class="picked-text">
                <strong>{{ draft.spreadsheetTitle || $t('editor.spreadsheet') }}</strong>
                <a :href="url" target="_blank" rel="noopener" class="small">{{ $t('common.openInSheets') }} <Icon name="external"/></a>
              </div>
              <button type="button" class="btn small ghost" :disabled="!!busy" @click="choose">{{ $t('editor.change') }}</button>
            </div>

            <label v-if="sheet.tabs.length" class="field">
              <span class="field-label">{{ $t('editor.tab') }}</span>
              <select :value="draft.sheetId" :disabled="!!busy" @change="changeTab">
                <option v-for="tab in sheet.tabs" :key="tab.sheetId" :value="tab.sheetId">{{ tab.title }}</option>
              </select>
            </label>
            <div v-else class="row">
              <span class="small muted" v-if="draft.sheetTitle">{{ $t('editor.tabName', { name: draft.sheetTitle }) }}</span>
              <button type="button" class="btn small" :disabled="!!busy" @click="checkLayout"><Icon name="refresh"/> {{ $t('editor.checkLayout') }}</button>
            </div>

            <p v-if="busy === 'tabs' || busy === 'pick' || busy === 'create'" class="small muted">{{ $t('editor.checking') }}</p>
            <div v-else-if="structure?.state === 'empty'" class="alert info">
              <p class="small">{{ $t('editor.emptyTab') }}</p>
              <code class="small">{{ header }}</code>
            </div>
            <p v-else-if="structure?.state === 'ok'" class="ok-line small"><Icon name="check"/> {{ $t('editor.layoutOk') }}</p>
            <div v-else-if="renameHeader" class="alert info">
              <p class="small">{{ $t('editor.renameHeader') }}</p>
              <code class="small">{{ header }}</code>
            </div>
            <div v-else-if="structure?.state === 'mismatch'" class="alert warn">
              <div class="alert-title"><Icon name="warning"/> {{ $t('editor.mismatchTitle') }}</div>
              <ul class="issues">
                <li v-for="issue in structure.issues" :key="issue.column">
                  {{ issueText(issue) }}<template v-if="issue.kind === 'currency'"> {{ $t('editor.orCurrency', { currency: issue.sheetCurrency }) }}</template>
                </li>
              </ul>
              <p class="small">{{ $t('layout.expected') }} <code>{{ header }}</code></p>
              <p class="small">{{ $t('editor.saveAnyway') }}</p>
              <div v-if="structure.issues.some((i) => i.kind !== 'currency')" class="row wrap">
                <span class="small">{{ $t('editor.sameColumns') }}</span>
                <button type="button" class="btn small" @click="adoptTabHeaders">{{ $t('editor.useTabNames') }}</button>
              </div>
            </div>
            <div v-if="conflict" class="alert warn">
              <p class="small">{{ $t('editor.conflict', { name: conflict.name }) }}</p>
            </div>
          </template>
        </template>
      </fieldset>

      <ClockAdvanced :headers="headers" :rounding="rounding" :reminder="reminder" :unit-hours="unitHours"
                     :currency="draft.currency.trim()" :spreadsheet-id="draft.spreadsheetId"
                     :tab="selectedTab" :can-adopt="!!sheet.values?.[0]?.length" :layout-ok="structure?.state === 'ok'"
                     :error="errors.headers" @adopt="adoptTabHeaders" @applied="checkLayout"/>

      <div class="form-actions">
        <a v-if="!wizard" href="#/clocks" class="btn ghost">{{ $t('common.cancel') }}</a>
        <button type="submit" class="btn primary large" :disabled="!!busy">
          {{ busy === 'save' ? $t('common.saving') : wizard ? $t('editor.start') : $t('common.save') }}
        </button>
      </div>
      <p v-if="wizard && !draft.spreadsheetId" class="small muted center">{{ $t('editor.connectLater') }}</p>
    </form>`,
};
