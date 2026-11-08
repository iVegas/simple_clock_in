// A reactive clock ticking on whole seconds; timers derive elapsed time from timestamps,
// so they stay correct across sleep, reloads and app restarts.
import { ref } from 'vue';

export const now = ref(Date.now());

function tick() {
  now.value = Date.now();
  setTimeout(tick, 1000 - (now.value % 1000));
}
tick();

document.addEventListener('visibilitychange', () => { now.value = Date.now(); });
