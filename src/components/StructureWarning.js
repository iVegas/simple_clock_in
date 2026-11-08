// Persistent warning shown while a clock's sheet does not match the expected layout.
// Writes stay paused (sessions queue locally) until the sheet or the settings are fixed.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import { describeIssue, expectedHeader } from '../domain/ledger.js';
import { syncClock } from '../services/sync.js';
import { describeError } from '../services/errors.js';
import { spreadsheetUrl } from '../services/util.js';
import { toast } from '../state/toast.js';

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
          toast(res.synced ? `Layout fixed. Synced ${res.synced} session(s).` : 'Layout matches now.', { tone: 'success' });
        } else {
          toast('The layout still does not match.', { tone: 'warn' });
        }
      } catch (err) {
        toast(describeError(err), { tone: 'error' });
      } finally {
        busy.value = false;
      }
    }

    return { busy, visible, expected, url, recheck, describeIssue };
  },
  template: /* html */`
    <div v-if="visible" class="alert warn" role="alert">
      <div class="alert-title"><Icon name="warning"/> Sheet “{{ clock.sheetTitle }}” doesn’t match the expected layout</div>
      <ul class="issues">
        <li v-for="issue in clock.structure.issues" :key="issue.column">
          {{ describeIssue(issue) }}<template v-if="issue.kind === 'currency'"> — or change this clock’s currency to “{{ issue.sheetCurrency }}”.</template>
        </li>
      </ul>
      <p class="small">Expected header row: <code>{{ expected }}</code></p>
      <p class="small">Saving to the sheet is paused. Sessions are kept on this device and sync once it’s fixed.</p>
      <div class="row wrap">
        <a class="btn small" :href="url" target="_blank" rel="noopener"><Icon name="external"/> Open sheet</a>
        <button class="btn small" :disabled="busy" @click="recheck"><Icon name="refresh"/> Re-check</button>
        <a class="btn small ghost" :href="'#/clock/' + clock.id">Clock settings</a>
      </div>
    </div>`,
};
