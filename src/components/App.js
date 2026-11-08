// App shell: clock switcher, banners, current view, bottom tab bar, toasts.
import { computed, watchEffect } from 'vue';
import Icon from './Icon.js';
import ClockView from './ClockView.js';
import ReportView from './ReportView.js';
import ClocksView from './ClocksView.js';
import ClockEditor from './ClockEditor.js';
import SetupView from './SetupView.js';
import SetupAssistant from './SetupAssistant.js';
import { InstallBanner, UpdateBanner, ReminderBanner, Toasts } from './Banners.js';
import { dismissReminder } from '../state/reminders.js';
import { route, go } from '../router.js';
import { store } from '../state/store.js';
import { MOCK } from '../mode.js';
import { i18n } from '../i18n/index.js';

const VIEWS = {
  clock: 'ClockView',
  report: 'ReportView',
  clocks: 'ClocksView',
  editor: 'ClockEditor',
  setup: 'SetupView',
  google: 'SetupAssistant',
  select: 'ClockView',
};
const TABS = [
  { name: 'clock', href: '#/', icon: 'clock' },
  { name: 'report', href: '#/report', icon: 'report' },
  { name: 'clocks', href: '#/clocks', icon: 'clocks' },
];

export default {
  name: 'App',
  components: { Icon, ClockView, ReportView, ClocksView, ClockEditor, SetupView, SetupAssistant, InstallBanner, UpdateBanner, ReminderBanner, Toasts },
  setup() {
    watchEffect(() => {
      // First run: nothing to show until a clock exists.
      if (!store.clocks.length && !['setup', 'google'].includes(route.name)) go('/setup');
      if (store.clocks.length && route.name === 'setup') go('/');
      if (route.name === 'select') { // #/c/<id>: make that clock active (from a reminder)
        const clock = store.clocks.find((c) => c.id === route.params.id);
        if (clock) {
          store.activeClockId = clock.id;
          dismissReminder(clock);
        }
        go('/');
      }
      if (store.clocks.length && !store.clocks.some((c) => c.id === store.activeClockId)) store.activeClockId = store.clocks[0].id;
    });

    const view = computed(() => VIEWS[route.name]);
    const showTabs = computed(() => store.clocks.length > 0 && TABS.some((t) => t.name === route.name));
    const showSwitcher = computed(() => store.clocks.length > 0 && ['clock', 'report'].includes(route.name));

    return { route, store, view, showTabs, showSwitcher, TABS, MOCK, i18n };
  },
  // The root is keyed by language: switching re-renders everything, including formatted dates/numbers.
  template: /* html */`
    <div class="app" :class="{ 'has-tabs': showTabs }" :key="i18n.locale">
      <header class="topbar">
        <label v-if="showSwitcher" class="switcher">
          <span class="sr-only">{{ $t('nav.activeClock') }}</span>
          <select v-model="store.activeClockId">
            <option v-for="c in store.clocks" :key="c.id" :value="c.id">{{ c.running ? '● ' : '' }}{{ c.name }}</option>
          </select>
        </label>
        <div v-else class="brand"><img src="assets/icons/icon.svg" alt="" width="26" height="26"><span>Clock In</span></div>
        <span v-if="MOCK" class="tag info" :title="$t('nav.demoHint')">{{ $t('nav.demo') }}</span>
      </header>

      <InstallBanner/>
      <UpdateBanner/>
      <ReminderBanner/>

      <main class="content">
        <component :is="view" :key="route.path" v-bind="route.params"/>
      </main>

      <nav v-if="showTabs" class="tabbar" :aria-label="$t('nav.main')">
        <a v-for="tab in TABS" :key="tab.name" :href="tab.href" :class="{ active: route.name === tab.name }"
           :aria-current="route.name === tab.name ? 'page' : null">
          <Icon :name="tab.icon"/><span>{{ $t('nav.' + tab.name) }}</span>
        </a>
      </nav>

      <Toasts/>
    </div>`,
};
