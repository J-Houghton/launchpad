// src/components/setup-guide.ts
// A short first-run guide: name the page → pick environments → add a few apps → save.
// Everything it sets can be changed later in Settings.
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {
  ENV_PRESETS, LOCAL_TIME_ZONE, STARTER, cityOf, config, isHttpUrl, normalize, validTimeZone, type LaunchpadConfig,
} from '../config.js';
import { canWriteDirectly, writeConfigFile } from '../lib/config-file.js';
import { readAppsCsv } from '../lib/csv.js';
import { transition } from '../lib/transition.js';
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, Plus, Rocket, Save, Trash, X, icon } from '../lib/icons.js';
import { toast } from '../lib/util.js';

type Row = { name: string; urls: Record<string, string> };

const STEPS = ['Name', 'Environments', 'Applications', 'Save'];
const TIME_ZONES = Intl.supportedValuesOf?.('timeZone') ?? [];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
const blankRows = (): Row[] => [{ name: '', urls: {} }, { name: '', urls: {} }];

let instance: SetupGuide | undefined;

export function openSetupGuide() {
  instance?.show();
}

@customElement('setup-guide')
export class SetupGuide extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private step = 0;
  @state() private pageTitle = '';
  @state() private timeZone = LOCAL_TIME_ZONE;
  @state() private preset = 0;
  @state() private checks = true;
  @state() private rows: Row[] = blankRows();
  @state() private pasting = false;
  @state() private pasted = '';
  @state() private busy = false;
  #downOnBackdrop = false;

  connectedCallback() {
    super.connectedCallback();
    instance = this;
  }

  disconnectedCallback() {
    if (instance === this) instance = undefined;
    super.disconnectedCallback();
  }

  get #dialog() { return this.querySelector<HTMLDialogElement>('dialog.setup')!; }
  get #envs() { return ENV_PRESETS[this.preset].environments; }
  get #named() { return this.rows.filter(r => r.name.trim()); }

  async show() {
    const c = config.raw;
    this.step = 0;
    this.pageTitle = c.site.title === STARTER.site.title ? '' : c.site.title;
    this.timeZone = c.widgets.clock.zones[0]?.timeZone ?? LOCAL_TIME_ZONE;
    const ids = c.environments.map(e => e.id).join();
    this.preset = Math.max(0, ENV_PRESETS.findIndex(p => p.environments.map(e => e.id).join() === ids));
    this.checks = c.statusChecks;
    this.rows = blankRows();
    this.pasting = false;
    this.pasted = '';
    await this.updateComplete;
    this.#dialog.showModal();
    this.querySelector<HTMLInputElement>('[data-field="setup:title"]')?.focus();
  }

  #close = () => {
    if (this.#named.length && !confirm('Close the setup guide? What you\'ve entered will be lost.')) return;
    this.#dialog.close();
  };

  #onCancel = (e: Event) => {
    e.preventDefault();
    this.#close();
  };

  #onPointerDown = (e: PointerEvent) => { this.#downOnBackdrop = e.target === this.#dialog; };
  #onClick = (e: MouseEvent) => {
    if (this.#downOnBackdrop && e.target === this.#dialog) this.#close();
    this.#downOnBackdrop = false;
  };

  // ---- validation: point at the first problem on this step ----

  #complain(field: string, message: string) {
    const input = this.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(field)}"]`);
    input?.setCustomValidity(message);
    input?.focus();
    input?.reportValidity();
    return false;
  }

  #stepIsValid() {
    if (this.step === 0) {
      if (!this.pageTitle.trim()) return this.#complain('setup:title', 'Give your page a name.');
      if (!validTimeZone(this.timeZone)) return this.#complain('setup:tz', 'Pick a time zone from the list, e.g. America/Chicago.');
    }
    if (this.step === 2 && !this.pasting) {
      for (const [i, row] of this.rows.entries()) {
        const urls = Object.entries(row.urls).filter(([, url]) => url.trim());
        if (!row.name.trim() && urls.length) return this.#complain(`setup:${i}:name`, 'Give this application a name.');
        for (const [env, url] of urls) {
          if (!isHttpUrl(url.trim())) return this.#complain(`setup:${i}:${env}`, 'Use a full address starting with https://');
        }
      }
    }
    return true;
  }

  #next = () => {
    if (!this.#stepIsValid()) return;
    if (this.step === 2 && this.pasting) this.#usePasted();
    this.step = Math.min(this.step + 1, STEPS.length - 1);
  };

  #back = () => { this.step = Math.max(this.step - 1, 0); };

  #input(e: Event) {
    const el = e.target as HTMLInputElement;
    el.setCustomValidity('');
    return el.value;
  }

  // ---- paste a CSV instead of typing ----

  #usePasted() {
    if (!this.pasted.trim()) { this.pasting = false; return; }
    try {
      const result = readAppsCsv(this.pasted, { ...config.raw, environments: this.#envs, groups: [], apps: [] });
      const known = new Set(this.#envs.map(e => e.id));
      this.rows = result.apps.map(a => ({
        name: a.name,
        urls: Object.fromEntries(a.envs.filter(e => known.has(e.env)).map(e => [e.env, e.url])),
      }));
      if (result.newEnvs.length) toast(`Skipped columns that aren't in this preset: ${result.newEnvs.map(e => e.label).join(', ')}`, 'error');
      this.pasting = false;
    } catch (err) {
      toast(`Couldn't read that — ${(err as Error).message}`, 'error');
    }
  }

  // ---- finishing ----

  #build(): LaunchpadConfig {
    const next = structuredClone(config.raw);
    next.site.title = this.pageTitle.trim();
    next.environments = structuredClone(this.#envs);
    next.statusChecks = this.checks;
    next.widgets.clock.zones[0] = {
      label: this.timeZone === LOCAL_TIME_ZONE ? 'Local time' : cityOf(this.timeZone),
      timeZone: this.timeZone,
    };
    if (next.widgets.greeting.subtitle === STARTER.widgets.greeting.subtitle) next.widgets.greeting.subtitle = 'Where to today?';

    const ids = new Set(next.apps.map(a => a.id));
    for (const row of this.#named) {
      let id = slug(row.name), n = 2;
      while (ids.has(id)) id = `${slug(row.name)}-${n++}`;
      ids.add(id);
      next.apps.push({
        id,
        name: row.name.trim(),
        links: [],
        envs: this.#envs.flatMap(e => (row.urls[e.id]?.trim() ? [{ env: e.id, url: row.urls[e.id].trim() }] : [])),
      });
    }
    return normalize(next);
  }

  #finish = async (toFile: boolean) => {
    const next = this.#build();
    this.busy = true;
    try {
      const result = toFile ? await writeConfigFile(next) : 'browser';
      if (result === 'cancelled') return;
      this.#dialog.close();
      if (result === 'written') {
        transition(() => config.fileWritten(next));
        toast('All set — saved to launchpad.config.js');
      } else {
        transition(() => config.save(next));
        toast(result === 'downloaded'
          ? 'All set — put the downloaded launchpad.config.js next to index.html'
          : 'All set — saved in this browser');
      }
    } catch (err) {
      toast(`Couldn't save the file: ${(err as Error).message}`, 'error');
    } finally {
      this.busy = false;
    }
  };

  // ---- steps ----

  #nameStep() {
    return html`
      <h3 class="setup-question">What should your page be called?</h3>
      <label class="field">
        <span class="field-label">Page title</span>
        <input class="input input-lg" placeholder="e.g. Team Launchpad" .value=${this.pageTitle} data-field="setup:title"
               @input=${(e: Event) => (this.pageTitle = this.#input(e))}
               @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.#next()}>
      </label>
      <label class="field">
        <span class="field-label">Your time zone</span>
        <input class="input mono" list="setup-tz" .value=${this.timeZone} data-field="setup:tz"
               @input=${(e: Event) => (this.timeZone = this.#input(e).trim())}>
        <span class="field-hint">For the clock and the greeting. You can add more clocks later.</span>
      </label>
      <datalist id="setup-tz">${TIME_ZONES.map(tz => html`<option value=${tz}></option>`)}</datalist>
    `;
  }

  #envStep() {
    return html`
      <h3 class="setup-question">Which environments do your apps run in?</h3>
      <p class="settings-hint">They become the columns on the page. You can rename, recolor or add more later.</p>
      <div class="preset-cards" role="radiogroup" aria-label="Environments">
        ${ENV_PRESETS.map((p, i) => html`
          <label class="preset-card">
            <input type="radio" name="setup-preset" .checked=${this.preset === i} @change=${() => (this.preset = i)}>
            <span class="preset-pills">
              ${p.environments.map(e => html`<span class="env-pill sm" data-env style="--env:${e.color}">${e.label}</span>`)}
            </span>
            <span class="preset-name">${p.name}</span>
          </label>`)}
      </div>
      <label class="switch-label">
        <input class="switch" type="checkbox" .checked=${this.checks}
               @change=${(e: Event) => (this.checks = (e.target as HTMLInputElement).checked)}>
        Show whether each environment is reachable
      </label>
      <p class="field-hint">Opened straight from a file, your browser may ask permission to reach your local network for this.
        You can change it later in Settings.</p>
    `;
  }

  #appsStep() {
    const envs = this.#envs;
    if (this.pasting) {
      return html`
        <h3 class="setup-question">Paste your applications</h3>
        <p class="settings-hint">From a spreadsheet or CSV, with a <code>name</code> column and one column per environment
          (${envs.map(e => html`<code>${e.label}</code> `)}).</p>
        <textarea class="input csv-input" rows="8" spellcheck="false" aria-label="Applications to paste"
                  placeholder=${`name,${envs.map(e => e.label).join(',')}\nBilling,https://…`}
                  .value=${this.pasted} @input=${(e: Event) => (this.pasted = (e.target as HTMLTextAreaElement).value)}></textarea>
        <div class="section-actions">
          <button class="btn btn-soft btn-sm" type="button" @click=${() => this.#usePasted()}>${icon(Check)} Use these</button>
          <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.pasting = false)}>Type them in instead</button>
        </div>
      `;
    }
    return html`
      <h3 class="setup-question">Add a few applications</h3>
      <p class="settings-hint">A name and whichever addresses you have — leave the rest blank. Links, groups and descriptions can come later.</p>
      <div class="setup-table-wrap">
        <div class="setup-table" style="--cols:${envs.length}">
          <div class="setup-row setup-head">
            <span class="field-label">Name</span>
            ${envs.map(e => html`<span class="env-pill sm" data-env style="--env:${e.color}">${e.label}</span>`)}
            <span></span>
          </div>
          ${this.rows.map((row, i) => html`
            <div class="setup-row">
              <input class="input" aria-label="Application name" placeholder="e.g. Billing" .value=${row.name}
                     data-field="setup:${i}:name" @input=${(e: Event) => { row.name = this.#input(e); this.requestUpdate(); }}>
              ${envs.map(e => html`
                <input class="input mono" type="url" aria-label="${row.name || 'Application'} ${e.label} address" placeholder="https://…"
                       .value=${row.urls[e.id] ?? ''} data-field="setup:${i}:${e.id}"
                       @input=${(ev: Event) => { row.urls[e.id] = this.#input(ev); this.requestUpdate(); }}>`)}
              <button class="icon-btn xs danger" type="button" aria-label="Remove row" title="Remove" ?disabled=${this.rows.length === 1}
                      @click=${() => { this.rows = this.rows.filter(r => r !== row); }}>${icon(Trash)}</button>
            </div>`)}
        </div>
      </div>
      <div class="section-actions">
        <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.rows = [...this.rows, { name: '', urls: {} }])}>
          ${icon(Plus)} Add another
        </button>
        <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.pasting = true)}>
          ${icon(ClipboardPaste)} Paste from a spreadsheet instead
        </button>
      </div>
    `;
  }

  #saveStep() {
    const n = this.#named.length;
    return html`
      <h3 class="setup-question">All set?</h3>
      <ul class="setup-summary">
        <li>${icon(Check)} <span><strong>${this.pageTitle}</strong>, on ${cityOf(this.timeZone)} time</span></li>
        <li>${icon(Check)} <span>${this.#envs.map(e => html`<span class="env-pill sm" data-env style="--env:${e.color}">${e.label}</span>`)}
          ${this.checks ? 'with status checks' : 'without status checks'}</span></li>
        <li>${icon(Check)} <span>${n ? `${n} application${n === 1 ? '' : 's'}` : 'No applications yet — add them any time in Settings'}</span></li>
      </ul>
      <p class="settings-hint">
        ${canWriteDirectly
          ? html`<strong>Save to file</strong> writes <code>launchpad.config.js</code> — pick the one next to <code>index.html</code>.`
          : html`<strong>Save to file</strong> downloads <code>launchpad.config.js</code> — put it next to <code>index.html</code>.`}
        That keeps your setup safe and easy to share. Or keep it in this browser for now and save a file later from Settings.
      </p>
    `;
  }

  render() {
    const last = this.step === STEPS.length - 1;
    const body = [() => this.#nameStep(), () => this.#envStep(), () => this.#appsStep(), () => this.#saveStep()][this.step];
    return html`
      <dialog class="settings setup" aria-labelledby="setup-title"
              @cancel=${this.#onCancel} @pointerdown=${this.#onPointerDown} @click=${this.#onClick}>
        <div class="settings-frame">
          <header class="settings-head">
            <div>
              <h2 id="setup-title">${icon(Rocket)} Set up your launchpad</h2>
              <p class="settings-sub">Step ${this.step + 1} of ${STEPS.length}</p>
            </div>
            <button class="icon-btn" type="button" aria-label="Close setup guide" @click=${this.#close}>${icon(X)}</button>
          </header>
          <ol class="setup-steps">
            ${STEPS.map((s, i) => html`
              <li class=${i < this.step ? 'done' : i === this.step ? 'current' : ''} aria-current=${i === this.step ? 'step' : 'false'}>
                <span class="setup-step-dot">${i < this.step ? icon(Check) : i + 1}</span>${s}
              </li>`)}
          </ol>
          <div class="settings-body setup-body">${body()}</div>
          <footer class="settings-foot">
            <div class="settings-foot-group">
              ${this.step ? html`<button class="btn btn-ghost" type="button" @click=${this.#back}>${icon(ArrowLeft)} Back</button>` : nothing}
            </div>
            <div class="settings-foot-group">
              ${last ? html`
                <button class="btn btn-soft" type="button" ?disabled=${this.busy} @click=${() => this.#finish(false)}>Keep in this browser</button>
                <button class="btn btn-primary ${this.busy ? 'spinning' : ''}" type="button" ?disabled=${this.busy} @click=${() => this.#finish(true)}>
                  ${icon(Save)} Save to file
                </button>` : html`
                <button class="btn btn-primary" type="button" @click=${this.#next}>
                  ${this.step === 2 && !this.#named.length && !this.pasting ? 'Skip for now' : 'Next'} ${icon(ArrowRight)}
                </button>`}
            </div>
          </footer>
        </div>
      </dialog>
    `;
  }
}
