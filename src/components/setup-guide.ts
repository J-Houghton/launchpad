// src/components/setup-guide.ts
// A short first-run guide: name the page → pick a layout (just links, or a tile per column)
// → add a few cards → save. Everything it sets can be changed later in Settings. Or skip it
// all and start from one of the examples (lib/examples.ts).
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {
  COLUMN_PRESETS, EXAMPLE_ZONE, LOCAL_TIME_ZONE, STARTER, cardColor, cityOf, config, isHttpUrl, normalize, slug, validTimeZone,
  type CardConfig, type LaunchpadConfig,
} from '../config.js';
import { canWriteDirectly, writeConfigFile } from '../lib/config-file.js';
import { readCardsCsv } from '../lib/csv.js';
import { EXAMPLES, type Example } from '../lib/examples.js';
import { transition } from '../lib/transition.js';
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, Plus, Rocket, Save, Trash, X, icon } from '../lib/icons.js';
import { toast } from '../lib/util.js';

/**
 * One line of the table. With columns it's a card (a name and an address per column);
 * without, it's a single link filed under a category, which becomes its card.
 */
type Row = { category: string; name: string; url: string; tag?: string; urls: Record<string, string> };

const STEPS = ['Name', 'Layout', 'Cards', 'Save'];
const TIME_ZONES = Intl.supportedValuesOf?.('timeZone') ?? [];
const JUST_LINKS = -1;
const DEFAULT_CATEGORY = 'Links';
const blankRow = (): Row => ({ category: '', name: '', url: '', urls: {} });
const blankRows = () => [blankRow(), blankRow(), blankRow()];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  /** An index into COLUMN_PRESETS, or JUST_LINKS. */
  @state() private preset = JUST_LINKS;
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
  get #columns() { return this.preset === JUST_LINKS ? [] : COLUMN_PRESETS[this.preset].columns; }
  get #links() { return this.preset === JUST_LINKS; }
  /** The rows that will become something: named cards, or links with an address. */
  get #filled() { return this.rows.filter(r => (this.#links ? r.url.trim() : r.name.trim())); }

  /** Each row's category — a blank one carries on from the row above, like a spreadsheet. */
  #categories() {
    let current = DEFAULT_CATEGORY;
    return this.rows.map(r => (current = r.category.trim() || current));
  }

  async show() {
    const c = config.raw;
    this.step = 0;
    this.pageTitle = c.site.title === STARTER.site.title ? '' : c.site.title;
    this.timeZone = c.widgets.clock.zones[0]?.timeZone ?? LOCAL_TIME_ZONE;
    const ids = c.columns.map(e => e.id).join();
    this.preset = c.useColumns && c.columns.length
      ? Math.max(0, COLUMN_PRESETS.findIndex(p => p.columns.map(e => e.id).join() === ids))
      : JUST_LINKS;
    this.checks = c.statusChecks;
    this.rows = blankRows();
    this.pasting = false;
    this.pasted = '';
    await this.updateComplete;
    this.#dialog.showModal();
    this.querySelector<HTMLInputElement>('[data-field="setup:title"]')?.focus();
  }

  #close = () => {
    const entered = this.rows.some(r => r.name.trim() || r.url.trim() || r.category.trim() || Object.values(r.urls).some(u => u.trim()));
    if (entered && !confirm('Close the setup guide? What you\'ve entered will be lost.')) return;
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
      if (!validTimeZone(this.timeZone)) return this.#complain('setup:tz', `Pick a time zone from the list, e.g. ${EXAMPLE_ZONE}.`);
    }
    if (this.step === 2 && !this.pasting) {
      for (const [i, row] of this.rows.entries()) {
        if (this.#links) {
          const url = row.url.trim();
          if (!url && !row.name.trim()) continue;
          if (!isHttpUrl(url)) return this.#complain(`setup:${i}:url`, url ? 'Use a full address starting with https://' : 'Add an address for this link.');
          continue;
        }
        const urls = Object.entries(row.urls).filter(([, url]) => url.trim());
        if (!row.name.trim() && urls.length) return this.#complain(`setup:${i}:name`, 'Give this card a name.');
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
      const columns = this.#columns;
      const result = readCardsCsv(this.pasted, { ...config.raw, columns, groups: [], cards: [] });
      if (this.#links) {
        // every tile becomes a link under its card's name; a column just becomes its tag
        const label = (column: string) => result.newColumns.find(e => e.id === column)?.label;
        this.rows = result.cards.flatMap(card => card.tiles.map((t): Row => ({
          category: card.name, name: t.name ?? '', url: t.url, tag: t.column ? label(t.column) : t.label, urls: {},
        })));
      } else {
        const known = new Set(columns.map(e => e.id));
        this.rows = result.cards.map(card => ({
          ...blankRow(),
          name: card.name,
          urls: Object.fromEntries(card.tiles.flatMap(t => (t.column && known.has(t.column) ? [[t.column, t.url]] : []))),
        }));
        if (result.newColumns.length) toast(`Skipped columns that aren't in this layout: ${result.newColumns.map(e => e.label).join(', ')}`, 'error');
      }
      if (!this.rows.length) this.rows = blankRows();
      this.pasting = false;
    } catch (err) {
      toast(`Couldn't read that — ${(err as Error).message}`, 'error');
    }
  }

  // ---- finishing ----

  #build(): LaunchpadConfig {
    const next = structuredClone(config.raw);
    const columns = this.#columns;
    next.site.title = this.pageTitle.trim();
    // the heading follows the layout, unless it's been given a name of its own
    if (['Projects', 'Applications'].includes(next.site.heading)) next.site.heading = columns.length ? 'Applications' : 'Projects';
    // "just links" turns columns off but keeps any that were set up, with their tiles
    next.useColumns = columns.length > 0;
    if (columns.length) next.columns = structuredClone(columns);
    next.statusChecks = this.checks;
    next.widgets.clock.zones[0] = {
      label: this.timeZone === LOCAL_TIME_ZONE ? 'Local time' : cityOf(this.timeZone),
      timeZone: this.timeZone,
    };
    if (next.widgets.greeting.subtitle === STARTER.widgets.greeting.subtitle) next.widgets.greeting.subtitle = 'Where to today?';

    const ids = new Set(next.cards.map(c => c.id));
    const newCard = (name: string): CardConfig => {
      let id = slug(name, 'card'), n = 2;
      while (ids.has(id)) id = `${slug(name, 'card')}-${n++}`;
      ids.add(id);
      const card: CardConfig = { id, name, links: [], tiles: [] };
      next.cards.push(card);
      return card;
    };

    if (columns.length) {
      for (const row of this.#filled) {
        newCard(row.name.trim()).tiles = columns.flatMap(e => (row.urls[e.id]?.trim() ? [{ column: e.id, url: row.urls[e.id].trim() }] : []));
      }
    } else {
      // links with the same category share a card — an existing one, if the name matches
      const categories = this.#categories();
      this.rows.forEach((row, i) => {
        if (!row.url.trim()) return;
        const name = categories[i];
        const card = next.cards.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? newCard(name);
        card.tiles.push({ name: row.name.trim(), url: row.url.trim(), ...(row.tag ? { label: row.tag } : {}) });
      });
    }
    return normalize(next);
  }

  #finish = async (toFile: boolean) => {
    // a preset replaces the columns, and tiles in any it doesn't have go with them
    const keep = new Set(this.#columns.map(e => e.id));
    const lost = this.#links ? 0 : config.raw.cards.reduce((n, c) => n + c.tiles.filter(t => t.column && !keep.has(t.column)).length, 0);
    if (lost && !confirm(`${plural(lost, 'tile')} on your existing cards ${lost === 1 ? 'is' : 'are'} in columns this layout doesn't have, and will be removed. Continue?`)) return;
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
        <input class="input input-lg" placeholder="e.g. Home, Team Launchpad" .value=${this.pageTitle} data-field="setup:title"
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
      <div class="setup-examples">
        <span class="field-label">Or start from an example, and make it yours in Settings</span>
        <div class="example-cards">
          ${EXAMPLES.map(x => html`
            <button class="example-card" type="button" @click=${() => this.#useExample(x)}>
              ${icon(x.glyph)}
              <span><strong>${x.name}</strong><span class="field-hint">${x.description}</span></span>
            </button>`)}
        </div>
      </div>
    `;
  }

  #useExample(example: Example) {
    const what = `the ${example.name.toLowerCase()} example`;
    if (config.raw.cards.length && !confirm(`Replace what's on your page with ${what}?`)) return;
    this.#dialog.close();
    transition(() => config.save(example.config()));
    toast(`Loaded ${what}. Make it yours in Settings (Ctrl + ,), then Save to file`);
  }

  #layoutStep() {
    const tags = ['WEB', 'REPO', 'DOCS'];
    return html`
      <h3 class="setup-question">What goes on it?</h3>
      <p class="settings-hint">Projects, sites and bookmarks sorted into cards — or apps that each run in a few environments,
        lined up in columns. You can change this later.</p>
      <div class="preset-cards" role="radiogroup" aria-label="Layout">
        <label class="preset-card">
          <input type="radio" name="setup-preset" .checked=${this.#links} @change=${() => (this.preset = JUST_LINKS)}>
          <span class="preset-pills">
            ${tags.map((t, i) => html`<span class="env-pill sm" data-env style="--env:${cardColor(i)}">${t}</span>`)}
          </span>
          <span class="preset-name">Just links — projects, sites, bookmarks</span>
        </label>
        ${COLUMN_PRESETS.map((p, i) => html`
          <label class="preset-card">
            <input type="radio" name="setup-preset" .checked=${this.preset === i} @change=${() => (this.preset = i)}>
            <span class="preset-pills">
              ${p.columns.map(e => html`<span class="env-pill sm" data-env style="--env:${e.color}">${e.label}</span>`)}
            </span>
            <span class="preset-name">Apps in ${p.name}</span>
          </label>`)}
      </div>
      <label class="switch-label">
        <input class="switch" type="checkbox" .checked=${this.checks}
               @change=${(e: Event) => (this.checks = (e.target as HTMLInputElement).checked)}>
        Show whether each link is reachable
      </label>
      <p class="field-hint">Opened straight from a file, your browser may ask permission to reach your local network for this.
        You can change it later in Settings.</p>
    `;
  }

  #pasteStep() {
    const columns = this.#columns;
    return html`
      <h3 class="setup-question">Paste from a spreadsheet</h3>
      ${this.#links
        ? html`<p class="settings-hint">One row per link, with <code>category</code>, <code>name</code> and <code>url</code>
            columns (and <code>tag</code>, if you like).</p>`
        : html`<p class="settings-hint">A <code>name</code> column and one column per environment
            (${columns.map(e => html`<code>${e.label}</code> `)}).</p>`}
      <textarea class="input csv-input" rows="8" spellcheck="false" aria-label="Rows to paste"
                placeholder=${this.#links
                  ? 'category,name,url,tag\nSide projects,Recipe box,https://…,WEB\nReading,A good blog,https://…'
                  : `name,${columns.map(e => e.label).join(',')}\nBilling,https://…`}
                .value=${this.pasted} @input=${(e: Event) => (this.pasted = (e.target as HTMLTextAreaElement).value)}></textarea>
      <div class="section-actions">
        <button class="btn btn-soft btn-sm" type="button" @click=${() => this.#usePasted()}>${icon(Check)} Use these</button>
        <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.pasting = false)}>Type them in instead</button>
      </div>
    `;
  }

  #removeButton(row: Row) {
    return html`
      <button class="icon-btn xs danger" type="button" aria-label="Remove row" title="Remove" ?disabled=${this.rows.length === 1}
              @click=${() => { this.rows = this.rows.filter(r => r !== row); }}>${icon(Trash)}</button>`;
  }

  #linkTable() {
    const categories = this.#categories();
    const named = [...new Set(this.rows.map(r => r.category.trim()).filter(Boolean))];
    return html`
      <div class="setup-table links">
        <div class="setup-row setup-head">
          <span class="field-label">Category</span>
          <span class="field-label">Name</span>
          <span class="field-label">Address</span>
          <span></span>
        </div>
        ${this.rows.map((row, i) => html`
          <div class="setup-row">
            <input class="input" aria-label="Category" list="setup-categories" .value=${row.category}
                   placeholder=${i ? categories[i - 1] : 'e.g. Side projects'}
                   @input=${(e: Event) => { row.category = this.#input(e); this.requestUpdate(); }}>
            <input class="input" aria-label="Link name" placeholder="e.g. Recipe box" .value=${row.name}
                   @input=${(e: Event) => { row.name = this.#input(e); this.requestUpdate(); }}>
            <input class="input mono" type="url" aria-label="${row.name || 'Link'} address" placeholder="https://…"
                   .value=${row.url} data-field="setup:${i}:url"
                   @input=${(e: Event) => { row.url = this.#input(e); this.requestUpdate(); }}>
            ${this.#removeButton(row)}
          </div>`)}
      </div>
      <datalist id="setup-categories">${named.map(c => html`<option value=${c}></option>`)}</datalist>
    `;
  }

  #envTable() {
    const columns = this.#columns;
    return html`
      <div class="setup-table" style="--cols:${columns.length}">
        <div class="setup-row setup-head">
          <span class="field-label">Name</span>
          ${columns.map(e => html`<span class="env-pill sm" data-env style="--env:${e.color}">${e.label}</span>`)}
          <span></span>
        </div>
        ${this.rows.map((row, i) => html`
          <div class="setup-row">
            <input class="input" aria-label="App name" placeholder="e.g. Billing" .value=${row.name}
                   data-field="setup:${i}:name" @input=${(e: Event) => { row.name = this.#input(e); this.requestUpdate(); }}>
            ${columns.map(e => html`
              <input class="input mono" type="url" aria-label="${row.name || 'App'} ${e.label} address" placeholder="https://…"
                     .value=${row.urls[e.id] ?? ''} data-field="setup:${i}:${e.id}"
                     @input=${(ev: Event) => { row.urls[e.id] = this.#input(ev); this.requestUpdate(); }}>`)}
            ${this.#removeButton(row)}
          </div>`)}
      </div>
    `;
  }

  #cardsStep() {
    if (this.pasting) return this.#pasteStep();
    return html`
      ${this.#links ? html`
        <h3 class="setup-question">Add a few links</h3>
        <p class="settings-hint">Links with the same category share a card — leave it blank to use the one above.
          Tags, colors and groups can come later.</p>` : html`
        <h3 class="setup-question">Add a few apps</h3>
        <p class="settings-hint">Each one is a card: a name and whichever addresses you have — leave the rest blank.
          Links, groups and descriptions can come later.</p>`}
      <div class="setup-table-wrap">${this.#links ? this.#linkTable() : this.#envTable()}</div>
      <div class="section-actions">
        <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.rows = [...this.rows, blankRow()])}>
          ${icon(Plus)} Add another
        </button>
        <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.pasting = true)}>
          ${icon(ClipboardPaste)} Paste from a spreadsheet instead
        </button>
      </div>
    `;
  }

  #saveStep() {
    const n = this.#filled.length;
    const cards = this.#links
      ? new Set(this.#categories().filter((_, i) => this.rows[i].url.trim()).map(c => c.toLowerCase())).size
      : n;
    const what = !n ? 'Nothing added yet — add cards any time in Settings'
      : this.#links ? `${plural(n, 'link')} in ${plural(cards, 'card')}`
      : plural(n, 'app');
    return html`
      <h3 class="setup-question">All set?</h3>
      <ul class="setup-summary">
        <li>${icon(Check)} <span><strong>${this.pageTitle}</strong>, on ${cityOf(this.timeZone)} time</span></li>
        <li>${icon(Check)} <span>${this.#links ? 'Just links' : this.#columns.map(e => html`<span class="env-pill sm" data-env style="--env:${e.color}">${e.label}</span>`)},
          ${this.checks ? 'with status checks' : 'without status checks'}</span></li>
        <li>${icon(Check)} <span>${what}</span></li>
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
    const body = [() => this.#nameStep(), () => this.#layoutStep(), () => this.#cardsStep(), () => this.#saveStep()][this.step];
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
                  ${this.step === 2 && !this.#filled.length && !this.pasting ? 'Skip for now' : 'Next'} ${icon(ArrowRight)}
                </button>`}
            </div>
          </footer>
        </div>
      </dialog>
    `;
  }
}
