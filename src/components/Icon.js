// Inline stroke icons (24x24). <Icon name="clock"/>
const PATHS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  report: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-4"/>',
  clocks: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  warning: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};

export default {
  name: 'Icon',
  props: { name: { type: String, required: true } },
  setup: () => ({ PATHS }),
  template: /* html */`
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="PATHS[name]"></svg>`,
};
