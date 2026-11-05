// src/components/added-widgets.ts
// Widgets added to the page in Settings → Widgets (config.widgets.added), each a section of its own:
//   <embed-widget>     — another site in a frame, sandboxed, with a link to open it in a tab of its own;
//   <data-widget>      — JSON fetched every few minutes and shown through a template (lib/template.ts);
//   <extension-widget> — one an extension file adds (lib/extensions.ts), drawn by its own code.
import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { hostOf, sectionName, config, type DataWidget, type EmbedWidget, type ExtensionWidget } from '../config.js';
import { safeMode } from '../lib/custom-css.js';
import { registry, widgetOptions, widgetStore, type WidgetType } from '../lib/extensions.js';
import { StoreController } from '../lib/store-controller.js';
import { clean, renderTemplate } from '../lib/template.js';
import { AppWindow, ArrowUpRight, Braces, Puzzle, RefreshCw, icon } from '../lib/icons.js';
import { ago, toast } from '../lib/util.js';

/**
 * Fetches `url`: JSON if it parses, otherwise its text. Throws errors that read well after "Couldn't load it: ".
 * Opened from disk, the page can only read servers that allow it (CORS) — most public APIs do.
 */
export async function fetchData(url: string): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: abort.signal, referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`the server answered ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`);
    const text = await r.text();
    try { return JSON.parse(text); } catch { return text; }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('it took too long to answer');
    if (err instanceof TypeError) throw new Error('couldn\'t reach it — check the address, and that the server lets other sites read it (CORS)');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** What a data widget shows: its template filled in, or — with no template yet — the data itself. */
export function showData(template: string, data: unknown): DocumentFragment {
  if (template.trim()) return clean(renderTemplate(template, data));
  const pre = document.createElement('pre');
  pre.className = 'data-raw';
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  pre.textContent = text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
  const out = document.createDocumentFragment();
  out.append(pre);
  return out;
}

const heading = (glyph: Parameters<typeof icon>[0], w: { title: string; url: string }, extra: unknown = nothing) => html`
  <div class="widget-label">
    ${icon(glyph)}<span class="widget-title">${w.title || hostOf(w.url)}</span>
    ${extra}
    <a class="widget-open" href=${w.url} target="_blank" rel="noopener" title="Open ${hostOf(w.url)} in a new tab"
       aria-label="Open ${w.title || hostOf(w.url)} in a new tab">${icon(ArrowUpRight)}</a>
  </div>`;

@customElement('embed-widget')
export class EmbedWidgetElement extends LitElement {
  protected createRenderRoot() { return this; }

  @property({ attribute: false }) widget!: EmbedWidget;

  render() {
    const w = this.widget;
    // its own origin, so it can run as it would in a tab, but it can't reach this page or navigate it
    return html`
      ${heading(AppWindow, w)}
      <iframe class="embed-frame" src=${w.url} title=${w.title || hostOf(w.url)} style="height:${w.height}px"
              loading="lazy" referrerpolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>
    `;
  }
}

@customElement('data-widget')
export class DataWidgetElement extends LitElement {
  protected createRenderRoot() { return this; }

  @property({ attribute: false }) widget!: DataWidget;
  @state() private data?: unknown;
  @state() private error?: string;
  @state() private loading = false;
  @state() private loadedAt?: number;
  #url = '';
  #timer = 0;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.#onVisible);
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
    document.removeEventListener('visibilitychange', this.#onVisible);
    super.disconnectedCallback();
  }

  willUpdate(changed: Map<string, unknown>) {
    if (!changed.has('widget')) return;
    const { url } = this.widget;
    if (url !== this.#url) {
      this.#url = url;
      this.data = this.error = undefined;
      this.#load();
    }
    clearInterval(this.#timer);
    if (this.widget.refresh > 0) this.#timer = window.setInterval(this.#load, this.widget.refresh * 60_000);
  }

  // a tab left in the background catches up when it's looked at again
  #onVisible = () => {
    const due = this.widget.refresh > 0 && Date.now() - (this.loadedAt ?? 0) > this.widget.refresh * 60_000;
    if (document.visibilityState === 'visible' && due) this.#load();
  };

  #load = async () => {
    if (this.loading || (document.visibilityState === 'hidden' && this.data !== undefined)) return;
    this.loading = true;
    try {
      this.data = await fetchData(this.widget.url);
      this.error = undefined;
      this.loadedAt = Date.now();
    } catch (err) {
      this.error = (err as Error).message; // the last good data stays up
    } finally {
      this.loading = false;
    }
  };

  // the filled-in template goes straight into the body, cleaned (see lib/template.ts)
  updated() {
    const body = this.querySelector<HTMLElement>('.data-body');
    if (!body) return;
    if (this.data === undefined) return body.replaceChildren();
    try {
      body.replaceChildren(showData(this.widget.template, this.data));
    } catch (err) {
      body.replaceChildren(Object.assign(document.createElement('p'), { className: 'data-error', textContent: `Template: ${(err as Error).message}` }));
    }
  }

  render() {
    const refresh = html`
      <button class="icon-btn xs ${this.loading ? 'spinning' : ''}" type="button" @click=${this.#load}
              title=${this.loadedAt ? `Updated ${ago(this.loadedAt)} — refresh` : 'Refresh'} aria-label="Refresh">${icon(RefreshCw)}</button>`;
    return html`
      ${heading(Braces, this.widget, refresh)}
      ${this.data === undefined && !this.error ? html`<div class="skeleton skeleton-lg"></div><div class="skeleton skeleton-sm"></div>` : nothing}
      ${this.error ? html`<p class="data-error" role="status">Couldn't load it: ${this.error}</p>` : nothing}
      <div class="data-body"></div>
    `;
  }
}

/** Why an extension's widget isn't showing: the page is in safe mode, its file is still loading, or it isn't loaded at all. */
function missingWidget(w: ExtensionWidget) {
  if (safeMode) return 'Extensions are off in safe mode (?safe in the address).';
  if ([...registry.files.values()].some(f => f.state === 'loading')) return 'Loading…';
  return `This widget comes from an extension that isn't loaded ("${w.extension}"). Add its file under Settings → Edit page → Page → Extensions.`;
}

@customElement('extension-widget')
export class ExtensionWidgetElement extends LitElement {
  protected createRenderRoot() { return this; }

  @property({ attribute: false }) widget!: ExtensionWidget;
  /** What's drawn now — its type, and the settings it was drawn with — so it's only redrawn when one changes. */
  #def?: WidgetType;
  #drawn = '';
  #cleanup?: () => void;

  constructor() {
    super();
    new StoreController(this, registry);
  }

  disconnectedCallback() {
    this.#clear();
    super.disconnectedCallback();
  }

  #clear() {
    try { this.#cleanup?.(); } catch (err) { console.error(err); }
    this.#cleanup = undefined;
    this.#def = undefined;
    this.#drawn = '';
  }

  // the extension draws into the body itself; the page only hands it the element and its settings
  updated() {
    const def = registry.widgets.get(this.widget.extension);
    this.toggleAttribute('data-bare', !!def?.bare);
    const body = this.querySelector<HTMLElement>('.extension-body');
    if (!def || !body) return this.#clear();
    const options = widgetOptions(def, this.widget.options);
    const title = sectionName(config, this.widget.id);
    const drawn = JSON.stringify([options, title]);
    if (def === this.#def && drawn === this.#drawn) return;
    this.#clear();
    body.replaceChildren();
    this.#def = def;
    this.#drawn = drawn;
    try {
      const done = def.render(body, options, { id: this.widget.id, title, store: widgetStore(this.widget.id), toast: m => toast(String(m)) });
      if (typeof done === 'function') this.#cleanup = done;
    } catch (err) {
      console.error(`Launchpad: the "${def.name}" widget hit a problem —`, err);
      body.replaceChildren(Object.assign(document.createElement('p'), { className: 'data-error', textContent: `${def.name} hit a problem: ${(err as Error).message}` }));
    }
  }

  render() {
    const def = registry.widgets.get(this.widget.extension);
    const title = html`<div class="widget-label">${icon(Puzzle)}<span class="widget-title">${sectionName(config, this.widget.id)}</span></div>`;
    if (!def) return html`${title}<p class="widget-foot">${missingWidget(this.widget)}</p>`;
    return html`${def.bare ? nothing : title}<div class="extension-body"></div>`;
  }
}
