// Language picker. "Automatic" follows the browser; any other choice is downloaded on demand.
import { ref, computed } from 'vue';
import { i18n, t, setLanguage, browserLanguage } from '../i18n/index.js';
import { LANGUAGES } from '../i18n/languages.js';
import { toast } from '../state/toast.js';

export default {
  name: 'LanguageSelect',
  setup() {
    const busy = ref(false);
    const autoName = computed(() => LANGUAGES.find((l) => l.code === browserLanguage())?.name);

    async function change(e) {
      const select = e.target;
      busy.value = true;
      try {
        await setLanguage(select.value);
      } catch {
        select.value = i18n.choice;
        toast(t('language.failed'), { tone: 'warn' });
      } finally {
        busy.value = false;
      }
    }

    return { i18n, LANGUAGES, autoName, busy, change };
  },
  template: /* html */`
    <label class="field language-select">
      <span class="field-label">{{ $t('language.label') }}</span>
      <select :value="i18n.choice" :disabled="busy" @change="change">
        <option value="auto">{{ $t('language.auto', { name: autoName }) }}</option>
        <option v-for="l in LANGUAGES" :key="l.code" :value="l.code" :lang="l.code">{{ l.name }}</option>
      </select>
    </label>`,
};
