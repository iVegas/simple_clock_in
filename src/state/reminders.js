// Reminders for clocks left running. Checked on the app's 1 s tick (browsers slow it to about once a
// minute in the background). The banner in the app shows every due reminder; a system notification
// is added when the app isn't on screen and notifications are allowed. There is no server, so a
// closed app can't remind: the banner shows the next time it opens.
import { reactive, watch } from 'vue';
import { store } from './store.js';
import { now } from './now.js';
import { t } from '../i18n/index.js';
import { reminderOf, reminderDue } from '../domain/time.js';
import { formatDuration } from '../domain/format.js';

export const notifications = reactive({
  supported: 'Notification' in window,
  permission: 'Notification' in window ? Notification.permission : 'denied',
});

/** Ask once, from a click (browsers require a user gesture). */
export async function allowNotifications() {
  if (!notifications.supported) return 'denied';
  notifications.permission = await Notification.requestPermission();
  return notifications.permission;
}

/** Clocks whose reminder fired and wasn't dismissed (for the banner). */
export const dueReminders = () => store.clocks.filter((c) => c.running?.remindedAt && !c.running.reminderSeen);

export function dismissReminder(clock) {
  if (clock.running) clock.running.reminderSeen = true;
}

async function notify(clock, ts) {
  if (document.visibilityState === 'visible') {
    navigator.vibrate?.(200); // the banner is on screen
    return;
  }
  if (!notifications.supported || Notification.permission !== 'granted') return;
  const title = t('reminder.title', { name: clock.name });
  const options = {
    body: t('reminder.body', { duration: formatDuration(ts - clock.running.startedAt) }),
    tag: `clock-${clock.id}`, // one notification per clock, replaced on repeat
    renotify: true,
    icon: 'assets/icons/icon-192.png',
    data: { url: `#/c/${encodeURIComponent(clock.id)}` }, // sw.js opens the app on that clock
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch (err) {
    console.warn('Could not show the reminder', err);
  }
}

export function startReminders() {
  watch(now, (ts) => {
    for (const clock of store.clocks) {
      if (!reminderDue(clock.running, reminderOf(clock), ts)) continue;
      Object.assign(clock.running, { remindedAt: ts, reminderSeen: false }); // saved: no repeat after a reload
      notify(clock, ts);
    }
  });
}

// Permission can change in the browser's site settings.
navigator.permissions?.query({ name: 'notifications' })
  .then((status) => { status.onchange = () => { notifications.permission = Notification.permission; }; })
  .catch(() => {});
