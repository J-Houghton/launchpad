// src/components/settings-panel.ts
// Settings, in two modes:
//   My view   — just for you: appearance, which apps show, pins + history. Applies instantly, saved in this browser.
//   Edit page — the page itself: apps, environments, links, widgets, branding. A draft until saved;
//               "Save to file" writes launchpad.config.js (see lib/config-file.ts), "Save" keeps it in this browser.
// Open it with the faint gear in the footer, or Ctrl+, (⌘+, on a Mac).
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import {
  ENV_PRESETS, LINK_ICONS, cityOf, config, isHttpUrl, validTimeZone,
  type AppConfig, type AppEnv, type EnvDef, type LaunchpadConfig, type LinkIcon, type LinkItem,
} from '../config.js';
import { dragToReorder, keyboardReorder, type SortMove } from '../lib/sortable.js';
import { applyAppsImport, appsToCsv, csvTemplate, readAppsCsv, type AppsImport } from '../lib/csv.js';
import { openSetupGuide } from './setup-guide.js';
import { prefs } from '../lib/prefs.js';
import { StoreController } from '../lib/store-controller.js';
import { transition } from '../lib/transition.js';
import {
  currentPalette, setPalette, setThemeMode, themeMode, type Palette, type ThemeMode,
} from '../lib/theme.js';
import {
  canWriteDirectly, download, forgetLinkedFile, linkedFileName, parseConfigText, toFileText, writeConfigFile,
} from '../lib/config-file.js';
import {
  AppWindow, Check, ChevronDown, ClipboardPaste, Download, FileSpreadsheet, FolderOpen, FolderPlus, GripVertical,
  Layers, Link2, MapPin, Monitor, Moon, Pencil, Plus, RotateCcw, Save, Search, SlidersHorizontal, Sparkles, Sun,
  Trash, TriangleAlert, Type, Unlink, Upload, User, X, icon, type IconNode,
} from '../lib/icons.js';
import { ago, initials, toast } from '../lib/util.js';

type EditTab = 'apps' | 'environments' | 'links' | 'widgets' | 'branding';
export type SettingsTab = 'view' | EditTab;
type Problem = { tab: EditTab; field: string; message: string; appId?: string };
type Place = { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string };

const EDIT_TABS: { id: EditTab; label: string; glyph: IconNode }[] = [
  { id: 'apps', label: 'Applications', glyph: AppWindow },
  { id: 'environments', label: 'Environments', glyph: Layers },
  { id: 'links', label: 'Header links', glyph: Link2 },
  { id: 'widgets', label: 'Widgets', glyph: SlidersHorizontal },
  { id: 'branding', label: 'Branding', glyph: Type },
];

const ICON_LABELS: Record<LinkIcon, string> = {
  auto: 'Auto icon', book: 'Docs', link: 'Link', git: 'Repo', chart: 'Dashboard',
  ticket: 'Tickets', terminal: 'Console', database: 'Database', shield: 'Security', chat: 'Chat',
};

const PALETTES: { id: Palette; name: string; description: string; swatches: string[] }[] = [
  {
    id: 'classic', name: 'Classic', description: 'Greys, purple and gold, with a striped border.',
    swatches: ['hsl(266 55% 35%)', 'hsl(41.45 87.36% 65.88%)', '#0b95da', '#da950b', '#e61a5e'],
  },
  {
    id: 'aurora', name: 'Aurora', description: 'Soft purple, pink and gold glow with frosted glass.',
    swatches: ['oklch(0.48 0.2 300)', 'oklch(0.62 0.21 345)', 'oklch(0.66 0.15 245)', 'oklch(0.76 0.15 75)', 'oklch(0.7 0.11 185)'],
  },
];

const THEMES: { id: ThemeMode; label: string; glyph: IconNode }[] = [
  { id: 'system', label: 'System', glyph: Monitor },
  { id: 'light', label: 'Light', glyph: Sun },
  { id: 'dark', label: 'Dark', glyph: Moon },
];

const NEW_ENV_COLORS = ['#10b981', '#8b5cf6', '#f97316', '#64748b', '#0ea5e9', '#d946ef'];
const TIME_ZONES = Intl.supportedValuesOf?.('timeZone') ?? [];

const clone = <T>(value: T): T => structuredClone(value);
const hueOf = (i: number) => (285 + i * 35) % 360;

let instance: SettingsPanel | undefined;

export function openSettings(tab?: SettingsTab) {
  instance?.show(tab);
}

@customElement('settings-panel')
export class SettingsPanel extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private mode: 'view' | 'edit' = 'edit';
  @state() private tab: EditTab = 'apps';
  @state() private draft: LaunchpadConfig = clone(config.raw);
  @state() private dirty = false;
  @state() private busy = false;
  @state() private linkedFile?: string;
  @state() private placeResults?: Place[];
  @state() private placeBusy = false;
  /** The CSV import panel, when open. */
  @state() private csv?: { text: string; result?: AppsImport; error?: string; replace: boolean };
  #openApp?: string;
  #placeQuery = '';
  #downOnBackdrop = false;

  constructor() {
    super();
    new StoreController(this, config, prefs);
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
    if (tab === 'view') this.mode = 'view';
    else if (tab) { this.mode = 'edit'; this.tab = tab; }
    if (this.#dialog.open) return;
    this.draft = clone(config.raw);
    this.dirty = false;
    this.placeResults = undefined;
    this.csv = undefined;
    this.#openApp = undefined;
    this.linkedFile = await linkedFileName();
    await this.updateComplete;
    this.#dialog.showModal();
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

  /** List ids: "envs", "groups", "links", "zones", "applinks:<app id>", "apps:<group id>" ('' = no group). */
  #applyMove({ from, to }: SortMove) {
    const d = this.draft;
    this.#edit(() => {
      if (from.list.startsWith('apps:')) {
        const appsIn = (group: string) => d.apps.filter(a => (a.group ?? '') === group);
        const app = appsIn(from.list.slice(5))[from.index];
        if (!app) return;
        d.apps.splice(d.apps.indexOf(app), 1);
        const group = to.list.slice(5);
        if (group) app.group = group; else delete app.group;
        // only the order within a group matters, so place it relative to that group's apps
        const peers = appsIn(group);
        const before = peers[to.index];
        if (before) d.apps.splice(d.apps.indexOf(before), 0, app);
        else if (peers.length) d.apps.splice(d.apps.indexOf(peers[peers.length - 1]) + 1, 0, app);
        else d.apps.push(app);
        return;
      }
      const lists: Record<string, unknown[] | undefined> = {
        envs: d.environments, groups: d.groups, links: d.links, zones: d.widgets.clock.zones,
      };
      const list = from.list.startsWith('applinks:')
        ? d.apps.find(a => a.id === from.list.slice(9))?.links
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
    if (blank(d.site.title)) return { tab: 'branding', field: 'site:title', message: 'Give the page a title.' };
    for (const [i, env] of d.environments.entries()) {
      if (blank(env.label)) return { tab: 'environments', field: `envdef:${i}:label`, message: 'Give this environment a name.' };
    }
    for (const [i, link] of d.links.entries()) {
      if (blank(link.label)) return { tab: 'links', field: `link:${i}:label`, message: 'Give this link a label.' };
      if (blank(link.url)) return { tab: 'links', field: `link:${i}:url`, message: 'Add an address for this link.' };
    }
    for (const group of d.groups) {
      if (blank(group.name)) return { tab: 'apps', field: `group:${group.id}:name`, message: 'Give this group a name.' };
    }
    for (const app of d.apps) {
      const at = { tab: 'apps' as const, appId: app.id };
      if (blank(app.name)) return { ...at, field: `app:${app.id}:name`, message: 'Give this application a name.' };
      for (const [i, link] of app.links.entries()) {
        if (blank(link.label) && blank(link.url)) continue; // an empty row is simply dropped
        if (blank(link.label)) return { ...at, field: `applink:${app.id}:${i}:label`, message: 'Give this link a label.' };
        if (blank(link.url)) return { ...at, field: `applink:${app.id}:${i}:url`, message: 'Add an address for this link.' };
      }
      for (const env of app.envs) {
        if (env.url.trim() && !isHttpUrl(env.url.trim())) {
          return { ...at, field: `appenv:${app.id}:${env.env}:url`, message: 'Use a full address starting with https://' };
        }
      }
    }
    const { clock, weather } = d.widgets;
    for (const [i, zone] of clock.zones.entries()) {
      if (!validTimeZone(zone.timeZone.trim()) || !zone.timeZone.trim()) {
        return { tab: 'widgets', field: `zone:${i}:tz`, message: 'Pick a time zone from the list, e.g. America/Chicago.' };
      }
    }
    if (weather.enabled && !weather.place) {
      return { tab: 'widgets', field: 'weather:search', message: 'Search for a place to show the weather for.' };
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
    if (problem.appId) {
      const details = this.querySelector<HTMLDetailsElement>(`details[data-app="${CSS.escape(problem.appId)}"]`);
      if (details) details.open = true;
    }
    const input = this.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(problem.field)}"]`);
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
    transition(() => config.save(next));
    toast(config.customized ? 'Saved in this browser' : 'Saved');
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
      this.#edit(() => { this.draft = data; });
      toast(`Loaded ${file.name} — review it, then save`);
    } catch (err) {
      toast(`Couldn't read ${file.name}: ${(err as Error).message}`, 'error');
    }
  };

  // ---- applications + groups ----

  #addApp = async (group?: string) => {
    const id = `app-${Date.now().toString(36)}`;
    this.#edit(() => {
      this.draft.apps.push({ id, name: '', ...(group ? { group } : {}), links: [], envs: [] });
      this.#openApp = id;
    });
    await this.updateComplete;
    this.querySelector<HTMLInputElement>(`[data-field="app:${id}:name"]`)?.focus();
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

  // its apps aren't deleted, they just move to "Other"
  #removeGroup(i: number) {
    const group = this.draft.groups[i];
    this.#edit(() => {
      this.draft.groups.splice(i, 1);
      for (const app of this.draft.apps) if (app.group === group.id) delete app.group;
    });
  }

  /** An app's entry for an environment, created on first edit. */
  #appEnv(app: AppConfig, envId: string): AppEnv {
    let env = app.envs.find(e => e.env === envId);
    if (!env) app.envs.push(env = { env: envId, url: '' });
    return env;
  }

  #appEditor(app: AppConfig) {
    const i = this.draft.apps.indexOf(app);
    const act = (change: () => void) => (e: Event) => { e.preventDefault(); this.#edit(change); };
    const configured = this.draft.environments.filter(d => app.envs.some(e => e.env === d.id && e.url.trim()));
    return html`
      <details class="app-editor" name="app-editor" data-app=${app.id} data-sort-item ?open=${this.#openApp === app.id}>
        <summary>
          ${this.#handle(app.name || 'application')}
          <span class="app-editor-chevron">${icon(ChevronDown)}</span>
          <span class="app-editor-mark" style="--hue:${hueOf(i)}">${app.badge || initials(app.name) || '?'}</span>
          <span class="app-editor-title">${app.name || 'Untitled application'}</span>
          <span class="app-editor-meta">${configured.map(d => d.label).join(' · ') || 'No environments yet'}</span>
          <span class="app-editor-actions">
            <button class="icon-btn xs danger" type="button" title="Delete application" aria-label="Delete ${app.name || 'application'}"
                    @click=${act(() => this.draft.apps.splice(this.draft.apps.indexOf(app), 1))}>${icon(Trash)}</button>
          </span>
        </summary>
        <div class="app-editor-body">
          <div class="field-grid">
            ${this.#field('Name', app.name, v => (app.name = v), { field: `app:${app.id}:name`, required: true, placeholder: 'e.g. Billing' })}
            ${this.#field('Badge', app.badge ?? '', v => (app.badge = v || undefined), {
              field: `app:${app.id}:badge`, maxlength: 4, placeholder: initials(app.name) || 'Auto', hint: 'Up to 4 characters. Blank uses the initials.',
            })}
            ${this.draft.groups.length ? html`
              <label class="field">
                <span class="field-label">Group</span>
                <select class="input" @change=${(e: Event) => this.#edit(() => {
                  const value = (e.target as HTMLSelectElement).value;
                  if (value) app.group = value; else delete app.group;
                })}>
                  <option value="" ?selected=${!app.group}>No group (listed under “Other”)</option>
                  ${this.draft.groups.map(g => html`<option value=${g.id} ?selected=${app.group === g.id}>${g.name || 'Untitled group'}</option>`)}
                </select>
              </label>` : nothing}
            ${this.#field('Description', app.description ?? '', v => (app.description = v || undefined), {
              field: `app:${app.id}:description`, wide: true, placeholder: 'What it does, who looks after it…',
            })}
          </div>

          <div class="sub-editor">
            <div class="sub-editor-head">
              <span class="field-label">Environments</span>
              <span class="field-hint">Leave an address blank if the app doesn't have that environment.</span>
            </div>
            ${this.draft.statusChecks
              ? this.#switch('Check whether this app\'s environments are reachable', app.health !== false, on => {
                  if (on) delete app.health; else app.health = false;
                })
              : html`<p class="field-hint">Status checks are off for the whole page —
                  <button class="link-btn" type="button" @click=${() => (this.tab = 'environments')}>change that in Environments</button>.</p>`}
            ${this.draft.environments.length ? this.draft.environments.map(def => this.#appEnvRow(app, def)) : html`
              <p class="field-hint">No environments are defined yet —
                <button class="link-btn" type="button" @click=${() => (this.tab = 'environments')}>add some</button>.</p>`}
          </div>

          <div class="sub-editor">
            <div class="sub-editor-head">
              <span class="field-label">Links</span>
              <span class="field-hint">Docs, runbooks, repos, dashboards — shown as buttons on the app.</span>
            </div>
            <div class="row-list" data-sort-list="applinks:${app.id}">
              ${app.links.map((link, j) => this.#appLinkRow(app, link, j))}
            </div>
            <button class="btn btn-ghost btn-sm" type="button"
                    @click=${() => this.#edit(() => app.links.push({ label: '', url: '' }))}>${icon(Plus)} Add link</button>
          </div>
        </div>
      </details>
    `;
  }

  #appEnvRow(app: AppConfig, def: EnvDef) {
    const env = app.envs.find(e => e.env === def.id);
    return html`
      <div class="app-env-row" data-env style="--env:${def.color}">
        <span class="env-pill">${def.label}</span>
        <input class="input" aria-label="${def.label} name" placeholder="Name (optional)" .value=${env?.name ?? ''}
               @input=${(e: Event) => this.#edit(() => { this.#appEnv(app, def.id).name = this.#value(e) || undefined; })}>
        <input class="input mono" type="url" aria-label="${def.label} address" placeholder="https://…" .value=${env?.url ?? ''}
               data-field="appenv:${app.id}:${def.id}:url"
               @input=${(e: Event) => this.#edit(() => { this.#appEnv(app, def.id).url = this.#value(e); })}>
        <label class="check" title="Show a reachability dot for this environment">
          <input type="checkbox" .checked=${env?.health !== false && app.health !== false && this.draft.statusChecks}
                 ?disabled=${!env?.url || app.health === false || !this.draft.statusChecks}
                 @change=${(e: Event) => this.#edit(() => {
                   const target = this.#appEnv(app, def.id);
                   if ((e.target as HTMLInputElement).checked) delete target.health;
                   else target.health = false;
                 })}>
          Status
        </label>
      </div>
    `;
  }

  #appLinkRow(app: AppConfig, link: LinkItem, j: number) {
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
               data-field="applink:${app.id}:${j}:label" @input=${(e: Event) => this.#edit(() => (link.label = this.#value(e)))}>
        <input class="input mono" aria-label="Address" placeholder="https://…" .value=${link.url}
               data-field="applink:${app.id}:${j}:url" @input=${(e: Event) => this.#edit(() => (link.url = this.#value(e)))}>
        ${this.#remove(app.links, j, link.label || 'link')}
      </div>
    `;
  }

  /** One group's apps — a drop target for apps dragged from any group. */
  #appList(groupId: string, apps: AppConfig[]) {
    return html`
      <div class="editor-list app-list" data-sort-list="apps:${groupId}" data-sort-group="apps">
        ${repeat(apps, a => a.id, app => this.#appEditor(app))}
        ${apps.length ? nothing : html`
          <p class="drop-hint">Drag applications here, or
            <button class="link-btn" type="button" @click=${() => this.#addApp(groupId || undefined)}>add one</button>.</p>`}
      </div>`;
  }

  #appsTab() {
    if (this.csv) return this.#csvPanel();
    const { apps, groups } = this.draft;
    const appsIn = (groupId: string) => apps.filter(a => (a.group ?? '') === groupId);
    return html`
      <div class="settings-section-head">
        <p class="settings-hint">Each application is a row on the page, with a tile for every environment it has.
          Drag <span class="kbd-inline">${icon(GripVertical)}</span> to reorder${groups.length ? ' or move between groups' : ''}.</p>
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" type="button" @click=${() => (this.csv = { text: '', replace: false })}>
            ${icon(FileSpreadsheet)} Import CSV
          </button>
          <button class="btn btn-ghost btn-sm" type="button" ?disabled=${!apps.length}
                  @click=${() => download(appsToCsv(this.draft), 'launchpad-apps.csv', 'text/csv')}>
            ${icon(Download)} Export CSV
          </button>
          <button class="btn btn-ghost btn-sm" type="button" @click=${this.#addGroup}>${icon(FolderPlus)} Add group</button>
          <button class="btn btn-soft btn-sm" type="button" @click=${() => this.#addApp()}>${icon(Plus)} Add application</button>
        </div>
      </div>

      ${!apps.length && !groups.length ? html`
        <p class="empty">No applications yet — add one, import a CSV, or
          <button class="link-btn" type="button" @click=${this.#startGuide}>run the setup guide</button>.</p>` : nothing}

      ${groups.length ? html`
        <div class="group-list" data-sort-list="groups">
          ${repeat(groups, g => g.id, (g, gi) => html`
            <section class="group-block" data-sort-item>
              <header class="group-block-head">
                ${this.#handle(g.name || 'group')}
                <input class="input group-name-input" aria-label="Group name" placeholder="Group name" .value=${g.name}
                       data-field="group:${g.id}:name" @input=${(e: Event) => this.#edit(() => (g.name = this.#value(e)))}>
                <span class="group-count">${appsIn(g.id).length} app${appsIn(g.id).length === 1 ? '' : 's'}</span>
                <button class="icon-btn xs" type="button" title="Add an application to this group"
                        aria-label="Add an application to ${g.name || 'this group'}" @click=${() => this.#addApp(g.id)}>${icon(Plus)}</button>
                <button class="icon-btn xs danger" type="button" title="Remove group — its apps move to Other"
                        aria-label="Remove group ${g.name}" @click=${() => this.#removeGroup(gi)}>${icon(Trash)}</button>
              </header>
              ${this.#appList(g.id, appsIn(g.id))}
            </section>`)}
        </div>
        <section class="group-block group-other">
          <header class="group-block-head">
            <span class="group-other-name">Other</span>
            <span class="group-count">Apps not in a group</span>
          </header>
          ${this.#appList('', appsIn(''))}
        </section>`
      : apps.length ? this.#appList('', apps) : nothing}
    `;
  }

  // ---- CSV import ----

  #parseCsv(text: string) {
    const base = { text, replace: this.csv?.replace ?? false };
    if (!text.trim()) return void (this.csv = base);
    try {
      this.csv = { ...base, result: readAppsCsv(text, this.draft) };
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
    const n = c.result.apps.length;
    if (c.replace && this.draft.apps.length && !confirm(`Replace all ${this.draft.apps.length} applications with the ${n} from the CSV?`)) return;
    this.#edit(() => applyAppsImport(this.draft, c.result!, c.replace));
    this.csv = undefined;
    toast(`Imported ${n} application${n === 1 ? '' : 's'} — review, then save`);
  };

  #csvPanel() {
    const c = this.csv!;
    const r = c.result;
    const envLabel = (id: string) => [...this.draft.environments, ...(r?.newEnvs ?? [])].find(e => e.id === id)?.label ?? id;
    const groupName = (id?: string) => [...this.draft.groups, ...(r?.newGroups ?? [])].find(g => g.id === id)?.name ?? '—';
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    return html`
      <div class="settings-section-head">
        <div>
          <h3 class="panel-heading">${icon(FileSpreadsheet)} Import applications</h3>
          <p class="settings-hint">Paste rows from a spreadsheet, or open a .csv file. Columns: <code>name</code> (required),
            <code>description</code>, <code>group</code>, <code>badge</code>, one per environment named by its label (like
            <code>${this.draft.environments[0]?.label ?? 'DEV'}</code>), and <code>link:Docs</code>-style columns for links.</p>
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
      <textarea class="input csv-input" rows="7" spellcheck="false" aria-label="CSV to import"
                placeholder=${`name,description,${this.draft.environments.map(e => e.label).join(',')}\nBilling,Invoices and payments,https://…`}
                .value=${c.text} @input=${(e: Event) => this.#parseCsv((e.target as HTMLTextAreaElement).value)}></textarea>
      <input class="csv-file" type="file" accept=".csv,.tsv,.txt,text/csv" hidden @change=${this.#openCsvFile}>

      ${c.error ? html`<p class="csv-note error">${icon(TriangleAlert)} Couldn't read that — ${c.error}.</p>` : nothing}
      ${r ? html`
        <div class="csv-preview">
          <p>
            <strong>${plural(r.apps.length, 'application')}</strong>
            · environments: ${r.envLabels.join(', ') || 'none'}
            ${r.newEnvs.length ? html`<span class="csv-new">(new: ${r.newEnvs.map(e => e.label).join(', ')})</span>` : nothing}
            ${r.linkLabels.length ? html` · links: ${r.linkLabels.join(', ')}` : nothing}
            ${r.newGroups.length ? html` · new groups: ${r.newGroups.map(g => g.name).join(', ')}` : nothing}
          </p>
          ${r.warnings.map(w => html`<p class="csv-note">${icon(TriangleAlert)} ${w}</p>`)}
          <table class="csv-table">
            <thead><tr><th>Name</th><th>Group</th><th>Environments</th><th>Links</th></tr></thead>
            <tbody>
              ${r.apps.slice(0, 6).map(a => html`
                <tr>
                  <td>${a.name}</td>
                  <td>${groupName(a.group)}</td>
                  <td>${a.envs.map(e => envLabel(e.env)).join(' · ') || '—'}</td>
                  <td>${a.links.length || '—'}</td>
                </tr>`)}
            </tbody>
          </table>
          ${r.apps.length > 6 ? html`<p class="field-hint">…and ${r.apps.length - 6} more.</p>` : nothing}
          <div class="segmented" role="radiogroup" aria-label="How to import">
            <label><input type="radio" name="csv-mode" .checked=${!c.replace} @change=${() => (this.csv = { ...c, replace: false })}>
              Add new, update matching names</label>
            <label><input type="radio" name="csv-mode" .checked=${c.replace} @change=${() => (this.csv = { ...c, replace: true })}>
              Replace all applications</label>
          </div>
        </div>` : nothing}

      <div class="section-actions end">
        <button class="btn btn-ghost" type="button" @click=${() => (this.csv = undefined)}>Cancel</button>
        <button class="btn btn-primary" type="button" ?disabled=${!r?.apps.length} @click=${this.#importCsv}>
          ${icon(ClipboardPaste)} Import ${r?.apps.length ? plural(r.apps.length, 'application') : ''}
        </button>
      </div>
    `;
  }

  // ---- environments ----

  #usage(envId: string) {
    return this.draft.apps.filter(a => a.envs.some(e => e.env === envId && e.url.trim())).length;
  }

  #applyPreset(environments: EnvDef[]) {
    const keep = new Set(environments.map(e => e.id));
    const lost = this.draft.environments.filter(e => !keep.has(e.id) && this.#usage(e.id));
    if (lost.length && !confirm(`This removes ${lost.map(e => e.label).join(', ')}, which some apps have addresses for. Continue?`)) return;
    this.#edit(() => {
      this.draft.environments = clone(environments);
      for (const app of this.draft.apps) app.envs = app.envs.filter(e => keep.has(e.env));
    });
  }

  #removeEnv(i: number) {
    const env = this.draft.environments[i];
    const used = this.#usage(env.id);
    if (used && !confirm(`${used} app${used === 1 ? ' has' : 's have'} an address for ${env.label}. Remove it anyway?`)) return;
    this.#edit(() => {
      this.draft.environments.splice(i, 1);
      for (const app of this.draft.apps) app.envs = app.envs.filter(e => e.env !== env.id);
    });
  }

  #addEnv = async () => {
    const used = new Set(this.draft.environments.map(e => e.color));
    const ids = new Set(this.draft.environments.map(e => e.id));
    let n = this.draft.environments.length + 1;
    while (ids.has(`env-${n}`)) n++;
    this.#edit(() => this.draft.environments.push({
      id: `env-${n}`, label: '', color: NEW_ENV_COLORS.find(c => !used.has(c)) ?? '#888888',
    }));
    await this.updateComplete;
    this.querySelector<HTMLInputElement>(`[data-field="envdef:${this.draft.environments.length - 1}:label"]`)?.focus();
  };

  #environmentsTab() {
    const envs = this.draft.environments;
    return html`
      <section class="settings-card ${this.draft.statusChecks ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Status checks</h3>
          ${this.#switch('On', this.draft.statusChecks, on => (this.draft.statusChecks = on))}
        </header>
        <p class="field-hint">Every couple of minutes, each environment's address is pinged to show a green or red dot.
          When the page is opened straight from a file, Chrome and Edge ask permission to reach your local network for
          this — turn it off to stop the checks and the prompt. Checks can also be turned off for a single app, or a single
          environment, under Applications.</p>
      </section>
      <p class="settings-hint">Environments are the columns on the page, in this order from left to right — every app gets a
        tile for each one it has an address for.</p>
      <div class="preset-row">
        <span class="field-label">Start from a preset</span>
        ${ENV_PRESETS.map(p => html`
          <button class="preset" type="button" @click=${() => this.#applyPreset(p.environments)}>
            ${p.environments.map(e => html`<span class="preset-dot" style="background:${e.color}"></span>`)}
            ${p.name}
          </button>`)}
      </div>
      <div class="editor-list" data-sort-list="envs">
        ${envs.map((env, i) => html`
          <div class="env-def-row" data-env data-sort-item style="--env:${env.color}">
            ${this.#handle(env.label || 'environment')}
            <label class="color-swatch" title="Color">
              <input type="color" .value=${env.color} aria-label="${env.label || 'Environment'} color"
                     @input=${(e: Event) => this.#edit(() => (env.color = (e.target as HTMLInputElement).value))}>
            </label>
            <input class="input env-label-input" aria-label="Label" placeholder="e.g. QA" maxlength="12" .value=${env.label}
                   data-field="envdef:${i}:label" @input=${(e: Event) => this.#edit(() => (env.label = this.#value(e).toUpperCase()))}>
            <label class="check" title="Hatched tiles, as a reminder to be careful (e.g. production)">
              <input type="checkbox" .checked=${!!env.caution}
                     @change=${(e: Event) => this.#edit(() => {
                       if ((e.target as HTMLInputElement).checked) env.caution = true; else delete env.caution;
                     })}>
              Handle with care
            </label>
            <span class="env-usage">${this.#usage(env.id)} app${this.#usage(env.id) === 1 ? '' : 's'}</span>
            <button class="icon-btn xs danger" type="button" title="Remove" aria-label="Remove ${env.label || 'environment'}"
                    @click=${() => this.#removeEnv(i)}>${icon(Trash)}</button>
          </div>`)}
      </div>
      <button class="btn btn-soft btn-sm" type="button" @click=${this.#addEnv}>${icon(Plus)} Add environment</button>
    `;
  }

  // ---- header links ----

  #linksTab() {
    const { links } = this.draft;
    const add = async () => {
      this.#edit(() => links.push({ label: '', url: '' }));
      await this.updateComplete;
      this.querySelector<HTMLInputElement>(`[data-field="link:${links.length - 1}:label"]`)?.focus();
    };
    return html`
      <div class="settings-section-head">
        <p class="settings-hint">Shown in the middle of the header bar.</p>
        <button class="btn btn-soft" type="button" @click=${add}>${icon(Plus)} Add link</button>
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

  #widgetsTab() {
    const { greeting, clock, weather } = this.draft.widgets;
    return html`
      <section class="settings-card ${greeting.enabled ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Greeting</h3>
          ${this.#switch('Show', greeting.enabled, on => (greeting.enabled = on))}
        </header>
        <div class="field-grid">
          ${this.#field('Headline', greeting.title, v => (greeting.title = v), { field: 'greeting:title' })}
          ${this.#field('Subline', greeting.subtitle, v => (greeting.subtitle = v), { field: 'greeting:subtitle' })}
        </div>
        ${this.#switch('Type it out when the page opens', greeting.typing, on => (greeting.typing = on))}
      </section>

      <section class="settings-card ${clock.enabled ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Clock</h3>
          ${this.#switch('Show', clock.enabled, on => (clock.enabled = on))}
        </header>
        <p class="field-hint">The first time zone is the big clock and sets the greeting; the rest are listed underneath.</p>
        <div class="editor-list" data-sort-list="zones">
          ${clock.zones.map((zone, i) => html`
            <div class="zone-row" data-sort-item>
              ${this.#handle(zone.label || 'time zone')}
              <input class="input" aria-label="Label" placeholder=${cityOf(zone.timeZone) || 'Label'} .value=${zone.label}
                     @input=${(e: Event) => this.#edit(() => (zone.label = this.#value(e)))}>
              <input class="input mono" aria-label="Time zone" list="tz-list" placeholder="America/Chicago" .value=${zone.timeZone}
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

      <section class="settings-card ${weather.enabled ? '' : 'off'}">
        <header class="settings-card-head">
          <h3>Weather</h3>
          ${this.#switch('Show', weather.enabled, on => (weather.enabled = on))}
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
    `;
  }

  // ---- branding ----

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

  #brandingTab() {
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
        ${this.#field('Page title', site.title, v => (site.title = v), { field: 'site:title', required: true, wide: true, hint: 'Shown in the header and the browser tab.' })}
        ${this.#field('Footer text', site.footer, v => (site.footer = v), { field: 'site:footer', wide: true })}
      </div>
    `;
  }

  // ---- my view (applies immediately) ----

  #viewMode() {
    const palette = currentPalette();
    const mode = themeMode();
    return html`
      <p class="settings-hint">Only for you — these choices are kept in this browser and never change the page for anyone else.</p>

      <section class="settings-group">
        <h3 class="field-label">Colors</h3>
        <div class="palette-options">
          ${PALETTES.map(p => html`
            <label class="palette-card">
              <input type="radio" name="palette" .checked=${p.id === palette}
                     @change=${() => { setPalette(p.id); this.requestUpdate(); }}>
              <span class="palette-preview" data-preview=${p.id}>
                ${p.swatches.map(c => html`<span class="swatch" style="background:${c}"></span>`)}
              </span>
              <span class="palette-name">${p.name}${p.id === palette ? html` <span class="palette-current">${icon(Check)}</span>` : nothing}</span>
              <span class="palette-desc">${p.description}</span>
            </label>`)}
        </div>
      </section>

      <section class="settings-group">
        <h3 class="field-label">Theme</h3>
        <div class="segmented" role="radiogroup" aria-label="Theme">
          ${THEMES.map(t => html`
            <label>
              <input type="radio" name="theme-mode" .checked=${t.id === mode}
                     @change=${() => { setThemeMode(t.id); this.requestUpdate(); }}>
              ${icon(t.glyph)}${t.label}
            </label>`)}
        </div>
      </section>

      <section class="settings-group">
        <h3 class="field-label">Applications on my page</h3>
        ${config.apps.length ? html`
          <div class="toggle-list">
            ${config.apps.map((app, i) => html`
              <label class="toggle-row">
                <span class="app-editor-mark" style="--hue:${hueOf(i)}">${app.badge || initials(app.name)}</span>
                <span class="toggle-name">${app.name}</span>
                <input class="switch" type="checkbox" .checked=${!prefs.isHidden(app.id)} aria-label="Show ${app.name}"
                       @change=${(e: Event) => transition(() => prefs.setHidden(app.id, !(e.target as HTMLInputElement).checked))}>
              </label>`)}
          </div>` : html`<p class="field-hint">No applications yet.</p>`}
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

  render() {
    const editing = this.mode === 'edit';
    const tabs: Record<EditTab, () => unknown> = {
      apps: () => this.#appsTab(),
      environments: () => this.#environmentsTab(),
      links: () => this.#linksTab(),
      widgets: () => this.#widgetsTab(),
      branding: () => this.#brandingTab(),
    };

    return html`
      <dialog class="settings" aria-labelledby="settings-title"
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
              <p class="file-target">${this.#fileTarget()}</p>
              <div class="settings-foot-group">
                <button class="btn btn-ghost btn-sm" type="button" title="Load a launchpad.config.js or .json"
                        @click=${() => this.querySelector<HTMLInputElement>('.settings-file')?.click()}>
                  ${icon(FolderOpen)} Open file
                </button>
                <button class="btn btn-ghost btn-sm" type="button" title="Download these settings as launchpad.config.js"
                        @click=${() => download(toFileText(this.draft))}>
                  ${icon(Download)} Download
                </button>
                ${config.customized ? html`
                  <button class="btn btn-ghost btn-sm" type="button" title="Forget changes saved in this browser" @click=${this.#discard}>
                    ${icon(RotateCcw)} Use file
                  </button>` : nothing}
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
