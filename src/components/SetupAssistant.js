// One-time Google Cloud setup guide for whoever deploys the app.
// Values entered here are saved on this device; config.js makes them permanent for everyone.
import { reactive, computed } from 'vue';
import Icon from './Icon.js';
import { config, isConfigured, saveOverride, clearOverride, hasOverride } from '../services/config.js';
import { toast } from '../state/toast.js';
import { go } from '../router.js';
import { store } from '../state/store.js';

export default {
  name: 'SetupAssistant',
  components: { Icon },
  props: { embedded: Boolean },
  setup() {
    const origin = location.origin;
    const form = reactive({ ...config });
    const snippet = computed(() => `window.CLOCKIN_CONFIG = {
  googleClientId: '${form.googleClientId}',
  googleApiKey: '${form.googleApiKey}',
  googleAppId: '${form.googleAppId}',
};`);

    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied.');
      } catch {
        toast('Copy failed: select the text and copy it manually.', { tone: 'warn' });
      }
    }

    function save() {
      saveOverride(form);
      if (!isConfigured()) {
        toast('All three values are needed.', { tone: 'warn' });
        return;
      }
      toast('Saved on this device.', { tone: 'success' });
      go(store.clocks.length ? '/clocks' : '/setup');
    }

    function reset() {
      clearOverride();
      Object.assign(form, config);
      toast('Using the values from config.js.');
    }

    return { origin, form, snippet, copy, save, reset, hasOverride };
  },
  template: /* html */`
    <section class="assistant">
      <div class="page-head" v-if="!embedded">
        <a href="#/clocks" class="btn ghost icon-only" aria-label="Back"><Icon name="back"/></a>
        <h1>Google setup</h1>
      </div>
      <div class="card">
        <p v-if="embedded"><strong>One-time setup.</strong> The app talks to Google Sheets straight from your browser and needs its own Google Cloud OAuth client. It takes about 5 minutes and is free.</p>
        <p v-else class="small muted">Done once by whoever hosts the app. Users of a configured app never see this.</p>
        <p class="small muted">Prefer to look around first? <a href="?mock=1">Try the demo</a> with a fake spreadsheet.</p>
      </div>

      <ol class="steps">
        <li class="card">
          <strong>Create a Google Cloud project</strong>
          <a class="small" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com/projectcreate <Icon name="external"/></a>
        </li>
        <li class="card">
          <strong>Enable two APIs</strong>
          <a class="small" href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener">Google Sheets API <Icon name="external"/></a>
          <a class="small" href="https://console.cloud.google.com/apis/library/picker.googleapis.com" target="_blank" rel="noopener">Google Picker API <Icon name="external"/></a>
        </li>
        <li class="card">
          <strong>Configure the consent screen</strong>
          <a class="small" href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noopener">Google Auth Platform › Branding <Icon name="external"/></a>
          <span class="small muted">App name + support email. Audience: <em>External</em>. Under <em>Data access</em> add the scopes
            <code>…/auth/drive.file</code> and <code>…/auth/userinfo.email</code> (both non-sensitive, so no Google review is needed).
            Then <em>Audience › Publish app</em>. In <em>Testing</em> status Google shows a “hasn’t verified this app” warning.
            Skip the logo: a logo requires brand verification.</span>
        </li>
        <li class="card">
          <strong>Create an OAuth client</strong>
          <a class="small" href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noopener">Clients › Create client <Icon name="external"/></a>
          <span class="small muted">Type <em>Web application</em>. Add this to <em>Authorized JavaScript origins</em>:</span>
          <div class="copy-row"><code>{{ origin }}</code><button class="btn small" @click="copy(origin)">Copy</button></div>
          <span class="small muted">(Also add <code>http://localhost:8000</code> for local development.)</span>
        </li>
        <li class="card">
          <strong>Create an API key</strong> <span class="small muted">(used by the file picker)</span>
          <a class="small" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials › Create credentials › API key <Icon name="external"/></a>
          <span class="small muted">Restrict it: <em>Websites</em> →</span>
          <div class="copy-row"><code>{{ origin }}/*</code><button class="btn small" @click="copy(origin + '/*')">Copy</button></div>
          <span class="small muted">(the origin only, not the page path: browsers send just the origin to the picker),
            and <em>API restrictions</em> → Google Picker API.</span>
        </li>
        <li class="card">
          <strong>Find the project number</strong>
          <a class="small" href="https://console.cloud.google.com/iam-admin/settings" target="_blank" rel="noopener">IAM & Admin › Settings <Icon name="external"/></a>
        </li>
      </ol>

      <form class="card" @submit.prevent="save">
        <h2>Paste the values</h2>
        <label class="field"><span class="field-label">OAuth Client ID</span>
          <input v-model.trim="form.googleClientId" placeholder="1234-abc.apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span class="field-label">API key</span>
          <input v-model.trim="form.googleApiKey" placeholder="AIza…" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span class="field-label">Project number</span>
          <input v-model.trim="form.googleAppId" inputmode="numeric" placeholder="123456789012" autocomplete="off"></label>
        <div class="form-actions">
          <button v-if="hasOverride()" type="button" class="btn ghost" @click="reset">Use config.js</button>
          <button type="submit" class="btn primary">Save on this device</button>
        </div>
        <p class="small muted">
          To configure it for everyone, add them as GitHub <strong>repository variables</strong>
          (Settings › Secrets and variables › Actions › Variables) and re-run the deploy workflow:
        </p>
        <div class="copy-row"><code>GOOGLE_CLIENT_ID</code><button type="button" class="btn small" @click="copy(form.googleClientId)" :disabled="!form.googleClientId">Copy value</button></div>
        <div class="copy-row"><code>GOOGLE_API_KEY</code><button type="button" class="btn small" @click="copy(form.googleApiKey)" :disabled="!form.googleApiKey">Copy value</button></div>
        <div class="copy-row"><code>GOOGLE_APP_ID</code><button type="button" class="btn small" @click="copy(form.googleAppId)" :disabled="!form.googleAppId">Copy value</button></div>
        <details class="small muted">
          <summary>…or commit them in config.js</summary>
          <pre class="snippet">{{ snippet }}</pre>
          <button type="button" class="btn small" @click="copy(snippet)">Copy config.js</button>
        </details>
      </form>
    </section>`,
};
