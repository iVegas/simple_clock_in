// App shell: clock switcher, banners, current view, bottom tab bar, toasts.
import { computed, watchEffect } from 'vue';
import Icon from './Icon.js';
import ClockView from './ClockView.js';
import ReportView from './ReportView.js';
import ClocksView from './ClocksView.js';
import ClockEditor from './ClockEditor.js';
import SetupView from './SetupView.js';
import SetupAssistant from './SetupAssistant.js';
import { InstallBanner, UpdateBanner, Toasts } from './Banners.js';
import { route, go } from '../router.js';
import { store } from '../state/store.js';
import { MOCK } from '../mode.js';

const VIEWS = {
  clock: 'ClockView',
  report: 'ReportView',
  clocks: 'ClocksView',
  editor: 'ClockEditor',
  setup: 'SetupView',
  google: 'SetupAssistant',
};
const TABS = [
  { name: 'clock', href: '#/', icon: 'clock', label: 'Clock' },
  { name: 'report', href: '#/report', icon: 'report', label: 'Report' },
  { name: 'clocks', href: '#/clocks', icon: 'clocks', label: 'Clocks' },
];

export default {
  name: 'App',
  components: { Icon, ClockView, ReportView, ClocksView, ClockEditor, SetupView, SetupAssistant, InstallBanner, UpdateBanner, Toasts },
  setup() {
    watchEffect(() => {
      // First run: nothing to show until a clock exists.
      if (!store.clocks.length && !['setup', 'google'].includes(route.name)) go('/setup');
      if (store.clocks.length && route.name === 'setup') go('/');
      if (store.clocks.length && !store.clocks.some((c) => c.id === store.activeClockId)) store.activeClockId = store.clocks[0].id;
    });

    const view = computed(() => VIEWS[route.name]);
    const showTabs = computed(() => store.clocks.length > 0 && TABS.some((t) => t.name === route.name));
    const showSwitcher = computed(() => store.clocks.length > 0 && ['clock', 'report'].includes(route.name));

    return { route, store, view, showTabs, showSwitcher, TABS, MOCK };
  },
  template: /* html */`
    <div class="app" :class="{ 'has-tabs': showTabs }">
      <header class="topbar">
        <label v-if="showSwitcher" class="switcher">
          <span class="sr-only">Active clock</span>
          <select v-model="store.activeClockId">
            <option v-for="c in store.clocks" :key="c.id" :value="c.id">{{ c.running ? '● ' : '' }}{{ c.name }}</option>
          </select>
        </label>
        <div v-else class="brand"><img src="assets/icons/icon.svg" alt="" width="26" height="26"><span>Clock In</span></div>
        <span v-if="MOCK" class="tag info" title="Demo mode: fake spreadsheet in this browser">Demo</span>
      </header>

      <InstallBanner/>
      <UpdateBanner/>

      <main class="content">
        <component :is="view" :key="route.path" v-bind="route.params"/>
      </main>

      <nav v-if="showTabs" class="tabbar" aria-label="Main">
        <a v-for="t in TABS" :key="t.name" :href="t.href" :class="{ active: route.name === t.name }"
           :aria-current="route.name === t.name ? 'page' : null">
          <Icon :name="t.icon"/><span>{{ t.label }}</span>
        </a>
      </nav>

      <Toasts/>
    </div>`,
};
