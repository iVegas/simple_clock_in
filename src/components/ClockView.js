// Main screen: Clock in / Clock out for the active clock.
import { ref, computed } from 'vue';
import Icon from './Icon.js';
import StructureWarning from './StructureWarning.js';
import SyncStatus from './SyncStatus.js';
import EntryForm from './EntryForm.js';
import { store, activeClock, pendingFor } from '../state/store.js';
import { now } from '../state/now.js';
import { toast } from '../state/toast.js';
import { t } from '../i18n/index.js';
import { clockOut as recordClockOut } from '../services/sync.js';
import { roundingText } from './phrases.js';
import {
  HOUR_MS, localDateKey, formatElapsed, formatCountdown, recordedHours, msUntilClockOut, round2,
} from '../domain/time.js';
import { formatHours, formatMoney, formatDay, formatTime } from '../domain/format.js';

export default {
  name: 'ClockView',
  components: { Icon, StructureWarning, SyncStatus, EntryForm },
  setup() {
    const clock = activeClock;
    const running = computed(() => clock.value?.running ?? null);
    const elapsed = computed(() => (running.value ? now.value - running.value.startedAt : 0));
    const remaining = computed(() => (running.value ? msUntilClockOut(running.value.startedAt, now.value, clock.value.unitHours) : 0));
    const willRecord = computed(() => (running.value ? recordedHours(elapsed.value, clock.value) : 0));
    const progress = computed(() => {
      if (!running.value) return 0;
      const unitMs = clock.value.unitHours * HOUR_MS;
      return elapsed.value < unitMs ? elapsed.value / unitMs : (elapsed.value % unitMs) / unitMs;
    });
    const startedLabel = computed(() => {
      if (!running.value) return '';
      const start = running.value.startedAt;
      const time = formatTime(start);
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
    const adding = ref(false);

    function clockIn() {
      if (!clock.value.running) clock.value.running = { startedAt: Date.now() };
    }

    const clockOut = () => recordClockOut(clock.value);

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
      toast(t('clock.discarded'));
    }

    const switchTo = (id) => { store.activeClockId = id; };

    return {
      clock, running, elapsed, remaining, willRecord, progress, startedLabel, today, others, confirmDiscard, adding,
      clockIn, clockOut, discard, switchTo, now,
      formatElapsed, formatCountdown, formatHours, formatMoney, roundingText,
    };
  },
  template: /* html */`
    <section class="clock-view" v-if="clock">
      <StructureWarning :clock="clock"/>
      <div v-if="!clock.spreadsheetId" class="alert info">
        <div class="alert-title"><Icon name="sheet"/> {{ $t('clock.noSheet') }}</div>
        <p class="small">{{ $t('clock.noSheetHint') }}</p>
        <a class="btn small" :href="'#/clock/' + clock.id">{{ $t('common.connectSheet') }}</a>
      </div>

      <div class="dial" :class="{ running: !!running, ready: running && remaining === 0 }">
        <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-track" cx="60" cy="60" r="54"/>
          <circle class="ring-progress" cx="60" cy="60" r="54" pathLength="100"
                  :style="{ strokeDashoffset: 100 - progress * 100 }"/>
        </svg>
        <button v-if="!running" class="dial-button" @click="clockIn">
          <Icon name="play"/>
          <span>{{ $t('clock.in') }}</span>
        </button>
        <div v-else class="dial-face" role="timer">
          <span class="elapsed">{{ formatElapsed(elapsed) }}</span>
          <span class="since">{{ $t('clock.since', { time: startedLabel }) }}</span>
          <span class="will-record">{{ $t('clock.records', { hours: formatHours(willRecord) }) }}</span>
        </div>
      </div>

      <div class="clock-actions" v-if="running">
        <button class="btn primary large" :disabled="remaining > 0" @click="clockOut">
          {{ remaining > 0 ? $t('clock.outIn', { time: formatCountdown(remaining) }) : $t('clock.out') }}
        </button>
        <button class="btn link" :class="{ danger: confirmDiscard }" @click="discard">
          {{ confirmDiscard ? $t('clock.discardConfirm') : $t('clock.discard') }}
        </button>
      </div>

      <div class="today">
        <span class="label">{{ $t('clock.today') }}</span>
        <strong>{{ formatHours(today.hours) }}</strong>
        <span class="muted">·</span>
        <span>{{ formatMoney(today.amount, clock.currency) }}</span>
      </div>
      <p class="muted small center">
        {{ $t('clock.rateLine', { rate: formatMoney(clock.rate, clock.currency), rule: roundingText(clock, { withMin: true }) }) }}
      </p>
      <p class="center"><button class="btn link" @click="adding = true">{{ $t('clock.addManually') }}</button></p>

      <SyncStatus :clock="clock"/>

      <div v-if="others.length" class="others">
        <span class="muted small">{{ $t('clock.alsoRunning') }}</span>
        <button v-for="o in others" :key="o.id" class="chip running" @click="switchTo(o.id)">
          {{ o.name }} · {{ formatElapsed(now - o.running.startedAt) }}
        </button>
      </div>

      <EntryForm v-if="adding" :clock="clock" @close="adding = false"/>
    </section>`,
};
