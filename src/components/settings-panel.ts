// src/components/settings-panel.ts
// Settings, in two modes:
//   My view   — just for you: your look and colours, which cards show, pins + history. Applies instantly, saved in this browser.
//               "Make it everyone's" copies your look into the page.
//   Edit page — the page itself, in four tabs: Cards (and their columns), Layout, Widgets, and Page (title, header
//               links, status checks, custom CSS). A draft until saved; "Save to file" writes launchpad.config.js
//               (see lib/config-file.ts), "Save" keeps it in this browser. The File menu opens, downloads and loads examples.
// Open it with the faint gear in the footer, or Ctrl+, (⌘+, on a Mac).
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import {
  COLOR_SLOTS, COLUMN_PRESETS, EXAMPLE_ZONE, LINK_ICONS, NEW_COLUMN_COLORS, STYLES, cardColor, cardHue, cityOf, config, hostOf, isHttpUrl, validTimeZone,
  MAX_CSS, MAX_TEMPLATE, SECTION_IDS, isExtensionPath, sectionName, type AddedWidget, type Background, type CardConfig,
  type DataWidget, type ExtensionWidget, type ColumnDef, type Density, type LaunchpadConfig, type LinkIcon,
  type LinkItem, type SectionId, type Style, type ThemeMode, type TileConfig,
} from '../config.js';
import { arrange } from '../lib/arrange.js';
import { COLOR_INFO, contrast, shownColors } from '../lib/colors.js';
import { COMBOS, sameHues } from '../lib/combos.js';
import './color-picker.js';
import { EXAMPLES, type Example } from '../lib/examples.js';
import { SPANS, moveCard, place, setNewRow, setSpan } from '../lib/layout.js';
import { look, type Motion } from '../lib/look.js';
import { previewCss, safeMode } from '../lib/custom-css.js';
import { registry, widgetOptions, type Field } from '../lib/extensions.js';
import { parseTemplate } from '../lib/template.js';
import { fetchData, showData } from './added-widgets.js';
import { dragToReorder, keyboardReorder, type SortMove } from '../lib/sortable.js';
import { applyCardsImport, cardsToCsv, csvTemplate, readCardsCsv, type CardsImport } from '../lib/csv.js';
import { openSetupGuide } from './setup-guide.js';
import { prefs } from '../lib/prefs.js';
import { StoreController } from '../lib/store-controller.js';
import { transition } from '../lib/transition.js';
import {
  canWriteDirectly, download, forgetLinkedFile, linkedFileName, parseConfigText, toFileText, writeConfigFile,
} from '../lib/config-file.js';
import {
  Activity, AppWindow, ArrowUpRight, Blend, Braces, Check, Coins, GitBranch, Newspaper, Puzzle, ChevronDown, ClipboardPaste, Code, Download, FileSpreadsheet, FolderOpen, FolderPlus, GripVertical,
  Columns3, Layers, LayoutGrid, MapPin, Monitor, Moon, Palette as PaletteIcon, PanelTop, Pencil, Plus, RotateCcw,
  Play, RefreshCw, Save, Search, SlidersHorizontal, Sparkles, Square, Sun, Trash, TriangleAlert, Unlink, Upload, User, Users, X, icon,
  type IconNode,
} from '../lib/icons.js';
import { ago, initials, toast } from '../lib/util.js';

type EditTab = 'cards' | 'layout' | 'widgets' | 'page';
export type SettingsTab = 'view' | EditTab;
type Problem = { tab: EditTab; field: string; message: string };
type Place = { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string };
type Option<T> = { id: T; label: string; glyph?: IconNode; hint?: string };
type MenuItem = { label: string; glyph: IconNode; run: () => void; hint?: string };

const EDIT_TABS: { id: EditTab; label: string; glyph: IconNode }[] = [
  { id: 'cards', label: 'Cards', glyph: Layers },
  { id: 'layout', label: 'Layout', glyph: LayoutGrid },
  { id: 'widgets', label: 'Widgets', glyph: SlidersHorizontal },
  { id: 'page', label: 'Page', glyph: PanelTop },
];

const ICON_LABELS: Record<LinkIcon, string> = {
  auto: 'Auto icon', book: 'Docs', link: 'Link', git: 'Repo', chart: 'Dashboard',
  ticket: 'Tickets', terminal: 'Console', database: 'Database', shield: 'Security', chat: 'Chat',
};

const STYLE_INFO: Record<Style, { name: string; description: string }> = {
  aurora: { name: 'Aurora', description: 'A soft purple and pink glow, frosted glass, and a serif headline' },
  classic: { name: 'Classic', description: 'Crisp white panels, purple and gold, with a striped border' },
  blueprint: { name: 'Blueprint', description: 'Grid paper, square corners and monospaced type' },
  paper: { name: 'Paper', description: 'Cream stock, inked outlines and serif headings, like a printed page' },
  neon: { name: 'Neon', description: 'A glowing grid at night, with pink and cyan outlines' },
  bold: { name: 'Bold', description: 'Chunky borders, hard shadows and bright tiles' },
};

/** The tiles in a style's preview, in the first three card colours. */
const PREVIEW_TILES = [0, 1, 2].map(cardColor);

const THEMES: Option<ThemeMode>[] = [
  { id: 'system', label: 'System', glyph: Monitor, hint: 'Follow the device\'s setting' },
  { id: 'light', label: 'Light', glyph: Sun },
  { id: 'dark', label: 'Dark', glyph: Moon },
];

const BACKGROUNDS: Option<Background>[] = [
  { id: 'particles', label: 'Particles', glyph: Sparkles, hint: 'The style\'s backdrop, with particles that drift and follow the pointer' },
  { id: 'still', label: 'Still', glyph: Blend, hint: 'The style\'s backdrop, without the particles' },
  { id: 'plain', label: 'Plain', glyph: Square, hint: 'A plain colour' },
];

const MOTIONS: Option<Motion>[] = [
  { id: 'system', label: 'System', glyph: Monitor, hint: 'Follow the device\'s "reduce motion" setting' },
  { id: 'full', label: 'Full' },
  { id: 'reduced', label: 'Reduced', hint: 'No moving background, typing or sliding' },
];

const DENSITIES: Option<Density>[] = [
  { id: 'comfortable', label: 'Comfortable', hint: 'Roomy tiles' },
  { id: 'compact', label: 'Compact', hint: 'Shorter tiles, tighter spacing' },
];

/**
 * Ready-made data widgets, from public APIs that let any page read them. Each fills in the address and a
 * template to start from — handy as examples of templates, too.
 */
const DATA_PRESETS: { name: string; hint: string; glyph: IconNode; widget: Omit<DataWidget, 'id' | 'type'> }[] = [
  {
    name: 'A GitHub repository', glyph: GitBranch, hint: 'Stars, forks, issues and the last push. Change owner/repo in the address.',
    widget: {
      title: 'lit/lit on GitHub', url: 'https://api.github.com/repos/lit/lit', refresh: 60,
      template: [
        '<p><a href="{{html_url}}">{{full_name}}</a></p>',
        '<p class="muted">{{description}}</p>',
        '<ul class="data-list">',
        '  <li><span>Stars</span> <b>{{stargazers_count | number}}</b></li>',
        '  <li><span>Forks</span> <b>{{forks_count | number}}</b></li>',
        '  <li><span>Open issues</span> <b>{{open_issues_count | number}}</b></li>',
        '  <li><span>Last push</span> <b>{{pushed_at | ago}}</b></li>',
        '</ul>',
      ].join('\n'),
    },
  },
  {
    name: 'Hacker News front page', glyph: Newspaper, hint: 'The top five stories, through Algolia\'s API.',
    widget: {
      title: 'Hacker News', url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5', refresh: 15,
      template: [
        '<ul class="data-list">{{#hits}}',
        '  <li><a href="{{url}}">{{title}}</a> <small>{{points}} points · <a href="https://news.ycombinator.com/item?id={{objectID}}">{{num_comments}} comments</a></small></li>',
        '{{/hits}}</ul>',
      ].join('\n'),
    },
  },
  {
    name: 'Exchange rates', glyph: Coins, hint: 'A dollar in euros, pounds, yen and Canadian dollars, updated daily.',
    widget: {
      title: 'Exchange rates', url: 'https://open.er-api.com/v6/latest/USD', refresh: 60,
      template: [
        '<ul class="data-list">',
        '  <li><span>1 {{base_code}} in euros</span> <b>€{{rates.EUR | number}}</b></li>',
        '  <li><span>in pounds</span> <b>£{{rates.GBP | number}}</b></li>',
        '  <li><span>in yen</span> <b>¥{{rates.JPY | number}}</b></li>',
        '  <li><span>in Canadian dollars</span> <b>{{rates.CAD | number}}</b></li>',
        '</ul>',
        '<p><small>As of {{time_last_update_unix | date}}</small></p>',
      ].join('\n'),
    },
  },
  {
    name: 'A service\'s status', glyph: Activity, hint: 'Any status page on Atlassian Statuspage — here, GitHub\'s. Swap the site in the address.',
    widget: {
      title: 'GitHub status', url: 'https://www.githubstatus.com/api/v2/summary.json', refresh: 5,
      template: [
        '<p><a href="{{page.url}}"><b>{{status.description}}</b></a></p>',
        '<ul class="data-list">{{#incidents}}<li><a href="{{shortlink}}">{{name}}</a> <small>{{status}}</small></li>{{/incidents}}</ul>',
        '{{^incidents}}<p class="muted">No open incidents · checked {{page.updated_at | ago}}</p>{{/incidents}}',
      ].join('\n'),
    },
  },
];

/** The example extensions that come with Launchpad, in public/extensions/. */
const BUNDLED_EXTENSIONS = [
  { path: 'extensions/notes.js', name: 'Notes', description: 'A scratchpad widget, kept in this browser' },
  { path: 'extensions/countdown.js', name: 'Countdown', description: 'A widget counting down the days to a date' },
  { path: 'extensions/search.js', name: 'Search box', description: 'Search the web, or your own site — in place of the greeting, say' },
  { path: 'extensions/starfield.js', name: 'Starfield', description: 'A background of stars streaming past' },
];

/** How often a data widget fetches its address again: [minutes, label]. */
const REFRESHES: [number, string][] = [
  [1, 'Every minute'], [5, 'Every 5 minutes'], [15, 'Every 15 minutes'], [60, 'Every hour'], [0, 'Only when the page opens'],
];

const nameOf = <T>(options: Option<T>[], id: T) => options.find(o => o.id === id)?.label ?? String(id);

const TIME_ZONES = Intl.supportedValuesOf?.('timeZone') ?? [];

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Names to use in a data widget's template examples: from the data that came back when there is some
 * (a value, one inside another, a list with a value in each item, and a date), or else made-up ones.
 */
function templateExamples(data: unknown) {
  const made = { value: 'name', nested: 'owner.login', list: 'items', item: 'name', when: 'updated', real: false };
  const isValue = (v: unknown) => typeof v === 'string' || typeof v === 'number';
  const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v);
  const entries = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : []);
  const plain = (v: unknown) => isValue(v) && !isDate(v);
  const name = (key: string) => /^[A-Za-z_$][\w$-]*$/.test(key);

  const top = entries(data).filter(([k]) => name(k));
  const lists: [string, unknown[]][] = Array.isArray(data) ? [['.', data]] : top.filter((e): e is [string, unknown[]] => Array.isArray(e[1]) && e[1].length > 0);
  const [list, items] = lists[0] ?? [];
  const first = items?.[0];
  const inItem = entries(first).filter(([k]) => name(k));
  const inside = top.map(([k, v]) => [k, entries(v).find(([n, x]) => name(n) && plain(x))?.[0]] as const).find(([, n]) => n);
  const inFirst = inItem.find(([, v]) => plain(v))?.[0];
  const found = {
    // outside the list, a value in its first item is reached through it: items.0.title
    value: top.find(([, v]) => plain(v))?.[0] ?? (inFirst && `${list === '.' ? '' : `${list}.`}0.${inFirst}`),
    nested: inside ? `${inside[0]}.${inside[1]}` : undefined,
    list,
    item: isValue(first) ? '.' : inItem.find(([, v]) => plain(v))?.[0],
    when: top.find(([, v]) => isDate(v))?.[0] ?? inItem.find(([, v]) => isDate(v))?.[0],
  };
  if (!found.value && !found.list) return made;
  return {
    value: found.value ?? made.value, nested: found.nested ?? made.nested, list: found.list ?? made.list,
    item: found.item ?? made.item, when: found.when ?? made.when, real: true,
  };
}

let instance: SettingsPanel | undefined;

export function openSettings(tab?: SettingsTab) {
  instance?.show(tab);
}

@customElement('settings-panel')
export class SettingsPanel extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private mode: 'view' | 'edit' = 'edit';
  @state() private tab: EditTab = 'cards';
  @state() private draft: LaunchpadConfig = clone(config.raw);
  @state() private dirty = false;
  @state() private busy = false;
  @state() private linkedFile?: string;
  @state() private placeResults?: Place[];
  @state() private placeBusy = false;
  /** The CSV import panel, when open. */
  @state() private csv?: { text: string; result?: CardsImport; error?: string; replace: boolean };
  /** Data widgets tried out in Settings: what came back, by widget id. */
  @state() private tries: Record<string, { busy?: boolean; data?: unknown; error?: string }> = {};
  #openCard?: string;
  #placeQuery = '';
  #downOnBackdrop = false;
  /** Whether custom CSS starts open (when there is some): set as the dialog opens, then left as you leave it. */
  #advancedOpen = false;

  constructor() {
    super();
    new StoreController(this, config, prefs, look, registry);
  }

  connectedCallback() {
    super.connectedCallback();
    instance = this;
    addEventListener('keydown', this.#onShortcut);
  }

  disconnectedCallback() {
    removeEventListener('keydown', this.#onShortcut);
    if (instance === this) instance = undefined;
    super.disconnectedCallback();
  }

  get #dialog() { return this.querySelector<HTMLDialogElement>('dialog.settings')!; }

  async show(tab?: SettingsTab) {
    if (arrange.active) return toast('Finish arranging first — Save or Cancel at the bottom of the page');
    if (tab === 'view') this.mode = 'view';
    else if (tab) { this.mode = 'edit'; this.tab = tab; }
    if (this.#dialog.open) return;
    this.draft = clone(config.raw);
    this.dirty = false;
    this.placeResults = undefined;
    this.csv = undefined;
    this.tries = {};
    this.#openCard = undefined;
    this.#advancedOpen = !!config.look.css;
    this.linkedFile = await linkedFileName();
    await this.updateComplete;
    this.#dialog.showModal();
    this.#previewCss();
  }

  updated(changed: Map<string, unknown>) {
    // a new tab, or the other mode, starts at the top
    if (changed.has('tab') || changed.has('mode')) this.querySelector('.settings-body')?.scrollTo(0, 0);
    this.#previewCss();
    this.#fillPreviews();
  }

  /** While the Page tab is open, the page behind shows the custom CSS being edited. */
  #previewCss() {
    const open = this.#dialog?.open && this.mode === 'edit' && this.tab === 'page';
    previewCss(open ? this.draft.look.css : undefined);
  }

  #onShortcut = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      this.show();
    }
  };

  // ---- editing helpers ----

  #edit(change: () => void) {
    change();
    this.dirty = true;
    this.requestUpdate();
  }

  #value(e: Event) {
    const el = e.target as HTMLInputElement;
    el.setCustomValidity('');
    return el.value;
  }

  #field(label: string, value: string, set: (v: string) => void,
         opts: { field: string; type?: string; required?: boolean; placeholder?: string; hint?: string; wide?: boolean; maxlength?: number; mono?: boolean; list?: string }) {
    return html`
      <label class="field ${opts.wide ? 'wide' : ''}">
        <span class="field-label">${label}${opts.required ? html`<span class="req" aria-hidden="true">*</span>` : nothing}</span>
        <input class="input ${opts.mono ? 'mono' : ''}" type=${opts.type ?? 'text'} .value=${value}
               ?required=${opts.required} placeholder=${opts.placeholder ?? ''} maxlength=${opts.maxlength ?? 500}
               list=${opts.list ?? nothing} data-field=${opts.field}
               @input=${(e: Event) => this.#edit(() => set(this.#value(e)))}>
        ${opts.hint ? html`<span class="field-hint">${opts.hint}</span>` : nothing}
      </label>`;
  }

  #switch(label: string, checked: boolean, set: (on: boolean) => void) {
    return html`
      <label class="switch-label">
        <input class="switch" type="checkbox" .checked=${checked}
               @change=${(e: Event) => this.#edit(() => set((e.target as HTMLInputElement).checked))}>
        ${label}
      </label>`;
  }

  // ---- drag to reorder (see lib/sortable.ts) ----

  #handle(what: string) {
    return html`
      <button class="drag-handle" type="button" data-sort-handle title="Drag to reorder"
              aria-label="Reorder ${what || 'item'} — drag, or use the arrow keys"
              @pointerdown=${(e: PointerEvent) => dragToReorder(e, m => this.#applyMove(m))}
              @keydown=${(e: KeyboardEvent) => keyboardReorder(e, m => this.#applyMove(m))}
              @click=${(e: Event) => e.preventDefault()}>${icon(GripVertical)}</button>`;
  }

  #remove<T>(list: T[], i: number, what: string) {
    return html`
      <button class="icon-btn xs danger" type="button" title="Remove" aria-label="Remove ${what || 'item'}"
              @click=${() => this.#edit(() => list.splice(i, 1))}>${icon(Trash)}</button>`;
  }

  #reorder<T>(list: T[], from: number, to: number) {
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
  }

  /**
   * List ids: "columns", "groups", "links", "zones", "sections", "cardlinks:<card id>", "tiles:<card id>" (the tiles
   * it lists), and "cards:<group id>" ('' = no group).
   */
  #applyMove({ from, to }: SortMove) {
    const d = this.draft;
    this.#edit(() => {
      if (from.list.startsWith('cards:')) {
        return moveCard(d, { group: from.list.slice(6), index: from.index }, { group: to.list.slice(6), index: to.index });
      }
      if (from.list.startsWith('tiles:')) {
        const card = d.cards.find(c => c.id === from.list.slice(6));
        if (!card) return;
        if (!d.useColumns) return this.#reorder(card.tiles, from.index, to.index);
        // with columns on, only the tiles outside them are listed; the rest keep to their columns
        const others = card.tiles.filter(t => !t.column);
        this.#reorder(others, from.index, to.index);
        card.tiles = [...card.tiles.filter(t => t.column), ...others];
        return;
      }
      const lists: Record<string, unknown[] | undefined> = {
        columns: d.columns, groups: d.groups, links: d.links, zones: d.widgets.clock.zones, sections: d.layout.sections,
        extensions: d.extensions,
      };
      const list = from.list.startsWith('cardlinks:')
        ? d.cards.find(c => c.id === from.list.slice(10))?.links
        : lists[from.list];
      if (list) this.#reorder(list, from.index, to.index);
    });
  }

  // ---- closing ----

  #requestClose = () => {
    if (this.dirty && !confirm('Discard your unsaved changes?')) return;
    this.dirty = false;
    this.#dialog.close();
  };

  #onCancel = (e: Event) => {
    e.preventDefault(); // Esc — check for unsaved changes first
    this.#requestClose();
  };

  // a click on the dimmed backdrop lands on the <dialog> itself
  #onPointerDown = (e: PointerEvent) => { this.#downOnBackdrop = e.target === this.#dialog; };
  #onClick = (e: MouseEvent) => {
    if (this.#downOnBackdrop && e.target === this.#dialog) this.#requestClose();
    this.#downOnBackdrop = false;
  };

  // ---- validation ----

  #firstProblem(): Problem | undefined {
    const d = this.draft;
    const blank = (s: string | undefined) => !s?.trim();
    if (blank(d.site.title)) return { tab: 'page', field: 'site:title', message: 'Give the page a title.' };
    for (const [i, column] of d.columns.entries()) {
      if (d.useColumns && blank(column.label)) return { tab: 'cards', field: `coldef:${i}:label`, message: 'Give this column a name.' };
    }
    for (const [i, link] of d.links.entries()) {
      if (blank(link.label)) return { tab: 'page', field: `link:${i}:label`, message: 'Give this link a label.' };
      if (blank(link.url)) return { tab: 'page', field: `link:${i}:url`, message: 'Add an address for this link.' };
    }
    for (const group of d.groups) {
      if (blank(group.name)) return { tab: 'cards', field: `group:${group.id}:name`, message: 'Give this group a name.' };
    }
    for (const card of d.cards) {
      const at = { tab: 'cards' as const };
      if (blank(card.name)) return { ...at, field: `card:${card.id}:name`, message: 'Give this card a name.' };
      for (const [i, link] of card.links.entries()) {
        if (blank(link.label) && blank(link.url)) continue; // an empty row is simply dropped
        if (blank(link.label)) return { ...at, field: `cardlink:${card.id}:${i}:label`, message: 'Give this link a label.' };
        if (blank(link.url)) return { ...at, field: `cardlink:${card.id}:${i}:url`, message: 'Add an address for this link.' };
      }
      for (const [i, tile] of card.tiles.entries()) {
        const url = tile.url.trim();
        // a column's tile has a row of its own while columns are on; otherwise it's listed with the rest
        const field = d.useColumns && tile.column ? `coltile:${card.id}:${tile.column}:url` : `tile:${card.id}:${i}:url`;
        if (tile.column) {
          if (url && !isHttpUrl(url)) return { ...at, field, message: 'Use a full address starting with https://' };
        } else if (url || !blank(tile.name) || !blank(tile.label)) { // an empty row is simply dropped
          if (!isHttpUrl(url)) return { ...at, field, message: url ? 'Use a full address starting with https://' : 'Add an address for this tile.' };
        }
      }
    }
    const { clock, weather } = d.widgets;
    for (const [i, zone] of clock.zones.entries()) {
      if (!validTimeZone(zone.timeZone.trim()) || !zone.timeZone.trim()) {
        return { tab: 'widgets', field: `zone:${i}:tz`, message: `Pick a time zone from the list, e.g. ${EXAMPLE_ZONE}.` };
      }
    }
    if (!d.layout.sections.find(x => x.id === 'weather')?.hidden && !weather.place) {
      return { tab: 'widgets', field: 'weather:search', message: 'Search for a place to show the weather for.' };
    }
    for (const [i, path] of d.extensions.entries()) {
      if (!isExtensionPath(path.trim())) {
        return { tab: 'page', field: `ext:${i}`, message: 'Use the path of a .js file beside index.html, like extensions/notes.js.' };
      }
    }
    for (const w of d.widgets.added) {
      if (w.type === 'extension') continue; // its settings are its extension's business
      const url = w.url.trim();
      if (!isHttpUrl(url)) {
        return { tab: 'widgets', field: `added:${w.id}:url`, message: url ? 'Use a full address starting with https://' : 'Add the address to show.' };
      }
      if (w.type === 'data') {
        try { parseTemplate(w.template); } catch (err) {
          return { tab: 'widgets', field: `added:${w.id}:template`, message: `The template doesn't add up: ${(err as Error).message}.` };
        }
      }
    }
    return undefined;
  }

  /** Jump to the first problem and show the browser's validation bubble on it. */
  async #check() {
    const problem = this.#firstProblem();
    if (!problem) return true;
    this.mode = 'edit';
    this.tab = problem.tab;
    await this.updateComplete;
    const input = this.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(problem.field)}"]`);
    // open whatever it's folded away in: its card, the columns panel, the advanced settings
    for (let d = input?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    input?.setCustomValidity(problem.message);
    input?.focus();
    input?.reportValidity();
    return false;
  }

  // ---- saving ----

  #save = async () => {
    if (!(await this.#check())) return;
    const next = clone(this.draft);
    this.dirty = false;
    this.#dialog.close();
    transition(() => {
      config.save(next);
      toast(config.customized ? 'Saved in this browser' : 'Saved');
    });
  };

  #saveToFile = async () => {
    if (!(await this.#check())) return;
    const next = clone(this.draft);
    this.busy = true;
    try {
      const result = await writeConfigFile(next);
      if (result === 'cancelled') return;
      this.dirty = false;
      this.#dialog.close();
      if (result === 'written') {
        transition(() => config.fileWritten(next));
        toast(`Saved to ${(await linkedFileName()) ?? 'launchpad.config.js'}`);
      } else {
        transition(() => config.save(next));
        toast('Downloaded launchpad.config.js — put it next to index.html in place of the old one');
      }
    } catch (err) {
      toast(`Couldn't save the file: ${(err as Error).message}`, 'error');
    } finally {
      this.busy = false;
    }
  };

  #discard = () => {
    if (!confirm('Go back to what\'s in launchpad.config.js? Changes saved only in this browser will be lost.')) return;
    config.discard();
    this.draft = clone(config.raw);
    this.dirty = false;
    toast('Back to launchpad.config.js');
  };

  #startGuide = () => {
    if (this.dirty && !confirm('Discard your unsaved changes and start the setup guide?')) return;
    this.dirty = false;
    this.#dialog.close();
    openSetupGuide();
  };

  #unlink = async () => {
    await forgetLinkedFile();
    this.linkedFile = undefined;
    toast('The next save will ask where launchpad.config.js is');
  };

  #openFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = parseConfigText(await file.text());
      // someone else's CSS can make the page look like something it isn't, their widgets show other sites, and
      // their extensions run code — so anything new of those kinds is kept only if you say so
      const css = !!data.look.css && data.look.css !== this.draft.look.css;
      const known = new Set(this.draft.widgets.added.map(w => (w.type === 'extension' ? '' : w.url)));
      const showing = (w: AddedWidget) => w.type !== 'extension' && !known.has(w.url);
      const widgets = data.widgets.added.filter(showing);
      const scripts = data.extensions.filter(p => !this.draft.extensions.includes(p));
      const what = [
        css ? 'custom CSS' : '',
        widgets.length ? `${widgets.length === 1 ? 'a widget' : `${widgets.length} widgets`} showing ${[...new Set(widgets.map(w => (w.type === 'extension' ? '' : hostOf(w.url))))].join(', ')}` : '',
        scripts.length ? `${scripts.length === 1 ? 'an extension' : `${scripts.length} extensions`} to run (${scripts.join(', ')})` : '',
      ].filter(Boolean).join(' and ');
      const keep = !what || confirm(`${file.name} has ${what} in it. These can change how the page looks, load things from `
        + 'other sites, or run code on it. Only keep them if you trust where the file came from.\n\nOK keeps them. Cancel loads the file without them.');
      if (!keep) {
        if (css) data.look.css = '';
        data.widgets.added = data.widgets.added.filter(w => !showing(w));
        data.extensions = data.extensions.filter(p => this.draft.extensions.includes(p));
        const kept = new Set<string>([...SECTION_IDS, ...data.widgets.added.map(w => w.id)]);
        data.layout.sections = data.layout.sections.filter(x => kept.has(x.id));
      }
      this.#edit(() => { this.draft = data; });
      toast(keep ? `Loaded ${file.name} — review it, then save` : `Loaded ${file.name} without its ${what.replace(/ showing .*/, '')} — review it, then save`);
    } catch (err) {
      toast(`Couldn't read ${file.name}: ${(err as Error).message}`, 'error');
    }
  };

  #loadExample(example: Example) {
    const what = `the ${example.name.toLowerCase()} example`;
    if (this.dirty && !confirm(`Replace your unsaved changes with ${what}?`)) return;
    this.#edit(() => { this.draft = example.config(); });
    toast(`Loaded ${what} — look through it, then Save to see it on the page`);
  }

  // ---- cards + groups ----

  #addCard = async (group?: string) => {
    const id = `card-${Date.now().toString(36)}`;
    this.#edit(() => {
      this.draft.cards.push({ id, name: '', ...(group ? { group } : {}), links: [], tiles: [] });
      this.#openCard = id;
    });
    await this.updateComplete;
    this.querySelector<HTMLInputElement>(`[data-field="card:${id}:name"]`)?.focus();
  };

  #addGroup = async () => {
    const ids = new Set(this.draft.groups.map(g => g.id));
    let n = this.draft.groups.length + 1;
    while (ids.has(`group-${n}`)) n++;
    const id = `group-${n}`;
    this.#edit(() => this.draft.groups.push({ id, name: '' }));
    await this.updateComplete;
    this.querySelector<HTMLInputElement>(`[data-field="group:${id}:name"]`)?.focus();
  };

  // its cards aren't deleted, they just move to "Other"
  #removeGroup(i: number) {
    const group = this.draft.groups[i];
    this.#edit(() => {
      this.draft.groups.splice(i, 1);
      for (const card of this.draft.cards) if (card.group === group.id) delete card.group;
    });
  }

  /** A card's tile for a column, created on first edit. */
  #columnTile(card: CardConfig, columnId: string): TileConfig {
    let tile = card.tiles.find(t => t.column === columnId);
    if (!tile) card.tiles.push(tile = { column: columnId, url: '' });
    return tile;
  }

  #addTile = async (card: CardConfig) => {
    this.#edit(() => card.tiles.push({ name: '', url: '' }));
    await this.updateComplete;
    this.querySelector<HTMLInputElement>(`[data-field="tile:${card.id}:${card.tiles.length - 1}:name"]`)?.focus();
  };

  /** "DEV · PROD" or "5 tiles" — what a collapsed card holds. */
  #cardSummary(card: CardConfig) {
    const filled = card.tiles.filter(t => t.url.trim());
    const count = (n: number) => `${n} tile${n === 1 ? '' : 's'}`;
    if (!this.draft.useColumns) return filled.length ? count(filled.length) : 'No tiles yet';
    const columns = this.draft.columns.filter(d => filled.some(t => t.column === d.id)).map(d => d.label);
    const others = filled.filter(t => !t.column).length;
    return [...columns, ...(others ? [`${count(others)} not in a column`] : [])].join(' · ') || 'No tiles yet';
  }

  #cardEditor(card: CardConfig) {
    const i = this.draft.cards.indexOf(card);
    const act = (change: () => void) => (e: Event) => { e.preventDefault(); this.#edit(change); };
    return html`
      <details class="app-editor" name="card-editor" data-card-editor=${card.id} data-sort-item ?open=${this.#openCard === card.id}>
        <summary>
          ${this.#handle(card.name || 'card')}
          <span class="app-editor-chevron">${icon(ChevronDown)}</span>
          <span class="app-editor-mark" style="--hue:${cardHue(i)}">${card.badge || initials(card.name) || '?'}</span>
          <span class="app-editor-title">${card.name || 'Untitled card'}</span>
          <span class="app-editor-meta">${this.#cardSummary(card)}</span>
          <span class="app-editor-actions">
            <button class="icon-btn xs danger" type="button" title="Delete card" aria-label="Delete ${card.name || 'card'}"
                    @click=${act(() => this.draft.cards.splice(this.draft.cards.indexOf(card), 1))}>${icon(Trash)}</button>
          </span>
        </summary>
        <div class="app-editor-body">
          <div class="field-grid">
            ${this.#field('Name', card.name, v => (card.name = v), {
              field: `card:${card.id}:name`, required: true, placeholder: this.draft.useColumns ? 'e.g. Billing' : 'e.g. Side projects',
            })}
            ${this.#field('Badge', card.badge ?? '', v => (card.badge = v || undefined), {
              field: `card:${card.id}:badge`, maxlength: 4, placeholder: initials(card.name) || 'Auto', hint: 'Up to 4 characters. Blank uses the initials.',
            })}
            ${this.draft.groups.length ? html`
              <label class="field">
                <span class="field-label">Group</span>
                <select class="input" @change=${(e: Event) => this.#edit(() => {
                  const value = (e.target as HTMLSelectElement).value;
                  if (value) card.group = value; else delete card.group;
                })}>
                  <option value="" ?selected=${!card.group}>No group (listed under “Other”)</option>
                  ${this.draft.groups.map(g => html`<option value=${g.id} ?selected=${card.group === g.id}>${g.name || 'Untitled group'}</option>`)}
                </select>
              </label>` : nothing}
            ${this.#widthField(card, `card:${card.id}:span`)}
            ${this.#field('Description', card.description ?? '', v => (card.description = v || undefined), {
              field: `card:${card.id}:description`, wide: true, placeholder: 'A line about what\'s in here',
            })}
          </div>

          ${this.draft.statusChecks
            ? this.#switch('Check whether this card\'s tiles are reachable', card.health !== false, on => {
                if (on) delete card.health; else card.health = false;
              })
            : html`<p class="field-hint">Status checks are off for the whole page —
                <button class="link-btn" type="button" @click=${() => (this.tab = 'page')}>change that under Page</button>.</p>`}

          ${this.draft.useColumns ? this.#columnTiles(card, i) : this.#ownTiles(card, i)}

          <div class="sub-editor">
            <div class="sub-editor-head">
              <span class="field-label">Links</span>
              <span class="field-hint">Docs, repos, dashboards — small buttons under the card's name.</span>
            </div>
            <div class="row-list" data-sort-list="cardlinks:${card.id}">
              ${card.links.map((link, j) => this.#cardLinkRow(card, link, j))}
            </div>
            <button class="btn btn-ghost btn-sm" type="button"
                    @click=${() => this.#edit(() => card.links.push({ label: '', url: '' }))}>${icon(Plus)} Add link</button>
          </div>
        </div>
      </details>
    `;
  }

  /** Columns on: an address per column — plus any tiles left over from when columns were off. */
  #columnTiles(card: CardConfig, i: number) {
    const columns = this.draft.columns;
    const others = card.tiles.filter(t => !t.column);
    return html`
      <div class="sub-editor">
        <div class="sub-editor-head">
          <span class="field-label">Columns</span>
          <span class="field-hint">Leave an address blank if this card doesn't have that column.</span>
        </div>
        ${columns.length ? columns.map(def => this.#columnTileRow(card, def)) : html`
          <p class="field-hint">No columns yet —
            <button class="link-btn" type="button" @click=${this.#openColumns}>add some</button>.</p>`}
      </div>
      ${others.length ? html`
        <div class="sub-editor">
          <div class="sub-editor-head">
            <span class="field-label">Not in a column</span>
            <span class="field-hint">Added while columns were off. They show after the columns — remove them, or move their addresses into a column.</span>
          </div>
          <div class="row-list" data-sort-list="tiles:${card.id}">
            ${others.map(tile => this.#tileRow(card, tile, cardColor(i)))}
          </div>
        </div>` : nothing}
    `;
  }

  /** Columns off: the card's own list of tiles, in order. */
  #ownTiles(card: CardConfig, i: number) {
    return html`
      <div class="sub-editor">
        <div class="sub-editor-head">
          <span class="field-label">Tiles</span>
          <span class="field-hint">Projects, sites, bookmarks — each its own tile, with an optional tag like WEB or REPO.</span>
        </div>
        ${card.tiles.length ? html`
          <div class="row-list" data-sort-list="tiles:${card.id}">
            ${card.tiles.map(tile => this.#tileRow(card, tile, cardColor(i)))}
          </div>` : nothing}
        <button class="btn btn-ghost btn-sm" type="button" @click=${() => this.#addTile(card)}>${icon(Plus)} Add tile</button>
      </div>
    `;
  }

  /** A status checkbox, disabled when there's no address or checks are off further up. */
  #statusCheck(tile: TileConfig | undefined, card: CardConfig, set: (on: boolean) => void) {
    const allowed = this.draft.statusChecks && card.health !== false;
    return html`
      <label class="check" title="Show a reachability dot for this tile">
        <input type="checkbox" .checked=${tile?.health !== false && allowed} ?disabled=${!tile?.url.trim() || !allowed}
               @change=${(e: Event) => this.#edit(() => set((e.target as HTMLInputElement).checked))}>
        Status
      </label>`;
  }

  #columnTileRow(card: CardConfig, def: ColumnDef) {
    const tile = card.tiles.find(t => t.column === def.id);
    return html`
      <div class="app-env-row" data-env style="--env:${def.color}">
        <span class="env-pill">${def.label}</span>
        <input class="input" aria-label="${def.label} name" placeholder="Name (optional)" .value=${tile?.name ?? ''}
               @input=${(e: Event) => this.#edit(() => { this.#columnTile(card, def.id).name = this.#value(e) || undefined; })}>
        <input class="input mono" type="url" aria-label="${def.label} address" placeholder="https://…" .value=${tile?.url ?? ''}
               data-field="coltile:${card.id}:${def.id}:url"
               @input=${(e: Event) => this.#edit(() => { this.#columnTile(card, def.id).url = this.#value(e); })}>
        ${this.#statusCheck(tile, card, on => {
          const target = this.#columnTile(card, def.id);
          if (on) delete target.health; else target.health = false;
        })}
      </div>
    `;
  }

  /**
   * [⋮⋮] [colour] [TAG] [Name] [https://…] [☑ Status] [🗑]
   * A column's tile, listed while columns are off, shows its column in place of the colour and tag.
   */
  #tileRow(card: CardConfig, tile: TileConfig, cardTint: string) {
    const i = card.tiles.indexOf(tile);
    const what = tile.name || hostOf(tile.url) || 'tile';
    const column = tile.column ? this.draft.columns.find(c => c.id === tile.column) : undefined;
    return html`
      <div class="free-tile-row" data-env data-sort-item style="--env:${column?.color ?? (tile.color || cardTint)}">
        ${this.#handle(what)}
        ${column ? html`
          <span class="env-pill tile-column-pill" title="Goes back in the ${column.label} column if columns are turned on">${column.label}</span>` : html`
          <label class="color-swatch" title=${tile.color ? 'Color' : 'Color — follows the card until you pick one'}>
            <input type="color" .value=${tile.color?.startsWith('#') ? tile.color : '#8b5cf6'} aria-label="${what} color"
                   @input=${(e: Event) => this.#edit(() => (tile.color = (e.target as HTMLInputElement).value))}>
          </label>
          <input class="input env-label-input" aria-label="Tag" placeholder="Tag" maxlength="12" .value=${tile.label ?? ''}
                 @input=${(e: Event) => this.#edit(() => { tile.label = this.#value(e) || undefined; })}>`}
        <input class="input" aria-label="Name" placeholder="Name" .value=${tile.name ?? ''}
               data-field="tile:${card.id}:${i}:name" @input=${(e: Event) => this.#edit(() => (tile.name = this.#value(e)))}>
        <input class="input mono" type="url" aria-label="Address" placeholder="https://…" .value=${tile.url}
               data-field="tile:${card.id}:${i}:url" @input=${(e: Event) => this.#edit(() => (tile.url = this.#value(e)))}>
        ${this.#statusCheck(tile, card, on => { if (on) delete tile.health; else tile.health = false; })}
        ${this.#remove(card.tiles, i, what)}
      </div>
    `;
  }

  #cardLinkRow(card: CardConfig, link: LinkItem, j: number) {
    return html`
      <div class="app-link-row" data-sort-item>
        ${this.#handle(link.label || 'link')}
        <select class="input" aria-label="Icon"
                @change=${(e: Event) => this.#edit(() => {
                  const value = (e.target as HTMLSelectElement).value as LinkIcon;
                  if (value === 'auto') delete link.icon; else link.icon = value;
                })}>
          ${LINK_ICONS.map(name => html`<option value=${name} ?selected=${(link.icon ?? 'auto') === name}>${ICON_LABELS[name]}</option>`)}
        </select>
        <input class="input" aria-label="Label" placeholder="Label" .value=${link.label}
               data-field="cardlink:${card.id}:${j}:label" @input=${(e: Event) => this.#edit(() => (link.label = this.#value(e)))}>
        <input class="input mono" aria-label="Address" placeholder="https://…" .value=${link.url}
               data-field="cardlink:${card.id}:${j}:url" @input=${(e: Event) => this.#edit(() => (link.url = this.#value(e)))}>
        ${this.#remove(card.links, j, link.label || 'link')}
      </div>
    `;
  }

  /** One group's cards — a drop target for cards dragged from any group. */
  #cardList(groupId: string, cards: CardConfig[]) {
    return html`
      <div class="editor-list app-list" data-sort-list="cards:${groupId}" data-sort-group="cards">
        ${repeat(cards, c => c.id, card => this.#cardEditor(card))}
        ${cards.length ? nothing : html`
          <p class="drop-hint">Drag cards here, or
            <button class="link-btn" type="button" @click=${() => this.#addCard(groupId || undefined)}>add one</button>.</p>`}
      </div>`;
  }

  #cardsTab() {
    if (this.csv) return this.#csvPanel();
    const { cards, groups } = this.draft;
    const cardsIn = (groupId: string) => cards.filter(c => (c.group ?? '') === groupId);
    const count = (n: number) => `${n} card${n === 1 ? '' : 's'}`;
    return html`
      <div class="settings-section-head">
        <p class="settings-hint">
          ${this.draft.useColumns ? 'Each card is a row on the page, with a tile in each column.' : 'Each card is a row on the page with its own tiles.'}
          Drag <span class="kbd-inline">${icon(GripVertical)}</span> to reorder${groups.length ? ' or move between groups' : ''}.</p>
        <div class="section-actions">
          ${this.#menu('csv', html`${icon(FileSpreadsheet)} Spreadsheet ${icon(ChevronDown)}`, html`
            ${this.#menuItem({ label: 'Import from CSV…', glyph: Upload, hint: 'Paste rows, or open a .csv file', run: () => (this.csv = { text: '', replace: false }) })}
            ${cards.length ? this.#menuItem({
              label: 'Export as CSV', glyph: Download, hint: 'Every card, to edit in a spreadsheet',
              run: () => download(cardsToCsv(this.draft), 'launchpad-cards.csv', 'text/csv'),
            }) : nothing}`)}
          <button class="btn btn-ghost btn-sm" type="button" @click=${this.#addGroup}>${icon(FolderPlus)} Add group</button>
          <button class="btn btn-soft btn-sm" type="button" @click=${() => this.#addCard()}>${icon(Plus)} Add card</button>
        </div>
      </div>

      ${this.#columnsPanel()}

      ${!cards.length && !groups.length ? html`
        <p class="empty">No cards yet — add one, import a CSV, or
          <button class="link-btn" type="button" @click=${this.#startGuide}>run the setup guide</button>.</p>` : nothing}

      ${groups.length ? html`
        <div class="group-list" data-sort-list="groups">
          ${repeat(groups, g => g.id, (g, gi) => html`
            <section class="group-block" data-sort-item>
              <header class="group-block-head">
                ${this.#handle(g.name || 'group')}
                <input class="input group-name-input" aria-label="Group name" placeholder="Group name" .value=${g.name}
                       data-field="group:${g.id}:name" @input=${(e: Event) => this.#edit(() => (g.name = this.#value(e)))}>
                <span class="group-count">${count(cardsIn(g.id).length)}</span>
                <button class="icon-btn xs" type="button" title="Add a card to this group"
                        aria-label="Add a card to ${g.name || 'this group'}" @click=${() => this.#addCard(g.id)}>${icon(Plus)}</button>
                <button class="icon-btn xs danger" type="button" title="Remove group — its cards move to Other"
                        aria-label="Remove group ${g.name}" @click=${() => this.#removeGroup(gi)}>${icon(Trash)}</button>
              </header>
              ${this.#cardList(g.id, cardsIn(g.id))}
            </section>`)}
        </div>
        <section class="group-block group-other">
          <header class="group-block-head">
            <span class="group-other-name">Other</span>
            <span class="group-count">Cards not in a group</span>
          </header>
          ${this.#cardList('', cardsIn(''))}
        </section>`
      : cards.length ? this.#cardList('', cards) : nothing}
    `;
  }

  // ---- CSV import ----

  #parseCsv(text: string) {
    const base = { text, replace: this.csv?.replace ?? false };
    if (!text.trim()) return void (this.csv = base);
    try {
      this.csv = { ...base, result: readCardsCsv(text, this.draft) };
    } catch (err) {
      this.csv = { ...base, error: (err as Error).message };
    }
  }

  #openCsvFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.#parseCsv(await file.text());
  };

  #importCsv = () => {
    const c = this.csv;
    if (!c?.result) return;
    const n = c.result.cards.length;
    if (c.replace && this.draft.cards.length && !confirm(`Replace all ${this.draft.cards.length} cards with the ${n} from the CSV?`)) return;
    this.#edit(() => applyCardsImport(this.draft, c.result!, c.replace));
    this.csv = undefined;
    toast(`Imported ${n} card${n === 1 ? '' : 's'} — review, then save`);
  };

  #csvPanel() {
    const c = this.csv!;
    const r = c.result;
    const columns = this.draft.useColumns ? this.draft.columns : [];
    const columnLabel = (id: string) => [...this.draft.columns, ...(r?.newColumns ?? [])].find(e => e.id === id)?.label ?? id;
    const groupName = (id?: string) => [...this.draft.groups, ...(r?.newGroups ?? [])].find(g => g.id === id)?.name ?? '—';
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const tileNames = (card: CardConfig) => {
      const names = card.tiles.map(t => (t.column ? columnLabel(t.column) : t.name || t.label || hostOf(t.url)));
      return names.length > 4 ? `${names.slice(0, 4).join(' · ')} +${names.length - 4}` : names.join(' · ') || '—';
    };
    const placeholder = columns.length
      ? `name,description,${columns.map(e => e.label).join(',')}\nBilling,Invoices and payments,https://…`
      : 'category,name,url,tag\nSide projects,Recipe box,https://…,WEB\nReading,A good blog,https://…';
    return html`
      <div class="settings-section-head">
        <div>
          <h3 class="panel-heading">${icon(FileSpreadsheet)} Import cards</h3>
          <p class="settings-hint">Paste rows from a spreadsheet, or open a .csv file. Either layout works:</p>
          <ul class="csv-layouts">
            <li><strong>One row per link</strong> — <code>category</code>, <code>name</code> and <code>url</code>, plus
              <code>tag</code>, <code>description</code> or <code>group</code> if you like. Rows with the same category
              share a card.</li>
            <li><strong>One row per card</strong>, for a page with columns — <code>name</code>, <code>description</code>,
              <code>group</code>, <code>badge</code>, one more per column headed by its label (like
              <code>${columns[0]?.label ?? 'DEV'}</code>), and <code>link:Docs</code>-style ones for link buttons.</li>
          </ul>
        </div>
        <button class="icon-btn" type="button" aria-label="Close import" @click=${() => (this.csv = undefined)}>${icon(X)}</button>
      </div>
      <div class="section-actions">
        <button class="btn btn-ghost btn-sm" type="button" @click=${() => this.querySelector<HTMLInputElement>('.csv-file')?.click()}>
          ${icon(FolderOpen)} Open a .csv file
        </button>
        <button class="btn btn-ghost btn-sm" type="button"
                @click=${() => download(csvTemplate(this.draft), 'launchpad-template.csv', 'text/csv')}>
          ${icon(Download)} Download a template
        </button>
      </div>
      <textarea class="input csv-input" rows="7" spellcheck="false" aria-label="CSV to import" placeholder=${placeholder}
                .value=${c.text} @input=${(e: Event) => this.#parseCsv((e.target as HTMLTextAreaElement).value)}></textarea>
      <input class="csv-file" type="file" accept=".csv,.tsv,.txt,text/csv" hidden @change=${this.#openCsvFile}>

      ${c.error ? html`<p class="csv-note error">${icon(TriangleAlert)} Couldn't read that — ${c.error}.</p>` : nothing}
      ${r ? html`
        <div class="csv-preview">
          <p>
            <strong>${plural(r.cards.length, 'card')}</strong> · ${plural(r.tileCount, 'tile')}
            ${r.columnLabels.length ? html` · columns: ${r.columnLabels.join(', ')}` : nothing}
            ${r.newColumns.length ? html`<span class="csv-new">(new: ${r.newColumns.map(e => e.label).join(', ')})</span>` : nothing}
            ${r.linkLabels.length ? html` · links: ${r.linkLabels.join(', ')}` : nothing}
            ${r.newGroups.length ? html` · new groups: ${r.newGroups.map(g => g.name).join(', ')}` : nothing}
          </p>
          ${r.warnings.map(w => html`<p class="csv-note">${icon(TriangleAlert)} ${w}</p>`)}
          <table class="csv-table">
            <thead><tr><th>Card</th><th>Group</th><th>Tiles</th><th>Links</th></tr></thead>
            <tbody>
              ${r.cards.slice(0, 6).map(card => html`
                <tr>
                  <td>${card.name}</td>
                  <td>${groupName(card.group)}</td>
                  <td>${tileNames(card)}</td>
                  <td>${card.links.length || '—'}</td>
                </tr>`)}
            </tbody>
          </table>
          ${r.cards.length > 6 ? html`<p class="field-hint">…and ${r.cards.length - 6} more.</p>` : nothing}
          <div class="segmented" role="radiogroup" aria-label="How to import">
            <label><input type="radio" name="csv-mode" .checked=${!c.replace} @change=${() => (this.csv = { ...c, replace: false })}>
              Add new, update matching names</label>
            <label><input type="radio" name="csv-mode" .checked=${c.replace} @change=${() => (this.csv = { ...c, replace: true })}>
              Replace all cards</label>
          </div>
        </div>` : nothing}

      <div class="section-actions end">
        <button class="btn btn-ghost" type="button" @click=${() => (this.csv = undefined)}>Cancel</button>
        <button class="btn btn-primary" type="button" ?disabled=${!r?.cards.length} @click=${this.#importCsv}>
          ${icon(ClipboardPaste)} Import ${r?.cards.length ? plural(r.cards.length, 'card') : ''}
        </button>
      </div>
    `;
  }

  // ---- columns ----

  #usage(columnId: string) {
    return this.draft.cards.filter(c => c.tiles.some(t => t.column === columnId && t.url.trim())).length;
  }

  #applyPreset(columns: ColumnDef[]) {
    const keep = new Set(columns.map(e => e.id));
    const lost = this.draft.columns.filter(e => !keep.has(e.id) && this.#usage(e.id));
    if (lost.length && !confirm(`This removes ${lost.map(e => e.label).join(', ')}, which some cards have tiles in. Continue?`)) return;
    this.#edit(() => {
      this.draft.columns = clone(columns);
      for (const card of this.draft.cards) card.tiles = card.tiles.filter(t => !t.column || keep.has(t.column));
    });
  }

  #removeColumn(i: number) {
    const column = this.draft.columns[i];
    const used = this.#usage(column.id);
    if (used && !confirm(`${used} card${used === 1 ? ' has a tile' : 's have tiles'} in ${column.label}. Remove it anyway?`)) return;
    this.#edit(() => {
      this.draft.columns.splice(i, 1);
      for (const card of this.draft.cards) card.tiles = card.tiles.filter(t => t.column !== column.id);
    });
  }

  #addColumn = async () => {
    const used = new Set(this.draft.columns.map(e => e.color));
    const ids = new Set(this.draft.columns.map(e => e.id));
    let n = this.draft.columns.length + 1;
    while (ids.has(`column-${n}`)) n++;
    this.#edit(() => this.draft.columns.push({
      id: `column-${n}`, label: '', color: NEW_COLUMN_COLORS.find(c => !used.has(c)) ?? '#888888',
    }));
    await this.updateComplete;
    this.querySelector<HTMLInputElement>(`[data-field="coldef:${this.draft.columns.length - 1}:label"]`)?.focus();
  };

  #openColumns = () => {
    const panel = this.querySelector<HTMLDetailsElement>('details.columns-panel');
    if (!panel) return;
    panel.open = true;
    panel.scrollIntoView({ block: 'nearest' });
  };

  /** Columns, folded away at the top of the Cards tab: what they are at a glance, and the editor inside. */
  #columnsPanel() {
    const { columns, useColumns } = this.draft;
    const labels = columns.map(c => c.label).join(', ');
    return html`
      <details class="fold columns-panel ${useColumns ? 'on' : ''}">
        <summary>
          <span class="fold-chevron">${icon(ChevronDown)}</span>
          <span class="fold-title">${icon(Columns3)} Columns</span>
          <span class="columns-state">
            ${!useColumns ? html`<span class="field-hint">Off</span>`
              : columns.length ? columns.map(c => html`<span class="env-pill sm" data-env style="--env:${c.color}">${c.label || '?'}</span>`)
              : html`<span class="field-hint">On, but none yet</span>`}
          </span>
          <span class="fold-hint">${useColumns ? 'A tile in each column on every card' : 'For a launch page: DEV, TEST, PROD lined up from card to card'}</span>
        </summary>
        <div class="fold-body">
          ${this.#switch('Line tiles up in columns', useColumns, on => (this.draft.useColumns = on))}
          <p class="field-hint">For a launch page, each card is an app with one tile per column, lined up from card to card.
            Leave it off for a home page, where each card holds its own list of tiles.</p>
      ${useColumns ? html`
        <div class="preset-row">
          <span class="field-label">Start from a preset</span>
          ${COLUMN_PRESETS.map(p => html`
            <button class="preset" type="button" @click=${() => this.#applyPreset(p.columns)}>
              ${p.columns.map(e => html`<span class="preset-dot" style="background:${e.color}"></span>`)}
              ${p.name}
            </button>`)}
        </div>
        ${columns.length ? html`
          <div class="editor-list" data-sort-list="columns">
            ${columns.map((column, i) => html`
              <div class="env-def-row" data-env data-sort-item style="--env:${column.color}">
                ${this.#handle(column.label || 'column')}
                <label class="color-swatch" title="Color">
                  <input type="color" .value=${column.color} aria-label="${column.label || 'Column'} color"
                         @input=${(e: Event) => this.#edit(() => (column.color = (e.target as HTMLInputElement).value))}>
                </label>
                <input class="input env-label-input" aria-label="Label" placeholder="e.g. QA" maxlength="12" .value=${column.label}
                       data-field="coldef:${i}:label" @input=${(e: Event) => this.#edit(() => (column.label = this.#value(e).toUpperCase()))}>
                <label class="check" title="Hatched tiles, as a reminder to be careful (e.g. production)">
                  <input type="checkbox" .checked=${!!column.caution}
                         @change=${(e: Event) => this.#edit(() => {
                           if ((e.target as HTMLInputElement).checked) column.caution = true; else delete column.caution;
                         })}>
                  Handle with care
                </label>
                <span class="env-usage">${this.#usage(column.id)} card${this.#usage(column.id) === 1 ? '' : 's'}</span>
                <button class="icon-btn xs danger" type="button" title="Remove" aria-label="Remove ${column.label || 'column'}"
                        @click=${() => this.#removeColumn(i)}>${icon(Trash)}</button>
              </div>`)}
          </div>` : html`<p class="empty">No columns yet — start from a preset, or add your own.</p>`}
        <button class="btn btn-soft btn-sm" type="button" @click=${this.#addColumn}>${icon(Plus)} Add column</button>`
      : columns.length ? html`
        <p class="settings-hint">Your columns (${labels}) are kept for when you turn this back on. Meanwhile their tiles
          show as ordinary tiles, tagged ${labels}.</p>` : nothing}
        </div>
      </details>
    `;
  }

  // ---- layout ----

  /** Width (Auto, or 1–12 columns) and whether it starts a new row — for a section or a card. */
  #widthField(p: { span?: number; newRow?: boolean }, field: string, placed?: number, first = false) {
    return html`
      <div class="field">
        <span class="field-label">Width</span>
        <div class="width-field">
          <select class="input" data-field=${field} aria-label="Width, out of 12 columns"
                  title="How many of the 12 columns it takes. Auto shares what's left of the row${placed && !p.span ? ` (${placed} now)` : ''}."
                  @change=${(e: Event) => this.#edit(() => setSpan(p, (e.target as HTMLSelectElement).value))}>
            <option value="" ?selected=${!p.span}>Auto</option>
            ${SPANS.map(n => html`<option value=${n} ?selected=${p.span === n}>${n}</option>`)}
          </select>
          <span class="width-of">of 12</span>
          <label class="check" title="Off: share the row with the one before, when there's room">
            <input type="checkbox" .checked=${p.newRow !== false} ?disabled=${first}
                   @change=${(e: Event) => this.#edit(() => setNewRow(p, (e.target as HTMLInputElement).checked))}>
            New row
          </label>
        </div>
      </div>`;
  }

  #arrangeOnPage = async () => {
    if (!(await this.#check())) return;
    const draft = clone(this.draft);
    const changed = this.dirty;
    this.dirty = false;
    this.#dialog.close();
    arrange.start(draft, changed);
  };

  #layoutTab() {
    const { layout } = this.draft;
    const placed = new Map(place(layout.sections.filter(x => !x.hidden)).map(p => [p.item.id, p.span]));
    return html`
      <div class="settings-section-head">
        <p class="settings-hint">Everything sits on a 12-column grid. <strong>Width</strong> is how many columns a section takes,
          and <strong>Auto</strong> shares what's left of its row. Untick <strong>New row</strong> to sit beside the one before.
          Narrow screens stack things.</p>
        <button class="btn btn-soft btn-sm" type="button" @click=${this.#arrangeOnPage}>${icon(LayoutGrid)} Arrange on the page</button>
      </div>
      <section class="settings-group">
        <h3 class="field-label">Density</h3>
        ${this.#choice('density', 'Density', DENSITIES, layout.density, id => this.#edit(() => (layout.density = id)))}
      </section>
      <section class="settings-group">
        <h3 class="field-label">Sections</h3>
        <div class="editor-list" data-sort-list="sections">
          ${layout.sections.map((section, i) => html`
            <div class="section-row ${section.hidden ? 'is-hidden' : ''}" data-sort-item>
              ${this.#handle(sectionName(this.draft, section.id))}
              <span class="section-name">${sectionName(this.draft, section.id)}</span>
              ${this.#widthField(section, `section:${section.id}:span`, placed.get(section.id), i === 0)}
              ${section.id === 'cards'
                ? html`<span class="field-hint">Always shown</span>`
                : this.#switch('Show', !section.hidden, on => this.#setShown(section.id, on))}
            </div>`)}
        </div>
        <p class="field-hint">Cards have a width too, in each card's settings under Cards — two half-width cards share a row.</p>
      </section>
    `;
  }

  // ---- look: the page's own, and yours (My view) ----

  /** A row of radio buttons drawn as one pill. */
  #choice<T extends string>(name: string, label: string, options: Option<T>[], current: T, pick: (id: T) => void) {
    return html`
      <div class="segmented" role="radiogroup" aria-label=${label}>
        ${options.map(o => html`
          <label title=${o.hint ?? nothing}>
            <input type="radio" name=${name} .checked=${o.id === current} @change=${() => pick(o.id)}>
            ${o.glyph ? icon(o.glyph) : nothing}${o.label}
          </label>`)}
      </div>`;
  }

  /**
   * Each style as a card, with a little card of tiles drawn in it. The preview wears the style itself
   * (data-style), so it's drawn with that style's own colours, corners, borders and type, in this theme.
   * `page` marks the page's choice.
   */
  #styleCards(name: string, current: Style, pick: (id: Style) => void, page?: Style) {
    return html`
      <div class="style-options" role="radiogroup" aria-label="Style">
        ${STYLES.map(id => html`
          <label class="style-card" title=${STYLE_INFO[id].description}>
            <input type="radio" name=${name} .checked=${id === current} @change=${() => pick(id)}>
            <span class="style-preview" data-style=${id} aria-hidden="true">
              <span class="sp-card">
                <span class="sp-head"><span class="sp-mark"></span><span class="sp-title">Aa</span></span>
                <span class="sp-tiles">
                  ${PREVIEW_TILES.map(c => html`<span class="sp-tile" data-env style="--env:${c}"><span class="sp-tag"></span><span class="sp-line"></span></span>`)}
                </span>
              </span>
              ${id === current ? html`<span class="style-current">${icon(Check)}</span>` : nothing}
            </span>
            <span class="style-name">
              ${STYLE_INFO[id].name}
              ${id === page ? html`<span class="style-tag" title="The page's own style">Page</span>` : nothing}
            </span>
          </label>`)}
      </div>`;
  }

  /** "Blueprint · System theme · Still background", and "· own colours" when it has some */
  #lookSummary(l = config.look) {
    const own = l.colors?.[l.style] ? ' · own colours' : '';
    return `${STYLE_INFO[l.style].name} · ${nameOf(THEMES, l.theme)} theme · ${nameOf(this.#backgrounds(), l.background)} background${own}`;
  }

  /**
   * The style's colours: ready-made combos to start from (each previewed in the style itself, light or dark as
   * the page is), then any of its six colours fine-tuned in a picker. Yours apply at once.
   */
  #colors() {
    const shown = shownColors();
    const mine = look.myColors;
    const style = STYLE_INFO[look.style].name;
    const hues = look.hues;
    const readable = Math.min(contrast(shown.ink, shown.bg), contrast(shown.ink, shown.panel));
    return html`
      <section class="settings-group colors-group">
        <h3 class="field-label">Colours <span class="field-hint">for ${style}</span></h3>
        <div class="combos" role="radiogroup" aria-label="Colour combos for ${style}">
          ${COMBOS[look.style].map(combo => html`
            <label class="combo">
              <input type="radio" name="combo" .checked=${sameHues(combo.hues, hues)} @change=${() => look.setHues(combo.hues)}>
              <span class="combo-preview" data-style=${look.style} data-combo aria-hidden="true"
                    style=${combo.hues.map((h, i) => `--hue-${i + 1}: ${h};`).join(' ')}>
                <span class="combo-panel">
                  <span class="combo-line"></span>
                  <span class="combo-dots"><i></i><i></i><i></i></span>
                </span>
              </span>
              <span class="combo-name">${combo.name}${combo.id === 'original' ? html` <span class="style-tag">Original</span>` : nothing}</span>
            </label>`)}
        </div>

        <h4 class="colors-sub">Fine-tune <span class="field-hint">${style}, ${look.theme}</span></h4>
        <div class="swatches">
          ${COLOR_SLOTS.map(slot => html`
            <div class="swatch" ?data-mine=${!!mine[slot]}>
              <button class="swatch-chip" type="button" popovertarget="color-${slot}" title=${COLOR_INFO[slot].hint}
                      aria-label="${COLOR_INFO[slot].name}: ${shown[slot]}"
                      style="--swatch: ${shown[slot]}; anchor-name: --color-${slot}"></button>
              ${mine[slot] ? html`
                <button class="swatch-reset" type="button" title="Back to the combo's"
                        aria-label="Put the combo's ${COLOR_INFO[slot].name.toLowerCase()} colour back"
                        @click=${() => look.setColor(slot, undefined)}>${icon(X)}</button>` : nothing}
              <span class="swatch-name">${COLOR_INFO[slot].name}</span>
              <div id="color-${slot}" class="tile-menu settings-menu color-menu" popover style="position-anchor: --color-${slot}">
                <div class="color-menu-head">
                  <strong>${COLOR_INFO[slot].name}</strong>
                  <span class="field-hint">${COLOR_INFO[slot].hint}</span>
                </div>
                <color-picker .value=${shown[slot]} label=${COLOR_INFO[slot].name}
                              @pick=${(e: CustomEvent<string>) => look.setColor(slot, e.detail)}></color-picker>
                ${mine[slot] ? html`
                  <button class="link-btn color-menu-reset" type="button" @click=${() => look.setColor(slot, undefined)}>
                    ${icon(RotateCcw)} Back to the combo's</button>` : nothing}
              </div>
            </div>`)}
        </div>
        ${readable < 3 ? html`
          <div class="look-note" role="note">
            ${icon(TriangleAlert)}<span>The text may be hard to read on these colours.</span>
          </div>` : nothing}
        ${safeMode ? html`
          <div class="look-note" role="note">
            ${icon(TriangleAlert)}<span>Safe mode is on (<code>?safe</code> in the address), so the page is in its style's own colours.</span>
          </div>` : nothing}
        <p class="field-hint">A combo sets ${style}'s colours in light and dark, and its glow, borders and particles follow.
          Fine-tuning is for ${look.theme} only; each style keeps its own.</p>
      </section>`;
  }

  /** The built-in backgrounds, then any that extensions add. */
  #backgrounds(): Option<Background>[] {
    const added = [...registry.backgrounds].filter(([id]) => id !== 'particles')
      .map(([id, def]): Option<Background> => ({ id, label: def.name, glyph: Puzzle, hint: def.description }));
    return [...BACKGROUNDS, ...added];
  }

  /** Your look becomes the page's (once saved), for everyone who hasn't picked their own. */
  #makeLookEveryones = () => {
    this.#edit(() => {
      const colors = look.colors;
      Object.assign(this.draft.look, { theme: look.themeMode, style: look.style, background: look.background, colors });
      if (!Object.keys(colors).length) delete this.draft.look.colors;
    });
    this.mode = 'edit';
    this.tab = 'page';
    toast('Copied into the page\'s look. Save to file to share it with everyone');
    // show where it went, and that it isn't saved yet
    void this.updateComplete.then(() => this.querySelector('.look-card')?.scrollIntoView({ block: 'center', behavior: look.reducedMotion ? 'auto' : 'smooth' }));
  };

  /** Whether the page's look has changed here since it was last saved. */
  #lookChanged() {
    const pick = ({ theme, style, background, colors }: LaunchpadConfig['look']) => JSON.stringify([theme, style, background, colors ?? {}]);
    return pick(this.draft.look) !== pick(config.look);
  }

  /** Real names from this page for the custom CSS examples, so they can be tried as they are. */
  #cssExamples() {
    const d = this.draft;
    const card = d.cards.find(c => c.tiles.length) ?? d.cards[0];
    // a tile in a column goes by the column's id, so the example is one that isn't
    const tile = d.cards.flatMap(c => c.tiles).find(t => !t.column && t.id && t.name);
    const column = d.useColumns ? d.columns[0] : undefined;
    const section = d.layout.sections.find(s => !s.hidden && s.id !== 'cards')?.id ?? 'greeting';
    return { card, tile, column, section, group: d.groups[0]?.id ?? 'other', style: d.look.style };
  }

  /** Custom CSS, folded away at the foot of the Page tab. */
  #customCss() {
    const l = this.draft.look;
    const ex = this.#cssExamples();
    const cardId = ex.card?.id ?? 'billing';
    const code = (s: string) => html`<code>${s}</code> `;
    return html`
      <details class="fold advanced custom-css" ?open=${this.#advancedOpen}>
        <summary>
          <span class="fold-chevron">${icon(ChevronDown)}</span>
          <span class="fold-title">${icon(Code)} Custom CSS</span>
          <span class="fold-hint">${l.css.trim() ? `${l.css.trim().split('\n').length} lines` : 'For anything else about how the page looks'}</span>
        </summary>
        <div class="fold-body">
        <p class="field-hint">The page behind shows it as you type. It comes after Launchpad's own styles, so plain
          selectors win. Set variables like <code>--accent</code> or <code>--radius</code> on <code>:root</code>, or aim
          at one card: ${ex.card
            ? html`your “${ex.card.name || ex.card.id}” card is <code>[data-card="${ex.card.id}"]</code>.`
            : html`<code>[data-card="its-id"]</code>, once you've added some.`}</p>
        ${safeMode ? html`
          <div class="look-note" role="note">
            ${icon(TriangleAlert)}
            <span>Safe mode is on (<code>?safe</code> in the address), so the page isn't using its custom CSS.
              Take <code>?safe</code> off to see it again.</span>
          </div>` : nothing}
        <textarea class="input csv-input css-input" rows="9" spellcheck="false" autocapitalize="off" aria-label="Custom CSS"
                  maxlength=${MAX_CSS} .value=${l.css}
                  placeholder=${`/* For example */\n:root { --accent: #0b7285; --radius-lg: 0.5rem; }\n[data-card="${cardId}"] { --hue: 160; }\n.hero-sub { display: none; }`}
                  @input=${(e: Event) => this.#edit(() => (l.css = (e.target as HTMLTextAreaElement).value))}></textarea>
        <details class="css-help">
          <summary>Variables and hooks</summary>
          <dl class="css-ref">
            <dt>Colours</dt>
            <dd>${['--bg', '--panel', '--ink', '--accent', '--accent-2', '--accent-3'].map(code)} — each style's own, and the rest
              follow them: ${['--muted', '--glass', '--glass-border', '--tile', '--hairline', '--ring'].map(code)}</dd>
            <dt>Shapes</dt>
            <dd>${['--radius-sm', '--radius', '--radius-lg', '--radius-full', '--border-w', '--mark-radius', '--shadow'].map(code)}</dd>
            <dt>Type</dt>
            <dd>${['--font-heading', '--font-label', '--font-numeric', '--font-display', '--title-size', '--heading-weight'].map(code)}
              using ${['--font-sans', '--font-serif', '--font-mono'].map(code)} or any font you load</dd>
            <dt>Backdrop</dt>
            <dd>${['--page-bg', '--blob-1', '--blob-2', '--blob-3', '--blob-4', '--particle', '--grain-opacity'].map(code)}</dd>
            <dt>A card</dt>
            <dd><code>[data-card="${cardId}"]</code> — its <code>--hue</code> (0–360) colours its badge and tiles</dd>
            <dt>A tile</dt>
            <dd>${ex.tile || !ex.column ? html`<code>[data-tile="${ex.tile?.id ?? 'recipe-box'}"]</code>` : nothing}${ex.tile && ex.column
              ? ' or ' : nothing}${ex.column ? html`<code>[data-column="${ex.column.id}"]</code> (each ${ex.column.label} tile)` : nothing}
              — its <code>--env</code> is its colour</dd>
            <dt>Also</dt>
            <dd>${[`[data-group="${ex.group}"]`, `[data-section="${ex.section}"]`, `:root[data-style="${ex.style}"]`, '.theme-dark', ':root[data-density="compact"]'].map(code)}</dd>
          </dl>
          ${this.draft.cards.length ? html`
            <p class="field-hint">Cards on this page: ${this.draft.cards.map(c => code(c.id))}. A tile's id comes from its
              name${ex.tile ? html` (“${ex.tile.name}” is <code>${ex.tile.id}</code>)` : nothing}, or is its column's.</p>` : nothing}
          <p class="field-hint">If your CSS ever hides the way back here, open the page with <code>?safe</code> on the end of
            its address to leave it off.</p>
        </details>
        </div>
      </details>
    `;
  }

  // ---- header links ----

  #headerLinks() {
    const { links } = this.draft;
    const add = async () => {
      this.#edit(() => links.push({ label: '', url: '' }));
      await this.updateComplete;
      this.querySelector<HTMLInputElement>(`[data-field="link:${links.length - 1}:label"]`)?.focus();
    };
    return html`
      <div class="sub-head">
        <h3 class="field-label">Header links</h3>
        <span class="field-hint">In the middle of the header bar</span>
        <button class="btn btn-ghost btn-sm" type="button" @click=${add}>${icon(Plus)} Add link</button>
      </div>
      ${links.length ? html`
        <div class="editor-list" data-sort-list="links">
          ${links.map((link, i) => html`
            <div class="link-edit-row" data-sort-item>
              ${this.#handle(link.label || 'link')}
              <input class="input" aria-label="Label" placeholder="Label" .value=${link.label}
                     data-field="link:${i}:label" @input=${(e: Event) => this.#edit(() => (link.label = this.#value(e)))}>
              <input class="input mono" aria-label="Address" placeholder="https://…" .value=${link.url}
                     data-field="link:${i}:url" @input=${(e: Event) => this.#edit(() => (link.url = this.#value(e)))}>
              ${this.#remove(links, i, link.label || 'link')}
            </div>`)}
        </div>`
      : html`<p class="empty">No header links — the header just shows the title.</p>`}
    `;
  }

  // ---- widgets ----

  #searchPlace = async () => {
    const name = this.#placeQuery.trim();
    if (name.length < 2) return;
    this.placeBusy = true;
    try {
      const params = new URLSearchParams({ name, count: '6', language: 'en', format: 'json' });
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!r.ok) throw new Error(r.statusText);
      this.placeResults = ((await r.json()).results ?? []) as Place[];
    } catch {
      toast('Couldn\'t search for places — check your connection', 'error');
    } finally {
      this.placeBusy = false;
    }
  };

  #pickPlace(p: Place) {
    const weather = this.draft.widgets.weather;
    this.#edit(() => {
      weather.place = [p.name, p.admin1].filter(Boolean).join(', ');
      weather.latitude = Math.round(p.latitude * 1e4) / 1e4;
      weather.longitude = Math.round(p.longitude * 1e4) / 1e4;
    });
    this.placeResults = undefined;
    const main = this.draft.widgets.clock.zones[0];
    if (main && p.timezone && p.timezone !== main.timeZone && confirm(`Set the main clock to ${p.timezone} as well?`)) {
      this.#edit(() => { main.timeZone = p.timezone!; main.label = p.name; });
    }
  }

  #shown(id: SectionId) { return !this.draft.layout.sections.find(x => x.id === id)?.hidden; }
  #setShown(id: SectionId, on: boolean) {
    const section = this.draft.layout.sections.find(x => x.id === id);
    if (!section) return;
    if (on) delete section.hidden; else section.hidden = true;
  }

  #widgetsTab() {
    const { greeting, clock, weather } = this.draft.widgets;
    const shown = (id: SectionId) => this.#shown(id);
    const toggle = (id: SectionId) => this.#switch('Show', shown(id), on => this.#setShown(id, on));
    return html`
      <p class="settings-hint">What each widget shows. Where it sits, and how wide, is under
        <button class="link-btn" type="button" @click=${() => (this.tab = 'layout')}>Layout</button>.</p>
      <section class="settings-card ${shown('greeting') ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Greeting</h3>
          ${toggle('greeting')}
        </header>
        <div class="field-grid">
          ${this.#field('Headline', greeting.title, v => (greeting.title = v), { field: 'greeting:title' })}
          ${this.#field('Subline', greeting.subtitle, v => (greeting.subtitle = v), { field: 'greeting:subtitle' })}
        </div>
        ${this.#switch('Type it out when the page opens', greeting.typing, on => (greeting.typing = on))}
      </section>

      <section class="settings-card ${shown('clock') ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Clock</h3>
          ${toggle('clock')}
        </header>
        <p class="field-hint">The first time zone is the big clock and sets the greeting; the rest are listed underneath.</p>
        <div class="editor-list" data-sort-list="zones">
          ${clock.zones.map((zone, i) => html`
            <div class="zone-row" data-sort-item>
              ${this.#handle(zone.label || 'time zone')}
              <input class="input" aria-label="Label" placeholder=${cityOf(zone.timeZone) || 'Label'} .value=${zone.label}
                     @input=${(e: Event) => this.#edit(() => (zone.label = this.#value(e)))}>
              <input class="input mono" aria-label="Time zone" list="tz-list" placeholder=${EXAMPLE_ZONE} .value=${zone.timeZone}
                     data-field="zone:${i}:tz" @input=${(e: Event) => this.#edit(() => (zone.timeZone = this.#value(e).trim()))}>
              ${i === 0 ? html`<span class="zone-main">Main</span>` : html`<span></span>`}
              <button class="icon-btn xs danger" type="button" title="Remove" aria-label="Remove ${zone.label || 'time zone'}"
                      ?disabled=${clock.zones.length === 1}
                      @click=${() => this.#edit(() => clock.zones.splice(i, 1))}>${icon(Trash)}</button>
            </div>`)}
        </div>
        <button class="btn btn-ghost btn-sm" type="button"
                @click=${() => this.#edit(() => clock.zones.push({ label: '', timeZone: '' }))}>${icon(Plus)} Add a time zone</button>
        <datalist id="tz-list">${TIME_ZONES.map(tz => html`<option value=${tz}></option>`)}</datalist>
      </section>

      <section class="settings-card ${shown('weather') ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Weather</h3>
          ${toggle('weather')}
        </header>
        <div class="place-current">
          ${icon(MapPin)}
          ${weather.place
            ? html`<strong>${weather.place}</strong><span class="field-hint">${weather.latitude}, ${weather.longitude}</span>`
            : html`<span class="field-hint">No place picked yet</span>`}
        </div>
        <div class="place-search">
          <input class="input" type="search" placeholder="Search a town or city" aria-label="Search places"
                 data-field="weather:search"
                 @input=${(e: Event) => { this.#placeQuery = this.#value(e); }}
                 @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); this.#searchPlace(); } }}>
          <button class="btn btn-soft btn-sm ${this.placeBusy ? 'spinning' : ''}" type="button" @click=${this.#searchPlace}>
            ${icon(Search)} Search
          </button>
        </div>
        ${this.placeResults ? html`
          <div class="place-results" role="listbox" aria-label="Places">
            ${this.placeResults.length ? this.placeResults.map(p => html`
              <button class="place-result" type="button" role="option" @click=${() => this.#pickPlace(p)}>
                <strong>${p.name}</strong>
                <span>${[p.admin1, p.country].filter(Boolean).join(', ')}</span>
              </button>`) : html`<p class="field-hint">No places found.</p>`}
          </div>` : nothing}
        <div class="segmented" role="radiogroup" aria-label="Units">
          ${(['fahrenheit', 'celsius'] as const).map(u => html`
            <label>
              <input type="radio" name="units" .checked=${weather.units === u}
                     @change=${() => this.#edit(() => (weather.units = u))}>
              ${u === 'fahrenheit' ? '°F' : '°C'}
            </label>`)}
        </div>
      </section>

      ${repeat(this.draft.widgets.added, w => w.id, w => this.#addedEditor(w))}

      <div class="add-widget">
        <span class="field-label">Add a widget</span>
        <button class="btn btn-ghost btn-sm" type="button"
                @click=${() => this.#addWidget('embed', id => ({ id, type: 'embed', title: '', url: '', height: 320 }))}>
          ${icon(AppWindow)} Embed a page
        </button>
        ${this.#menu('data', html`${icon(Braces)} Show data from a URL ${icon(ChevronDown)}`, html`
          ${this.#menuItem({
            label: 'Your own address', glyph: Braces, hint: 'Any address that returns JSON',
            run: () => this.#addWidget('data', id => ({ id, type: 'data', title: '', url: '', template: '', refresh: 5 })),
          })}
          <div class="menu-sep" role="separator"></div>
          <p class="menu-label">Ready-made</p>
          ${DATA_PRESETS.map(p => this.#menuItem({
            label: p.name, glyph: p.glyph, hint: p.hint,
            run: () => this.#addWidget('data', id => ({ id, type: 'data', ...p.widget })),
          }))}`)}
        ${[...registry.widgets].map(([type, def]) => html`
          <button class="btn btn-ghost btn-sm" type="button" title=${def.description ?? `From an extension: ${type}`}
                  @click=${() => this.#addWidget(type, id => ({ id, type: 'extension', extension: type, title: '', options: {} }))}>
            ${icon(Puzzle)} ${def.name}
          </button>`)}
      </div>
      ${registry.widgets.size ? nothing : html`
        <p class="field-hint">Extensions can add more kinds of widget — see
          <button class="link-btn" type="button" @click=${() => (this.tab = 'page')}>Page → Extensions</button>.</p>`}
    `;
  }

  // ---- added widgets: embeds, data, and extensions' ----

  #addWidget = async (prefix: string, make: (id: string) => AddedWidget) => {
    const d = this.draft;
    const ids = new Set<string>([...SECTION_IDS, ...d.widgets.added.map(w => w.id)]);
    let n = 1;
    while (ids.has(`${prefix}-${n}`)) n++;
    const id = `${prefix}-${n}`;
    this.#edit(() => {
      d.widgets.added.push(make(id));
      // in just before the cards, where it'll be seen; Layout or Arrange can move it
      const cards = d.layout.sections.findIndex(s => s.id === 'cards');
      d.layout.sections.splice(cards < 0 ? d.layout.sections.length : cards, 0, { id });
    });
    await this.updateComplete;
    const field = this.querySelector<HTMLInputElement>(`[data-field="added:${id}:url"]`) ?? this.querySelector<HTMLInputElement>(`[data-field="added:${id}:title"]`);
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  };

  #removeWidget(w: AddedWidget) {
    const d = this.draft;
    this.#edit(() => {
      d.widgets.added = d.widgets.added.filter(x => x !== w);
      d.layout.sections = d.layout.sections.filter(s => s.id !== w.id);
    });
  }

  /** Fetch a data widget's address now, to see what comes back and how the template shows it. */
  #tryData = async (w: DataWidget) => {
    this.tries = { ...this.tries, [w.id]: { ...this.tries[w.id], busy: true, error: undefined } };
    try {
      const data = await fetchData(w.url.trim());
      this.tries = { ...this.tries, [w.id]: { busy: false, data } };
    } catch (err) {
      this.tries = { ...this.tries, [w.id]: { busy: false, error: (err as Error).message } };
    }
  };

  /** Each tried data widget's preview, filled in with its template as it stands (cleaned, like on the page). */
  #fillPreviews() {
    for (const [id, t] of Object.entries(this.tries)) {
      const box = this.querySelector<HTMLElement>(`.data-preview[data-preview="${CSS.escape(id)}"]`);
      const w = this.draft.widgets.added.find(x => x.id === id);
      if (!box || !w || w.type !== 'data' || t.data === undefined) continue;
      try {
        box.replaceChildren(showData(w.template, t.data));
      } catch (err) {
        box.replaceChildren(Object.assign(document.createElement('p'), { className: 'data-error', textContent: `Template: ${(err as Error).message}` }));
      }
    }
  }

  #addedEditor(w: AddedWidget) {
    if (w.type === 'extension') return this.#extensionEditor(w);
    const label = w.title || hostOf(w.url) || (w.type === 'embed' ? 'New embed' : 'New data widget');
    return html`
      <section class="settings-card added-widget ${this.#shown(w.id) ? '' : 'off'}" data-added=${w.id}>
        <header class="settings-card-head">
          <h3>${icon(w.type === 'embed' ? AppWindow : Braces)} ${label}
            <span class="widget-kind">${w.type === 'embed' ? 'Embed' : 'Data'}</span></h3>
          ${this.#switch('Show', this.#shown(w.id), on => this.#setShown(w.id, on))}
          <button class="icon-btn xs danger" type="button" title="Remove" aria-label="Remove ${label}"
                  @click=${() => this.#removeWidget(w)}>${icon(Trash)}</button>
        </header>
        <div class="field-grid">
          ${this.#field('Title', w.title, v => (w.title = v), { field: `added:${w.id}:title`, placeholder: hostOf(w.url) || 'e.g. Status' })}
          ${w.type === 'embed'
            ? this.#field('Height', String(w.height), v => (w.height = Math.round(Number(v)) || 320), {
                field: `added:${w.id}:height`, type: 'number', hint: 'In pixels, 120 to 1600.',
              })
            : html`
              <label class="field">
                <span class="field-label">Refresh</span>
                <select class="input" @change=${(e: Event) => this.#edit(() => (w.refresh = Number((e.target as HTMLSelectElement).value)))}>
                  ${REFRESHES.map(([minutes, text]) => html`<option value=${minutes} ?selected=${w.refresh === minutes}>${text}</option>`)}
                </select>
              </label>`}
          ${this.#field('Address', w.url, v => (w.url = v.trim()), {
            field: `added:${w.id}:url`, type: 'url', mono: true, wide: true, required: true,
            placeholder: w.type === 'embed' ? 'https://status.example.com' : 'https://api.example.com/status.json',
          })}
        </div>
        ${w.type === 'embed' ? html`
          <p class="field-hint">Shown in a frame on the page. Some sites don't allow that and stay blank; the
            <span class="kbd-inline">${icon(ArrowUpRight)}</span> in its corner opens them in a tab instead.</p>`
          : this.#dataEditor(w)}
      </section>
    `;
  }

  /** An extension's widget: a title, and whatever settings its extension asks for. */
  #extensionEditor(w: ExtensionWidget) {
    const def = registry.widgets.get(w.extension);
    const label = sectionName(this.draft, w.id);
    const options = widgetOptions(def, w.options);
    return html`
      <section class="settings-card added-widget ${this.#shown(w.id) ? '' : 'off'}" data-added=${w.id}>
        <header class="settings-card-head">
          <h3>${icon(Puzzle)} ${label} <span class="widget-kind">${def?.name ?? w.extension}</span></h3>
          ${this.#switch('Show', this.#shown(w.id), on => this.#setShown(w.id, on))}
          <button class="icon-btn xs danger" type="button" title="Remove" aria-label="Remove ${label}"
                  @click=${() => this.#removeWidget(w)}>${icon(Trash)}</button>
        </header>
        ${def ? html`
          ${def.description ? html`<p class="field-hint">${def.description}</p>` : nothing}
          <div class="field-grid">
            ${this.#field('Title', w.title, v => (w.title = v), { field: `added:${w.id}:title`, placeholder: def.name })}
            ${(def.fields ?? []).map(f => this.#extensionField(w, f, options[f.key]))}
          </div>`
        : html`<p class="field-hint">Its extension ("${w.extension}") isn't loaded, so its settings can't be shown. Add its file
            under <button class="link-btn" type="button" @click=${() => (this.tab = 'page')}>Page → Extensions</button>.</p>`}
      </section>
    `;
  }

  /** One of an extension widget's settings, as the kind of input its field asks for. */
  #extensionField(w: ExtensionWidget, f: Field, value: unknown) {
    const set = (v: string | number | boolean) => this.#edit(() => { w.options = { ...w.options, [f.key]: v }; });
    const field = `added:${w.id}:${f.key}`;
    const target = (e: Event) => e.target as HTMLInputElement;
    const hint = f.hint ? html`<span class="field-hint">${f.hint}</span>` : nothing;
    if (f.type === 'checkbox') return html`
      <div class="field">
        <label class="check"><input type="checkbox" data-field=${field} .checked=${!!value} @change=${(e: Event) => set(target(e).checked)}> ${f.label}</label>
        ${hint}
      </div>`;
    if (f.type === 'select') return html`
      <label class="field">
        <span class="field-label">${f.label}</span>
        <select class="input" data-field=${field} @change=${(e: Event) => set(target(e).value)}>
          ${(f.choices ?? []).map(c => (typeof c === 'string' ? { value: c, label: c } : c)).map(c => html`
            <option value=${c.value} ?selected=${String(value) === c.value}>${c.label}</option>`)}
        </select>
        ${hint}
      </label>`;
    if (f.type === 'textarea') return html`
      <label class="field wide">
        <span class="field-label">${f.label}</span>
        <textarea class="input" rows="4" data-field=${field} placeholder=${f.placeholder ?? ''} .value=${String(value ?? '')}
                  @input=${(e: Event) => set(target(e).value)}></textarea>
        ${hint}
      </label>`;
    const type = ({ number: 'number', url: 'url', date: 'date', datetime: 'datetime-local' } as Record<string, string>)[f.type ?? ''] ?? 'text';
    return html`
      <label class="field">
        <span class="field-label">${f.label}</span>
        <input class="input" type=${type} data-field=${field} placeholder=${f.placeholder ?? ''} .value=${String(value ?? '')}
               @input=${(e: Event) => set(f.type === 'number' ? Number(target(e).value) : target(e).value)}>
        ${hint}
      </label>`;
  }

  /** The extension files to load, at the foot of the Page tab — with the examples that come with Launchpad. */
  #extensions() {
    const list = this.draft.extensions;
    const add = async (path = '') => {
      this.#edit(() => list.push(path));
      await this.updateComplete;
      if (!path) this.querySelector<HTMLInputElement>(`[data-field="ext:${list.length - 1}"]`)?.focus();
    };
    const state = (path: string) => {
      if (safeMode) return html`<span class="ext-state">Off in safe mode</span>`;
      const f = registry.files.get(path.trim());
      if (!f) return html`<span class="ext-state">Loads once saved</span>`;
      if (f.state === 'loading') return html`<span class="ext-state">Loading…</span>`;
      if (f.state === 'failed') return html`<span class="ext-state bad" title=${f.error ?? ''}>${icon(TriangleAlert)} ${f.error}</span>`;
      return html`<span class="ext-state good">${icon(Check)} ${f.adds.length ? `Adds the ${f.adds.join(', the ')}` : 'Loaded'}</span>`;
    };
    return html`
      <details class="fold advanced extensions">
        <summary>
          <span class="fold-chevron">${icon(ChevronDown)}</span>
          <span class="fold-title">${icon(Puzzle)} Extensions</span>
          <span class="fold-hint">${list.length ? `${list.length} file${list.length === 1 ? '' : 's'}` : 'More widgets and backgrounds, from script files'}</span>
        </summary>
        <div class="fold-body">
          <p class="field-hint">Script files beside <code>index.html</code> that add kinds of widget (under Widgets) and
            backgrounds (in My view). They run with full access to this page, so only add files you trust. Taking one out
            counts once the page reloads, and <code>?safe</code> in the address leaves them all out.</p>
          ${list.length ? html`
            <div class="editor-list" data-sort-list="extensions">
              ${list.map((path, i) => html`
                <div class="extension-row" data-sort-item>
                  ${this.#handle(path || 'extension')}
                  <input class="input mono" aria-label="Extension file" placeholder="extensions/my-widget.js" .value=${path}
                         data-field="ext:${i}" @input=${(e: Event) => this.#edit(() => (list[i] = this.#value(e).trim()))}>
                  ${state(path)}
                  ${this.#remove(list, i, path || 'extension')}
                </div>`)}
            </div>` : nothing}
          <div class="section-actions">
            <button class="btn btn-ghost btn-sm" type="button" @click=${() => add()}>${icon(Plus)} Add a file</button>
          </div>
          <div class="sub-head">
            <span class="field-label">Examples that come with Launchpad</span>
            <span class="field-hint">in the extensions folder beside index.html</span>
          </div>
          <div class="example-cards">
            ${BUNDLED_EXTENSIONS.map(x => {
              const on = list.includes(x.path);
              return html`
                <button class="example-card" type="button" ?disabled=${on} @click=${() => add(x.path)}
                        title=${on ? 'Already listed' : `Add ${x.path}`}>
                  ${icon(on ? Check : Plus)}
                  <span><strong>${x.name}</strong><span class="field-hint">${x.description}</span></span>
                </button>`;
            })}
          </div>
        </div>
      </details>
    `;
  }

  #dataEditor(w: DataWidget) {
    const tried = this.tries[w.id];
    const sample = tried?.data === undefined ? '' : typeof tried.data === 'string' ? tried.data : JSON.stringify(tried.data, null, 2);
    const ex = templateExamples(tried?.data);
    const code = (s: string) => html`<code>${s}</code>`;
    return html`
      <label class="field">
        <span class="field-label">Template</span>
        <textarea class="input csv-input template-input" rows="5" spellcheck="false" autocapitalize="off" aria-label="Template"
                  data-field="added:${w.id}:template" maxlength=${MAX_TEMPLATE} .value=${w.template}
                  placeholder=${'<ul>{{#items}}\n  <li><a href="{{url}}">{{name}}</a> <small>{{updated | ago}}</small></li>\n{{/items}}</ul>'}
                  @input=${(e: Event) => this.#edit(() => (w.template = this.#value(e)))}></textarea>
        <span class="field-hint">Leave it blank to see the data as it comes. Opened from a file, the page can only read
          servers that let other sites read them (CORS); most public APIs do.</span>
      </label>
      <div class="data-try">
        <button class="btn btn-soft btn-sm ${tried?.busy ? 'spinning' : ''}" type="button" ?disabled=${!isHttpUrl(w.url)}
                @click=${() => this.#tryData(w)}>${icon(tried?.busy ? RefreshCw : Play)} Try it</button>
        ${tried?.error ? html`<span class="data-error">Couldn't load it: ${tried.error}</span>`
          : tried?.data !== undefined ? html`<span class="field-hint">This is how it'll look:</span>` : nothing}
      </div>
      ${tried?.data !== undefined ? html`
        <div class="data-preview data-body widget glass" data-preview=${w.id}></div>
        <details class="css-help">
          <summary>What came back</summary>
          <pre class="data-raw">${sample.length > 6000 ? `${sample.slice(0, 6000)}\n…` : sample}</pre>
        </details>` : nothing}
      <details class="css-help">
        <summary>Writing a template</summary>
        ${tried?.data !== undefined ? html`<p class="field-hint">The examples use names from the data that came back.</p>` : nothing}
        <dl class="css-ref">
          <dt>A value</dt><dd>${code(`{{${ex.value}}}`)}, or one inside another: ${code(`{{${ex.nested}}}`)}${ex.real ? nothing : html`, ${code('{{items.0.title}}')}`}</dd>
          <dt>A list</dt><dd>${code(`{{#${ex.list}}}…{{/${ex.list}}}`)} repeats for each item, and inside it ${code(`{{${ex.item}}}`)} is the item's.
            ${code('{{.}}')} is the item itself, and ${code('{{#.}}…{{/.}}')} goes through data that's a list to begin with.</dd>
          <dt>If not</dt><dd>${code(`{{^${ex.list}}}Nothing yet{{/${ex.list}}}`)} shows when the list is empty, or a value is missing or false</dd>
          <dt>Formats</dt><dd>${code(`{{${ex.when} | ago}}`)} — also ${code('date')}, ${code('time')}, ${code('number')}, ${code('upper')}, ${code('lower')}</dd>
          <dt>Markup</dt><dd>Simple tags — ${code('b')}, ${code('i')}, ${code('a')}, ${code('ul')}/${code('li')}, ${code('p')}, ${code('span')},
            ${code('small')}, ${code('code')}, ${code('img')}, ${code('table')} — and class names, to style in custom CSS. Anything else is left out.</dd>
        </dl>
      </details>
    `;
  }

  // ---- general: title, logo, heading, footer, status checks ----

  #uploadLogo = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') return toast('Choose an .svg file', 'error');
    if (file.size > 256 * 1024) return toast('That SVG is over 256 KB — try a simpler one', 'error');

    const svg = new DOMParser().parseFromString(await file.text(), 'image/svg+xml').documentElement;
    if (svg.nodeName !== 'svg') return toast(`${file.name} isn't a valid SVG`, 'error');

    // read as a data URI so it can live in the config (and travel with it)
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*/, 'data:image/svg+xml'));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    this.#edit(() => { this.draft.site.logo = dataUri; });

    const [, , w, h] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const ratio = w && h ? w / h : Number.parseFloat(svg.getAttribute('width') ?? '') / Number.parseFloat(svg.getAttribute('height') ?? '');
    toast(Number.isFinite(ratio) && Math.abs(ratio - 1) > 0.1
      ? 'Logo added — it isn\'t square, so it\'ll be fitted inside a square'
      : 'Logo added — save to apply');
  };

  /** The page as a whole: its name and logo, header links, status checks, its look, and custom CSS. */
  #pageTab() {
    const { site } = this.draft;
    return html`
      <div class="field-grid">
        <div class="field wide">
          <span class="field-label">Logo</span>
          <div class="logo-field">
            <span class="logo-preview">
              ${site.logo ? html`<img src=${site.logo} alt="Current logo">` : html`<span class="brand-mark" aria-hidden="true"></span>`}
            </span>
            <span class="logo-pipe" aria-hidden="true"></span>
            <span class="logo-title">${site.title || 'Page title'}</span>
            <span class="logo-actions">
              <button class="btn btn-soft btn-sm" type="button"
                      @click=${() => this.querySelector<HTMLInputElement>('.logo-file')?.click()}>
                ${icon(Upload)} ${site.logo ? 'Replace SVG' : 'Upload SVG'}
              </button>
              ${site.logo ? html`
                <button class="btn btn-ghost btn-sm" type="button"
                        @click=${() => this.#edit(() => { delete this.draft.site.logo; })}>
                  ${icon(RotateCcw)} Use default
                </button>` : nothing}
            </span>
          </div>
          <span class="field-hint">A square SVG works best. It's shown exactly as drawn, and used as the browser-tab icon too.</span>
          <input class="logo-file" type="file" accept=".svg,image/svg+xml" hidden @change=${this.#uploadLogo}>
        </div>
        ${this.#field('Page title', site.title, v => (site.title = v), { field: 'site:title', required: true, hint: 'In the header and the browser tab.' })}
        ${this.#field('Heading', site.heading, v => (site.heading = v), {
          field: 'site:heading', placeholder: 'e.g. Projects, Applications', hint: 'Above the cards. Blank hides it.',
        })}
        ${this.#field('Footer text', site.footer, v => (site.footer = v), { field: 'site:footer', wide: true })}
      </div>

      <section class="settings-group">${this.#headerLinks()}</section>

      <section class="settings-card ${this.draft.statusChecks ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Status checks</h3>
          ${this.#switch('On', this.draft.statusChecks, on => (this.draft.statusChecks = on))}
        </header>
        <p class="field-hint">Every couple of minutes, each tile's address is pinged to show a green or red dot. Opened
          straight from a file, Chrome and Edge ask permission to reach your local network for this; turning checks off
          stops the prompt. A single card or tile can be left out under Cards.</p>
      </section>

      <section class="settings-card look-card">
        <header class="settings-card-head">
          <h3>Look</h3>
          <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.mode = 'view')}>${icon(PaletteIcon)} Choose in My view</button>
        </header>
        <p class="field-hint"><strong>${this.#lookSummary(this.draft.look)}</strong>. Everyone sees this unless they pick
          their own. To change it, pick a look in My view, then choose <strong>Make it everyone's</strong>.</p>
        ${this.#lookChanged() ? html`
          <div class="look-note" role="note">
            ${icon(Users)}
            <span>Changed, but not saved yet. <strong>Save to file</strong> puts it in launchpad.config.js, for everyone
              who opens the page. <strong>Save</strong> keeps it in this browser only.</span>
          </div>` : nothing}
      </section>

      ${this.#customCss()}
      ${this.#extensions()}
    `;
  }

  // ---- my view (applies immediately) ----

  #viewMode() {
    return html`
      <p class="settings-hint"><strong>Just for you.</strong> Kept in this browser only: none of it goes into
        launchpad.config.js, so nobody else sees it.</p>

      ${look.customized ? html`
        <div class="look-note" role="note">
          ${icon(PaletteIcon)}
          <span>This look is yours, in this browser. Everyone else sees the page's: ${this.#lookSummary()}.</span>
          <span class="look-note-actions">
            <button class="link-btn" type="button" @click=${() => look.reset()}>${icon(RotateCcw)} Use the page's</button>
            <button class="link-btn" type="button"
                    title="Copies your look into the page's settings. Save to file then puts it in launchpad.config.js, for everyone."
                    @click=${this.#makeLookEveryones}>${icon(Users)} Make it everyone's</button>
          </span>
        </div>` : nothing}

      <section class="settings-group">
        <h3 class="field-label">Style</h3>
        ${this.#styleCards('style', look.style, id => look.set('style', id), config.look.style)}
      </section>

      <div class="look-grid">
        <section class="settings-group">
          <h3 class="field-label">Theme</h3>
          ${this.#choice('theme-mode', 'Theme', THEMES, look.themeMode, id => look.set('theme', id))}
        </section>
        <section class="settings-group">
          <h3 class="field-label">Background</h3>
          ${this.#choice('background', 'Background', this.#backgrounds(), look.background, id => look.set('background', id))}
        </section>
      </div>

      ${this.#colors()}

      <div class="look-grid">
      <section class="settings-group">
        <h3 class="field-label">Cards on my page</h3>
        ${config.cards.length ? html`
          <div class="toggle-list">
            ${config.cards.map((card, i) => html`
              <label class="toggle-row">
                <span class="app-editor-mark" style="--hue:${cardHue(i)}">${card.badge || initials(card.name)}</span>
                <span class="toggle-name">${card.name}</span>
                <input class="switch" type="checkbox" .checked=${!prefs.isHidden(card.id)} aria-label="Show ${card.name}"
                       @change=${(e: Event) => transition(() => prefs.setHidden(card.id, !(e.target as HTMLInputElement).checked))}>
              </label>`)}
          </div>` : html`<p class="field-hint">No cards yet.</p>`}
      </section>

      <div class="settings-stack">
      <section class="settings-group">
        <h3 class="field-label">Motion</h3>
        ${this.#choice('motion', 'Motion', MOTIONS, look.motion, id => look.set('motion', id))}
      </section>
      <section class="settings-group">
        <h3 class="field-label">Pins and history</h3>
        <div class="history-row">
          <span class="field-hint">${prefs.pins.length} pinned · ${prefs.recents.length} recently opened</span>
          <button class="btn btn-ghost btn-sm" type="button" ?disabled=${!prefs.pins.length}
                  @click=${() => transition(() => prefs.clearPins())}>Unpin all</button>
          <button class="btn btn-ghost btn-sm" type="button" ?disabled=${!prefs.recents.length}
                  @click=${() => transition(() => prefs.clearRecents())}>Clear history</button>
        </div>
      </section>
      </div>
      </div>
    `;
  }

  // ---- shell ----

  #status() {
    if (this.mode === 'view') return html`Just for you`;
    if (this.dirty) return html`<span class="settings-dirty">Unsaved changes</span>`;
    if (config.customized) return html`Saved in this browser ${ago(config.savedAt ?? Date.now())} · not in the file yet`;
    if (!config.fileLoaded) return html`Not saved to a file yet`;
    return html`Matches <code>launchpad.config.js</code>`;
  }

  #banner() {
    if (this.mode !== 'edit') return nothing;
    if (!config.fileLoaded) return html`
      <div class="settings-banner warn" role="note">
        ${icon(TriangleAlert)}
        <span><code>launchpad.config.js</code> wasn't found next to <code>index.html</code> (or has a typo), so the page started empty. <strong>Save to file</strong> creates it.</span>
        <button class="link-btn" type="button" @click=${this.#startGuide}>${icon(Sparkles)} Run the setup guide</button>
      </div>`;
    if (config.fileChanged) return html`
      <div class="settings-banner warn" role="note">
        ${icon(TriangleAlert)}
        <span>The config file changed after these settings were saved in this browser.</span>
        <button class="link-btn" type="button" @click=${this.#discard}>Use the file's version</button>
      </div>`;
    return nothing;
  }

  #fileTarget() {
    if (import.meta.env.DEV) return html`Saves to <code>public/launchpad.config.js</code>`;
    if (!canWriteDirectly) return html`This browser can't write files directly, so <strong>Save to file</strong> downloads one.`;
    if (this.linkedFile) return html`Saves to <code>${this.linkedFile}</code>
      <button class="link-btn" type="button" title="Pick a different file next time" @click=${this.#unlink}>${icon(Unlink)} Change</button>`;
    return html`The first <strong>Save to file</strong> asks you to pick the <code>launchpad.config.js</code> next to <code>index.html</code>.`;
  }

  /** A button that opens a small menu (a popover in the top layer, placed beside it by anchor positioning). */
  #menu(id: string, label: unknown, body: unknown, placement: 'down' | 'up' = 'down') {
    return html`
      <button class="btn btn-ghost btn-sm menu-trigger" type="button" popovertarget="menu-${id}" style="anchor-name: --menu-${id}">${label}</button>
      <div id="menu-${id}" class="tile-menu settings-menu ${placement}" popover style="position-anchor: --menu-${id}">${body}</div>`;
  }

  #menuItem({ label, glyph, run, hint }: MenuItem) {
    const pick = (e: Event) => {
      (e.currentTarget as HTMLElement).closest<HTMLElement>('[popover]')?.hidePopover();
      run();
    };
    return html`
      <button class="menu-item" type="button" @click=${pick}>
        ${icon(glyph)}${hint ? html`<span class="menu-item-text"><strong>${label}</strong><span>${hint}</span></span>` : label}
      </button>`;
  }

  /** Opening, downloading and starting over — everything about the file except saving to it. */
  #fileMenu() {
    return html`
      <p class="menu-note">${this.#fileTarget()}</p>
      <div class="menu-sep" role="separator"></div>
      ${this.#menuItem({
        label: 'Open a file…', glyph: FolderOpen, hint: 'A launchpad.config.js, or a .json copy',
        run: () => this.querySelector<HTMLInputElement>('.settings-file')?.click(),
      })}
      ${this.#menuItem({ label: 'Download a copy', glyph: Download, hint: 'These settings, as launchpad.config.js', run: () => download(toFileText(this.draft)) })}
      ${config.customized ? this.#menuItem({
        label: 'Use the file\'s version', glyph: RotateCcw, hint: 'Forget the changes saved only in this browser', run: this.#discard,
      }) : nothing}
      <div class="menu-sep" role="separator"></div>
      <p class="menu-label">Start from an example</p>
      ${EXAMPLES.map(x => this.#menuItem({ label: x.name, glyph: x.glyph, hint: x.description, run: () => this.#loadExample(x) }))}
    `;
  }

  render() {
    const editing = this.mode === 'edit';
    const tabs: Record<EditTab, () => unknown> = {
      cards: () => this.#cardsTab(),
      layout: () => this.#layoutTab(),
      widgets: () => this.#widgetsTab(),
      page: () => this.#pageTab(),
    };

    return html`
      <dialog class="settings" aria-labelledby="settings-title" @close=${() => previewCss()}
              @cancel=${this.#onCancel} @pointerdown=${this.#onPointerDown} @click=${this.#onClick}>
        <div class="settings-frame">
          <header class="settings-head">
            <div>
              <h2 id="settings-title">Settings</h2>
              <p class="settings-sub">${this.#status()}</p>
            </div>
            <div class="mode-switch" role="tablist" aria-label="Settings mode">
              <button type="button" role="tab" aria-selected=${String(!editing)} @click=${() => (this.mode = 'view')}>
                ${icon(User)} My view
              </button>
              <button type="button" role="tab" aria-selected=${String(editing)} @click=${() => (this.mode = 'edit')}>
                ${icon(Pencil)} Edit page
              </button>
            </div>
            <button class="icon-btn" type="button" aria-label="Close settings" @click=${this.#requestClose}>${icon(X)}</button>
          </header>

          ${this.#banner()}

          ${editing ? html`
            <nav class="settings-tabs" role="tablist" aria-label="Page settings">
              ${EDIT_TABS.map(t => html`
                <button type="button" role="tab" aria-selected=${String(this.tab === t.id)} @click=${() => (this.tab = t.id)}>
                  ${icon(t.glyph)}<span>${t.label}</span>
                </button>`)}
              <span class="settings-tabs-indicator" aria-hidden="true"></span>
            </nav>` : nothing}

          <div class="settings-body" role="tabpanel">${editing ? tabs[this.tab]() : this.#viewMode()}</div>

          <footer class="settings-foot">
            ${editing ? html`
              <div class="settings-foot-group">
                ${this.#menu('file', html`${icon(FolderOpen)} File ${icon(ChevronDown)}`, this.#fileMenu(), 'up')}
              </div>
              <div class="settings-foot-group">
                <button class="btn btn-ghost" type="button" @click=${this.#requestClose}>Cancel</button>
                <button class="btn btn-soft" type="button" title="Apply and keep in this browser" ?disabled=${!this.dirty} @click=${this.#save}>
                  ${icon(Check)} Save
                </button>
                <button class="btn btn-primary ${this.busy ? 'spinning' : ''}" type="button" title="Write launchpad.config.js"
                        ?disabled=${(!this.dirty && !config.customized && config.fileLoaded) || this.busy} @click=${this.#saveToFile}>
                  ${icon(Save)} Save to file
                </button>
              </div>` : html`
              <span></span>
              <button class="btn btn-primary" type="button" @click=${this.#requestClose}>Done</button>`}
          </footer>
        </div>
        <input class="settings-file" type="file" accept=".js,.json,application/json,text/javascript" hidden @change=${this.#openFile}>
      </dialog>
    `;
  }
}
