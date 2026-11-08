// First run: welcome + language + install, then Google setup (if needed) and the first clock.
import { computed } from 'vue';
import Icon from './Icon.js';
import ClockEditor from './ClockEditor.js';
import SetupAssistant from './SetupAssistant.js';
import LanguageSelect from './LanguageSelect.js';
import { MOCK } from '../mode.js';
import { isConfigured } from '../services/config.js';
import { install, canInstall, promptInstall } from '../pwa/install.js';

export default {
  name: 'SetupView',
  components: { Icon, ClockEditor, SetupAssistant, LanguageSelect },
  setup() {
    const needsGoogleSetup = computed(() => !MOCK && !isConfigured());
    return { needsGoogleSetup, install, canInstall, promptInstall };
  },
  template: /* html */`
    <section class="setup">
      <div class="hero">
        <img src="assets/icons/icon.svg" alt="" width="64" height="64">
        <h1>Clock In</h1>
        <p class="muted">{{ $t('setup.tagline') }}</p>
        <!-- Only when the install banner was dismissed, to avoid two identical prompts. -->
        <button v-if="install.deferred && canInstall() && install.dismissedUntil > 0" class="btn" @click="promptInstall"><Icon name="download"/> {{ $t('setup.install') }}</button>
        <LanguageSelect/>
      </div>
      <SetupAssistant v-if="needsGoogleSetup" embedded/>
      <ClockEditor v-else id="new" wizard/>
    </section>`,
};
