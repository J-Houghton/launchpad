// src/config.ts
// The page's content: branding, environments, apps, links and widgets.
//
// It's read at runtime from launchpad.config.js (next to index.html), a plain script
// that sets window.LAUNCHPAD_CONFIG — so you can edit it, or drop in someone else's,
// without rebuilding. Edits made in the page's settings apply straight away and are
// kept in this browser until they're saved back to that file.

declare global {
  interface Window { LAUNCHPAD_CONFIG?: unknown }
}

export const LINK_ICONS = ['auto', 'book', 'link', 'git', 'chart', 'ticket', 'terminal', 'database', 'shield', 'chat'] as const;
export type LinkIcon = (typeof LINK_ICONS)[number];

/** A stage that apps are deployed to — the columns on the page. */
export type EnvDef = { id: string; label: string; color: string; caution?: boolean };
/** A named section of apps on the page. */
export type GroupDef = { id: string; name: string };
export type LinkItem = { label: string; url: string; icon?: LinkIcon };
export type AppEnv = { env: string; url: string; name?: string; host?: string; health?: string | false };
export type AppConfig = {
  id: string;
  name: string;
  description?: string;
  /** Short text for the badge. Defaults to the name's initials. */
  badge?: string;
  /** The id of the group it's shown under; none means "Other". */
  group?: string;
  /** `false` turns off status checks for all of this app's environments. */
  health?: false;
  links: LinkItem[];
  envs: AppEnv[];
};
export type ClockZone = { label: string; timeZone: string };
export type SiteConfig = {
  title: string;
  /** Header logo (and favicon): a path like "./logo.svg", or an uploaded SVG data URI. Default: the orb. */
  logo?: string;
  footer: string;
};
export type Widgets = {
  greeting: { enabled: boolean; title: string; subtitle: string; typing: boolean };
  /** The first zone is the big clock (and sets the greeting); the rest are listed under it. */
  clock: { enabled: boolean; zones: ClockZone[] };
  weather: { enabled: boolean; place: string; latitude: number; longitude: number; units: 'fahrenheit' | 'celsius' };
};
export type LaunchpadConfig = {
  version: 3;
  site: SiteConfig;
  /**
   * Ping each environment to show a reachability dot. Opened from disk, Chrome/Edge ask
   * permission to reach machines on your local network — turning this off avoids that.
   */
  statusChecks: boolean;
  environments: EnvDef[];
  groups: GroupDef[];
  links: LinkItem[];
  apps: AppConfig[];
  widgets: Widgets;
};

/** What components render: an app's environment with everything filled in. */
export type Env = { id: string; label: string; color: string; caution: boolean; name: string; url: string; host: string; health?: string | false };
export type App = Omit<AppConfig, 'envs'> & { envs: Env[] };
export type EnvRef = { key: string; app: App; env: Env };

export const envKey = (app: { id: string }, env: { id: string }) => `${app.id}:${env.id}`;

export const isHttpUrl = (s: string | undefined) => {
  try { return !!s && /^https?:$/.test(new URL(s).protocol); } catch { return false; }
};

export const hostOf = (url: string) => {
  try { return new URL(url).host; } catch { return url; }
};

export const validTimeZone = (tz: string) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

export const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "America/New_York" → "New York" */
export const cityOf = (timeZone: string) => (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');

/** The time zone the page lives in: the main clock's. */
export const primaryTimeZone = (c: { widgets: Widgets }) => c.widgets.clock.zones[0]?.timeZone ?? LOCAL_TIME_ZONE;

// ---- environment presets ----

const DEV: EnvDef = { id: 'dev', label: 'DEV', color: '#0b95da' };
const TEST: EnvDef = { id: 'test', label: 'TEST', color: '#da950b' };
const PROD: EnvDef = { id: 'prod', label: 'PROD', color: '#e61a5e', caution: true };

export const ENV_PRESETS: { name: string; environments: EnvDef[] }[] = [
  { name: 'Dev · Test · Prod', environments: [DEV, TEST, PROD] },
  { name: 'Dev · QA · UAT · Prod', environments: [DEV, { id: 'qa', label: 'QA', color: '#8b5cf6' }, { id: 'uat', label: 'UAT', color: '#da950b' }, PROD] },
  { name: 'Dev · Staging · Prod', environments: [DEV, { id: 'staging', label: 'STAGING', color: '#da950b' }, PROD] },
  { name: 'Dev · Test · Staging · Prod', environments: [DEV, TEST, { id: 'staging', label: 'STAGING', color: '#8b5cf6' }, PROD] },
];

/** The fixed columns of the first config format, kept so old files still load. */
const V1_ENVIRONMENTS: EnvDef[] = [DEV, TEST, { id: 'b2p', label: 'B2P', color: '#999999' }, PROD];

/** Used when launchpad.config.js is missing — a blank page that points you at settings. */
export const STARTER: LaunchpadConfig = {
  version: 3,
  site: { title: 'Launchpad', footer: '' },
  statusChecks: true,
  environments: ENV_PRESETS[0].environments,
  groups: [],
  links: [],
  apps: [],
  widgets: {
    greeting: { enabled: true, title: 'Ready for liftoff', subtitle: 'Let\'s set up your page', typing: true },
    clock: { enabled: true, zones: [{ label: 'Local time', timeZone: LOCAL_TIME_ZONE }] },
    weather: { enabled: false, place: '', latitude: 0, longitude: 0, units: 'fahrenheit' },
  },
};

// ---- normalising untrusted input (the config file, localStorage, imports) ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

// shown with <img>, so an SVG's scripts never run; this just keeps out non-image schemes
const isImageRef = (s: string) => /^(data:image\/|https?:\/\/|\/|\.\.?\/|[\w-]+\.(svg|png|jpe?g|webp|gif)$)/i.test(s);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'env';

/** The first config format (fixed dev/test/b2p/prod, title/subtitle, docs.internal/external). */
const isV1 = (o: Obj) =>
  !o.version && (isObj(obj(o.site).hero) || arr(o.apps).some(a => 'title' in a && !('name' in a)));

function migrateV1(o: Obj): Obj {
  const site = obj(o.site);
  const hero = obj(site.hero), clock = obj(site.clock), weather = obj(site.weather);
  return {
    version: 2,
    site: { title: site.title, logo: site.logo, footer: site.footer },
    environments: V1_ENVIRONMENTS,
    links: arr(o.links).map(l => ({ label: l.label, url: l.href })),
    apps: arr(o.apps).map(a => {
      const docs = obj(a.docs);
      return {
        id: a.id, name: a.title, description: a.subtitle, badge: a.badge,
        links: [
          ...(docs.internal ? [{ label: 'Internal docs', url: docs.internal, icon: 'book' }] : []),
          ...(docs.external ? [{ label: 'External docs', url: docs.external, icon: 'link' }] : []),
        ],
        envs: arr(a.envs).map(e => ({ env: e.type, name: e.name, url: e.href, host: e.host, health: e.health })),
      };
    }),
    widgets: {
      greeting: { enabled: true, title: hero.title, subtitle: hero.subtitle, typing: true },
      clock: { enabled: true, label: clock.label, timeZone: clock.timeZone },
      weather: { enabled: typeof weather.latitude === 'number', ...weather, units: 'fahrenheit' },
    },
  };
}

function normalizeLink(l: Obj): LinkItem {
  const link: LinkItem = { label: str(l.label), url: str(l.url) };
  const icon = str(l.icon) as LinkIcon;
  if (icon && icon !== 'auto' && LINK_ICONS.includes(icon)) link.icon = icon;
  return link;
}

// keys are added in the order they should appear in the written config file
export function normalize(input: unknown): LaunchpadConfig {
  let o = obj(input);
  if (isV1(o)) o = migrateV1(o);

  const s = obj(o.site);
  const logo = str(s.logo);
  const site: SiteConfig = {
    title: str(s.title, STARTER.site.title),
    ...(isImageRef(logo) ? { logo } : {}),
    footer: str(s.footer),
  };

  const envIds = new Set<string>();
  const environments = (Array.isArray(o.environments) ? arr(o.environments) : STARTER.environments).map((e): EnvDef => {
    const label = str(e.label) || str(e.id) || 'ENV';
    let id = str(e.id) || slug(label);
    while (envIds.has(id)) id += '-2';
    envIds.add(id);
    const env: EnvDef = { id, label, color: str(e.color) || '#888888' };
    if (e.caution === true) env.caution = true;
    return env;
  });

  const groupIds = new Set<string>();
  const groups = arr(o.groups).map((g): GroupDef => {
    const name = str(g.name) || 'Group';
    let id = str(g.id) || slug(name);
    while (groupIds.has(id)) id += '-2';
    groupIds.add(id);
    return { id, name };
  });

  const appIds = new Set<string>();
  const apps = arr(o.apps).map((a, i): AppConfig => {
    let id = str(a.id) || `app-${i + 1}`;
    while (appIds.has(id)) id += '-2';
    appIds.add(id);

    const app = { id, name: str(a.name) } as AppConfig;
    if (str(a.description)) app.description = str(a.description);
    if (str(a.badge)) app.badge = str(a.badge);
    if (groupIds.has(str(a.group))) app.group = str(a.group);
    if (a.health === false) app.health = false;
    app.links = arr(a.links).map(normalizeLink).filter(l => l.url);

    const seen = new Set<string>();
    app.envs = arr(a.envs).flatMap((e): AppEnv[] => {
      const env = str(e.env), url = str(e.url).trim();
      if (!envIds.has(env) || seen.has(env) || !url) return [];
      seen.add(env);
      const out: AppEnv = { env, url };
      if (str(e.name)) out.name = str(e.name);
      if (str(e.host)) out.host = str(e.host);
      if (e.health === false || (typeof e.health === 'string' && e.health)) out.health = e.health;
      return [out];
    });
    return app;
  });

  const w = obj(o.widgets), g = obj(w.greeting), c = obj(w.clock), wx = obj(w.weather);
  const d = STARTER.widgets;
  // version 2 had a single clock: { label, timeZone }
  // "local" means whoever is looking at the page — handy in a config shared between people
  const zones = (Array.isArray(c.zones) ? arr(c.zones) : [c])
    .map(z => ({ label: str(z.label), timeZone: str(z.timeZone) === 'local' ? LOCAL_TIME_ZONE : str(z.timeZone) }))
    .filter(z => validTimeZone(z.timeZone) && z.timeZone)
    .map(z => ({ label: z.label || cityOf(z.timeZone), timeZone: z.timeZone }));
  const widgets: Widgets = {
    greeting: { enabled: bool(g.enabled, true), title: str(g.title, d.greeting.title), subtitle: str(g.subtitle), typing: bool(g.typing, true) },
    clock: { enabled: bool(c.enabled, true), zones: zones.length ? zones : d.clock.zones },
    weather: {
      enabled: bool(wx.enabled, false),
      place: str(wx.place),
      latitude: num(wx.latitude, 0),
      longitude: num(wx.longitude, 0),
      units: wx.units === 'celsius' ? 'celsius' : 'fahrenheit',
    },
  };

  return {
    version: 3, site, statusChecks: bool(o.statusChecks, true), environments, groups,
    links: arr(o.links).map(normalizeLink).filter(l => l.url), apps, widgets,
  };
}

// ---- the store ----

const STORAGE_KEY = 'launchpad:config';

// tiny string hash, used to notice when the config file changes under a browser copy
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
};

const same = (a: LaunchpadConfig, b: LaunchpadConfig) => JSON.stringify(a) === JSON.stringify(b);

type Saved = { base: string; savedAt: number; data: unknown };

const FILE_LOADED = window.LAUNCHPAD_CONFIG !== undefined;
const FILE_CONFIG = FILE_LOADED ? normalize(window.LAUNCHPAD_CONFIG) : STARTER;

class ConfigStore extends EventTarget {
  /** Whether launchpad.config.js loaded (it's missing, or has a syntax error, otherwise). */
  readonly fileLoaded = FILE_LOADED;
  #file: LaunchpadConfig = FILE_CONFIG;
  #fileHash = hash(JSON.stringify(FILE_CONFIG));
  #raw: LaunchpadConfig = FILE_CONFIG;
  #apps: App[] = [];
  #envs = new Map<string, EnvRef>();
  #saved?: Saved;

  constructor() {
    super();
    this.#saved = this.#readSaved();
    // e.g. after a downloaded launchpad.config.js replaced the old one: the browser copy is redundant
    if (this.#saved && same(normalize(this.#saved.data), this.#file)) {
      this.#saved = undefined;
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
    }
    this.#apply(this.#saved ? normalize(this.#saved.data) : this.#file);
    addEventListener('storage', e => {
      if (e.key !== STORAGE_KEY) return;
      this.#saved = this.#readSaved();
      this.#apply(this.#saved ? normalize(this.#saved.data) : this.#file);
    });
  }

  /** The config in effect — what the settings panel edits. */
  get raw() { return this.#raw; }
  /** What launchpad.config.js contains. */
  get file() { return this.#file; }
  get site() { return this.#raw.site; }
  get environments() { return this.#raw.environments; }
  get groups() { return this.#raw.groups; }
  get statusChecks() { return this.#raw.statusChecks; }
  get links() { return this.#raw.links; }
  get widgets() { return this.#raw.widgets; }
  get apps() { return this.#apps; }
  /** Every app environment, keyed by `appId:envId`. */
  get envs() { return this.#envs; }

  /** True when this browser has changes that aren't in launchpad.config.js. */
  get customized() { return !!this.#saved; }
  get savedAt() { return this.#saved?.savedAt; }
  /** True when launchpad.config.js changed after this browser's copy was made. */
  get fileChanged() { return !!this.#saved && this.#saved.base !== this.#fileHash; }

  /** Apply changes and keep them in this browser. */
  save(next: LaunchpadConfig) {
    const data = normalize(next);
    if (same(data, this.#file)) return this.discard();
    this.#saved = { base: this.#fileHash, savedAt: Date.now(), data };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#saved)); } catch { /* storage blocked */ }
    this.#apply(data);
  }

  /** Drop this browser's changes and go back to launchpad.config.js. */
  discard() {
    this.#saved = undefined;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
    this.#apply(this.#file);
  }

  /** launchpad.config.js now holds `data`, so the browser copy is no longer needed. */
  fileWritten(data: LaunchpadConfig) {
    this.#file = normalize(data);
    this.#fileHash = hash(JSON.stringify(this.#file));
    this.discard();
  }

  #readSaved(): Saved | undefined {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      return isObj(saved) && 'data' in saved
        ? { base: str(saved.base), savedAt: num(saved.savedAt, 0), data: saved.data }
        : undefined;
    } catch {
      return undefined;
    }
  }

  #apply(raw: LaunchpadConfig) {
    this.#raw = raw;
    const defs = new Map(raw.environments.map(e => [e.id, e]));
    this.#apps = raw.apps.map(app => ({
      ...app,
      // in the order the environments are defined, so columns line up
      envs: raw.environments.flatMap(def => {
        const e = app.envs.find(x => x.env === def.id);
        if (!e) return [];
        const d = defs.get(def.id)!;
        return [{
          id: d.id, label: d.label, color: d.color, caution: !!d.caution,
          name: e.name ?? '', url: e.url, host: e.host || hostOf(e.url),
          // checks can be off for the whole page, the app, or just this environment
          health: !raw.statusChecks || app.health === false ? false : e.health,
        }];
      }),
    }));
    this.#envs = new Map(this.#apps.flatMap(app => app.envs.map(env => {
      const key = envKey(app, env);
      return [key, { key, app, env }] as const;
    })));

    document.title = raw.site.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) {
      favicon.href = raw.site.logo || './favicon.svg';
      if (raw.site.logo) favicon.removeAttribute('type');
      else favicon.type = 'image/svg+xml';
    }
    this.dispatchEvent(new Event('change'));
  }
}

export const config = new ConfigStore();
