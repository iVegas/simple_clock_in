// Main screen: Clock in / Clock out for the active clock.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import StructureWarning from './StructureWarning.js';
import SyncStatus from './SyncStatus.js';
import { store, activeClock, pendingFor } from '../state/store.js';
import { now } from '../state/now.js';
import { toast } from '../state/toast.js';
import { syncClock } from '../services/sync.js';
import { describeError } from '../services/errors.js';
import { uid } from '../services/util.js';
import {
  HOUR_MS, localDateKey, formatElapsed, formatCountdown, roundUpToUnit, msUntilClockOut, canClockOut, round2,
} from '../domain/time.js';
import { formatHours, formatMoney, formatDay } from '../domain/format.js';

export default {
  name: 'ClockView',
  components: { Icon, StructureWarning, SyncStatus },
  setup() {
    const clock = activeClock;
    const running = computed(() => clock.value?.running ?? null);
    const elapsed = computed(() => (running.value ? now.value - running.value.startedAt : 0));
    const remaining = computed(() => (running.value ? msUntilClockOut(running.value.startedAt, now.value, clock.value.unitHours) : 0));
    const willRecord = computed(() => (running.value ? roundUpToUnit(elapsed.value, clock.value.unitHours) : 0));
    const progress = computed(() => {
      if (!running.value) return 0;
      const unitMs = clock.value.unitHours * HOUR_MS;
      return elapsed.value < unitMs ? elapsed.value / unitMs : (elapsed.value % unitMs) / unitMs;
    });
    const startedLabel = computed(() => {
      if (!running.value) return '';
      const start = running.value.startedAt;
      const time = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return localDateKey(start) === localDateKey(now.value) ? time : `${formatDay(localDateKey(start))} ${time}`;
    });

    const today = computed(() => {
      const c = clock.value;
      const key = localDateKey(now.value);
      const fromSheet = (store.cache[c.id]?.records ?? []).filter((r) => r.date === key);
      const queued = pendingFor(c.id).filter((p) => p.date === key);
      return {
        hours: round2(fromSheet.reduce((a, r) => a + r.hours, 0) + queued.reduce((a, p) => a + p.hours, 0)),
        amount: round2(fromSheet.reduce((a, r) => a + r.sum, 0) + queued.reduce((a, p) => a + p.hours * p.rate, 0)),
      };
    });

    const others = computed(() => store.clocks.filter((c) => c.running && c.id !== clock.value?.id));

    function clockIn() {
      if (!clock.value.running) clock.value.running = { startedAt: Date.now() };
    }

    async function clockOut() {
      const c = clock.value;
      if (!c?.running) return; // double tap
      const startedAt = c.running.startedAt;
      const endedAt = Date.now();
      if (!canClockOut(startedAt, endedAt, c.unitHours)) return;
      const hours = roundUpToUnit(endedAt - startedAt, c.unitHours);
      const date = localDateKey(startedAt);
      store.pending.push({ id: uid(), clockId: c.id, date, hours, rate: c.rate, startedAt, endedAt, attempts: 0 });
      c.running = null;

      if (!c.spreadsheetId) {
        toast(`Saved ${formatHours(hours)} on this device. Connect a spreadsheet to sync it.`, { tone: 'warn' });
        return;
      }
      try {
        const res = await syncClock(c.id, { interactive: true });
        if (res.status === 'blocked') toast(`Saved ${formatHours(hours)} on this device. Fix the sheet layout to sync.`, { tone: 'warn' });
        else toast(`Recorded ${formatHours(hours)} · ${formatDay(date)}`, { tone: 'success' });
      } catch (err) {
        toast(`Saved ${formatHours(hours)} on this device. ${describeError(err)}`, { tone: 'warn', timeout: 7000 });
      }
    }

    const confirmDiscard = ref(false);
    let discardTimer;
    function discard() {
      if (!confirmDiscard.value) {
        confirmDiscard.value = true;
        discardTimer = setTimeout(() => { confirmDiscard.value = false; }, 4000);
        return;
      }
      clearTimeout(discardTimer);
      confirmDiscard.value = false;
      clock.value.running = null;
      toast('Session discarded.');
    }

    const switchTo = (id) => { store.activeClockId = id; };

    return {
      clock, running, elapsed, remaining, willRecord, progress, startedLabel, today, others, confirmDiscard,
      clockIn, clockOut, discard, switchTo, now,
      formatElapsed, formatCountdown, formatHours, formatMoney,
    };
  },
  template: /* html */`
    <section class="clock-view" v-if="clock">
      <StructureWarning :clock="clock"/>
      <div v-if="!clock.spreadsheetId" class="alert info">
        <div class="alert-title"><Icon name="sheet"/> No spreadsheet connected</div>
        <p class="small">Sessions are kept on this device until you connect one.</p>
        <a class="btn small" :href="'#/clock/' + clock.id">Connect spreadsheet</a>
      </div>

      <div class="dial" :class="{ running: !!running, ready: running && remaining === 0 }">
        <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-track" cx="60" cy="60" r="54"/>
          <circle class="ring-progress" cx="60" cy="60" r="54" pathLength="100"
                  :style="{ strokeDashoffset: 100 - progress * 100 }"/>
        </svg>
        <button v-if="!running" class="dial-button" @click="clockIn">
          <Icon name="play"/>
          <span>Clock in</span>
        </button>
        <div v-else class="dial-face" role="timer">
          <span class="elapsed">{{ formatElapsed(elapsed) }}</span>
          <span class="since">since {{ startedLabel }}</span>
          <span class="will-record">records {{ formatHours(willRecord) }}</span>
        </div>
      </div>

      <div class="clock-actions" v-if="running">
        <button class="btn primary large" :disabled="remaining > 0" @click="clockOut">
          {{ remaining > 0 ? 'Clock out in ' + formatCountdown(remaining) : 'Clock out' }}
        </button>
        <button class="btn link" :class="{ danger: confirmDiscard }" @click="discard">
          {{ confirmDiscard ? 'Tap again to discard this session' : 'Discard session' }}
        </button>
      </div>

      <div class="today">
        <span class="label">Today</span>
        <strong>{{ formatHours(today.hours) }}</strong>
        <span class="muted">·</span>
        <span>{{ formatMoney(today.amount, clock.currency) }}</span>
      </div>
      <p class="muted small center">
        {{ formatMoney(clock.rate, clock.currency) }}/hour · rounded up to {{ formatHours(clock.unitHours) }}
      </p>

      <SyncStatus :clock="clock"/>

      <div v-if="others.length" class="others">
        <span class="muted small">Also running:</span>
        <button v-for="o in others" :key="o.id" class="chip running" @click="switchTo(o.id)">
          {{ o.name }} · {{ formatElapsed(now - o.running.startedAt) }}
        </button>
      </div>
    </section>`,
};
