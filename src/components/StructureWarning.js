// Persistent warning shown while a clock's sheet does not match the expected layout.
// Writes stay paused (entries queue locally) until the sheet or the settings are fixed.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import { t } from '../i18n/index.js';
import { expectedHeader } from '../domain/ledger.js';
import { syncClock } from '../services/sync.js';
import { describeError } from '../services/errors.js';
import { spreadsheetUrl } from '../services/util.js';
import { toast } from '../state/toast.js';

/** One structure issue from validateStructure(), in the UI language. */
export function issueText(issue) {
  const key = issue.optional ? 'issue.optional' : issue.found ? 'issue.found' : 'issue.empty';
  return t(key, issue);
}

export default {
  name: 'StructureWarning',
  components: { Icon },
  props: { clock: { type: Object, required: true } },
  setup(props) {
    const busy = ref(false);
    const visible = computed(() => props.clock.structure?.state === 'mismatch');
    const expected = computed(() => expectedHeader(props.clock.currency).join(' | '));
    const url = computed(() => spreadsheetUrl(props.clock.spreadsheetId, props.clock.sheetId));

    async function recheck() {
      busy.value = true;
      try {
        const res = await syncClock(props.clock.id, { interactive: true });
        if (props.clock.structure?.state === 'ok') {
          toast(res.synced ? t('layout.fixedSynced', { count: res.synced }) : t('layout.matches'), { tone: 'success' });
        } else {
          toast(t('layout.stillWrong'), { tone: 'warn' });
        }
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
      } finally {
        busy.value = false;
      }
    }

    return { busy, visible, expected, url, recheck, issueText };
  },
  template: /* html */`
    <div v-if="visible" class="alert warn" role="alert">
      <div class="alert-title"><Icon name="warning"/> {{ $t('layout.title', { name: clock.sheetTitle }) }}</div>
      <ul class="issues">
        <li v-for="issue in clock.structure.issues" :key="issue.column">
          {{ issueText(issue) }}<template v-if="issue.kind === 'currency'"> {{ $t('layout.orCurrency', { currency: issue.sheetCurrency }) }}</template>
        </li>
      </ul>
      <p class="small">{{ $t('layout.expected') }} <code>{{ expected }}</code></p>
      <p class="small">{{ $t('layout.paused') }}</p>
      <div class="row wrap">
        <a class="btn small" :href="url" target="_blank" rel="noopener"><Icon name="external"/> {{ $t('layout.openSheet') }}</a>
        <button class="btn small" :disabled="busy" @click="recheck"><Icon name="refresh"/> {{ $t('layout.recheck') }}</button>
        <a class="btn small ghost" :href="'#/clock/' + clock.id">{{ $t('layout.clockSettings') }}</a>
      </div>
    </div>`,
};
