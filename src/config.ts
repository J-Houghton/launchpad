// src/config.ts
// The page's content: branding, cards and their tiles, links and widgets.
//
// The page is a list of **cards** (rows), optionally sorted under **groups** (headed sections).
// Each card holds **tiles** — the big clickable links. Two ways to use it:
//   • a personal home page: each card a category, holding as many tiles (projects, bookmarks) as you like;
//   • a launch page: `useColumns` on, each card an app with one tile per **column** (DEV · TEST · PROD…),
//     lined up from card to card.
//
// It's read at runtime from launchpad.config.js (next to index.html), a plain script that sets
// window.LAUNCHPAD_CONFIG — so you can edit it, or drop in someone else's, without rebuilding.
// Edits made in the page's settings apply straight away and are kept in this browser until
// they're saved back to that file.

declare global {
  interface Window { LAUNCHPAD_CONFIG?: unknown }
}

export const LINK_ICONS = ['auto', 'book', 'link', 'git', 'chart', 'ticket', 'terminal', 'database', 'shield', 'chat'] as const;
export type LinkIcon = (typeof LINK_ICONS)[number];

/** A fixed, colour-coded column that tiles line up in — e.g. DEV / TEST / PROD. */
export type ColumnDef = { id: string; label: string; color: string; caution?: boolean };
/** A named section of cards, with its own heading on the page. */
export type GroupDef = { id: string; name: string };
/** A small button under a card's name — docs, a repo, a dashboard. */
export type LinkItem = { label: string; url: string; icon?: LinkIcon };
/**
 * A big clickable tile on a card. With a `column` it sits in that column (when the page uses
 * columns); without one it's a tile of its own, with an optional `label` and `color`.
 */
export type TileConfig = {
  column?: string;
  /** Tiles of their own: a stable id (kept for pins). Made from the name when left out. */
  id?: string;
  name?: string;
  url: string;
  /** Tiles of their own: the short tag across the top, e.g. "WEB". */
  label?: string;
  /** Tiles of their own: its colour. Defaults to the card's. */
  color?: string;
  /** Shown under the name. Defaults to the URL's host. */
  host?: string;
  /** URL pinged for the status dot. Defaults to `url`; `false` turns the check off. */
  health?: string | false;
};
/**
 * Where something sits on the page's 12-column grid — the model Oracle APEX and Bootstrap use.
 * Each item starts a new row unless told otherwise, and an item without a span shares what's
 * left of its row equally with the others. Narrower screens stack things (see lib/layout.ts).
 */
export type Placement = {
  /** Columns it spans, 1–12. Left out: an equal share of what's left in its row. */
  span?: number;
  /** `false` puts it in the same row as the one before, when there's room. */
  newRow?: boolean;
};
/** A row on the page: a category of projects, or an app with a tile per column. */
export type CardConfig = Placement & {
  id: string;
  name: string;
  description?: string;
  /** Short text for the badge. Defaults to the name's initials. */
  badge?: string;
  /** The id of the group it's shown under; none means "Other". */
  group?: string;
  /** `false` turns off status checks for all of this card's tiles. */
  health?: false;
  links: LinkItem[];
  tiles: TileConfig[];
};
export type ClockZone = { label: string; timeZone: string };
export type SiteConfig = {
  title: string;
  /** Header logo (and favicon): a path like "./logo.svg", or an uploaded SVG data URI. Default: the orb. */
  logo?: string;
  /** The heading above the cards, e.g. "Projects" or "Applications". Empty hides it. */
  heading: string;
  footer: string;
};
/** Another site, shown in a frame on the page — a status page, a dashboard panel, a calendar. */
export type EmbedWidget = { id: string; type: 'embed'; title: string; url: string; height: number };
/**
 * JSON fetched from an address every few minutes, shown through a template (lib/template.ts).
 * `refresh` is in minutes; 0 fetches once, when the page opens.
 */
export type DataWidget = { id: string; type: 'data'; title: string; url: string; template: string; refresh: number };
/** A widget from an extension file (lib/extensions.ts): `extension` is the type it registered, `options` its settings. */
export type ExtensionWidget = { id: string; type: 'extension'; extension: string; title: string; options: Record<string, string | number | boolean> };
/** A widget added to the page. Each is a section of its own, placed by the layout like the built-in ones. */
export type AddedWidget = EmbedWidget | DataWidget | ExtensionWidget;
export const WIDGET_TYPES = ['embed', 'data', 'extension'] as const;

/** Names extensions give their widgets and backgrounds: lowercase letters, digits and dashes. */
export const isName = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(v);
/** The key of one of an extension widget's settings, as a script would name it: newTab, max-items. */
export const isKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][\w-]{0,40}$/.test(v);
/**
 * An extension's file: a relative path to a .js file beside index.html (or in a folder under it), never an
 * address — so a config can only ever run code that's already sitting next to the page.
 */
export const isExtensionPath = (v: unknown): v is string =>
  typeof v === 'string' && /^(\.\/)?[\w-][\w.-]*(\/[\w-][\w.-]*)*\.js$/.test(v) && !v.split('/').includes('..');

/** Each widget's settings. Whether it shows, and where, is up to the layout. */
export type Widgets = {
  greeting: { title: string; subtitle: string; typing: boolean };
  /** The first zone is the big clock (and sets the greeting); the rest are listed under it. */
  clock: { zones: ClockZone[] };
  weather: { place: string; latitude: number; longitude: number; units: 'fahrenheit' | 'celsius' };
  added: AddedWidget[];
};

/** The page's built-in sections; added widgets are sections too, known by their own ids. */
export const SECTION_IDS = ['greeting', 'clock', 'weather', 'pinned', 'recent', 'cards'] as const;
export type BuiltInSection = (typeof SECTION_IDS)[number];
/** A built-in section, or an added widget's id. */
export type SectionId = string;
export const SECTION_NAMES: Record<BuiltInSection, string> = {
  greeting: 'Greeting', clock: 'Clock', weather: 'Weather', pinned: 'Pinned', recent: 'Recent', cards: 'Cards',
};
export type SectionConfig = Placement & { id: SectionId; hidden?: boolean };

/** What a section is called: a built-in one's name, or an added widget's title (or its address's host). */
export function sectionName(c: { widgets: Widgets }, id: SectionId) {
  const added = c.widgets.added.find(w => w.id === id);
  if (!added) return SECTION_NAMES[id as BuiltInSection] ?? id;
  if (added.type === 'extension') return added.title || added.extension.replace(/^./, ch => ch.toUpperCase()).replace(/-/g, ' ');
  return added.title || hostOf(added.url) || 'Widget';
}
export type Density = 'comfortable' | 'compact';
export type Layout = {
  /** Compact: shorter tiles and tighter spacing, for pages with a lot on them. */
  density: Density;
  /** Every section once, in page order. */
  sections: SectionConfig[];
};

/** The page's style: colours, but also shapes, type and texture (styles/tokens.css, styles/looks.css). Aurora is the default. */
export const STYLES = ['aurora', 'classic', 'blueprint', 'paper', 'neon', 'bold'] as const;
export type Style = (typeof STYLES)[number];
/** What's behind the page: the style's backdrop with drifting particles, the backdrop alone, or a plain colour. */
export const BACKGROUNDS = ['particles', 'still', 'plain'] as const;
/** A built-in background, or one an extension adds (lib/extensions.ts). */
export type Background = (typeof BACKGROUNDS)[number] | (string & {});
export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
/**
 * How the page looks for everyone. Anyone can pick their own theme, style and background in Settings → My view
 * (see lib/look.ts). `css` is the page's custom CSS (lib/custom-css.ts): in the file, a list of lines.
 */
export type Look = { theme: ThemeMode; style: Style; background: Background; css: string };

/** Greeting beside the clock and weather; pinned beside recent; then the cards. */
const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: 'greeting' }, { id: 'clock', newRow: false, span: 3 }, { id: 'weather', newRow: false, span: 3 },
  { id: 'pinned' }, { id: 'recent', newRow: false, span: 5 },
  { id: 'cards' },
];
export type LaunchpadConfig = {
  version: 4;
  site: SiteConfig;
  /**
   * Ping each tile's address to show a reachability dot. Opened from disk, Chrome/Edge ask
   * permission to reach machines on your local network — turning this off avoids that.
   */
  statusChecks: boolean;
  /**
   * Line tiles up in `columns`, one per column on every card. When it's off the columns are kept,
   * and a tile that belongs to one just shows as an ordinary tile wearing the column's label.
   */
  useColumns: boolean;
  columns: ColumnDef[];
  groups: GroupDef[];
  links: LinkItem[];
  cards: CardConfig[];
  widgets: Widgets;
  layout: Layout;
  look: Look;
  /** Extension files to load, beside index.html (see lib/extensions.ts). */
  extensions: string[];
};

/** What components render: a tile with everything filled in. `column` is set when it sits in a column. */
export type Tile = {
  id: string; column?: string; label: string; color: string; caution: boolean;
  name: string; url: string; host: string; health?: string | false;
  /** Its colour is its column's or its own, rather than following its card. */
  fixedColor: boolean;
};
export type Card = Omit<CardConfig, 'tiles'> & { tiles: Tile[] };
export type TileRef = { key: string; card: Card; tile: Tile };

export const tileKey = (card: { id: string }, tile: { id: string }) => `${card.id}:${tile.id}`;

/**
 * Each card's colour, from its place on the page — used for its badge and its free tiles. These are CSS
 * expressions: the style sets where the hues start and how strong they are (--card-hue, --card-chroma).
 */
export const cardHue = (index: number) => `calc(var(--card-hue) + ${(index * 35) % 360})`;
export const cardColor = (index: number) => `oklch(0.6 var(--card-chroma) ${cardHue(index)})`;

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

export const slug = (s: string, fallback = 'item') =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;

// ---- column presets ----

const DEV: ColumnDef = { id: 'dev', label: 'DEV', color: '#0b95da' };
const TEST: ColumnDef = { id: 'test', label: 'TEST', color: '#da950b' };
const PROD: ColumnDef = { id: 'prod', label: 'PROD', color: '#e61a5e', caution: true };

export const COLUMN_PRESETS: { name: string; columns: ColumnDef[] }[] = [
  { name: 'Dev · Test · Prod', columns: [DEV, TEST, PROD] },
  { name: 'Dev · QA · UAT · Prod', columns: [DEV, { id: 'qa', label: 'QA', color: '#8b5cf6' }, { id: 'uat', label: 'UAT', color: '#da950b' }, PROD] },
  { name: 'Dev · Staging · Prod', columns: [DEV, { id: 'staging', label: 'STAGING', color: '#da950b' }, PROD] },
  { name: 'Dev · Test · Staging · Prod', columns: [DEV, TEST, { id: 'staging', label: 'STAGING', color: '#8b5cf6' }, PROD] },
];

/** Colours handed to new columns, in turn. */
export const NEW_COLUMN_COLORS = ['#10b981', '#8b5cf6', '#f97316', '#64748b', '#0ea5e9', '#d946ef'];

/** The fixed columns of the first config format, kept so old files still load. */
const V1_COLUMNS: ColumnDef[] = [DEV, TEST, { id: 'b2p', label: 'B2P', color: '#999999' }, PROD];

/** Used when launchpad.config.js is missing — a blank page that points you at the setup guide. */
export const STARTER: LaunchpadConfig = {
  version: 4,
  site: { title: 'Launchpad', heading: 'Projects', footer: '' },
  statusChecks: true,
  useColumns: false,
  columns: [],
  groups: [],
  links: [],
  cards: [],
  widgets: {
    greeting: { title: 'Ready for liftoff', subtitle: 'Let\'s set up your page', typing: true },
    clock: { zones: [{ label: 'Local time', timeZone: LOCAL_TIME_ZONE }] },
    weather: { place: '', latitude: 0, longitude: 0, units: 'fahrenheit' },
    added: [],
  },
  // no place for the weather yet
  layout: { density: 'comfortable', sections: DEFAULT_SECTIONS.map(s => (s.id === 'weather' ? { ...s, hidden: true } : s)) },
  look: { theme: 'system', style: 'aurora', background: 'particles', css: '' },
  extensions: [],
};

// ---- normalising untrusted input (the config file, localStorage, imports) ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);
/** One of `options`, or the first of them. */
export const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback = options[0]): T =>
  (options.includes(v as T) ? (v as T) : fallback);

// shown with <img>, so an SVG's scripts never run; this just keeps out non-image schemes
const isImageRef = (s: string) => /^(data:image\/|https?:\/\/|\/|\.\.?\/|[\w-]+\.(svg|png|jpe?g|webp|gif)$)/i.test(s);

/** The first config format (fixed dev/test/b2p/prod, title/subtitle, docs.internal/external). */
const isV1 = (o: Obj) =>
  !o.version && (isObj(obj(o.site).hero) || arr(o.apps).some(a => 'title' in a && !('name' in a)));

function migrateV1(o: Obj): Obj {
  const site = obj(o.site);
  const hero = obj(site.hero), clock = obj(site.clock), weather = obj(site.weather);
  return {
    version: 2,
    site: { title: site.title, logo: site.logo, footer: site.footer },
    columns: V1_COLUMNS,
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

function normalizePlacement<T extends Placement>(p: Obj, into: T): T {
  if (Number.isInteger(p.span) && (p.span as number) >= 1 && (p.span as number) <= 12) into.span = p.span as number;
  if (p.newRow === false) into.newRow = false;
  return into;
}

/**
 * Every section once, in the given order; built-in ones left out are added in their usual places' order,
 * and added widgets left out go just before the cards.
 */
function normalizeLayout(o: Obj, added: AddedWidget[]): Layout {
  const l = obj(o.layout);
  const w = obj(o.widgets);
  const given = Array.isArray(l.sections);
  const known = new Set<string>([...SECTION_IDS, ...added.map(a => a.id)]);
  const seen = new Set<SectionId>();
  const sections = arr(l.sections).flatMap((s): SectionConfig[] => {
    const id = str(s.id);
    if (!known.has(id) || seen.has(id)) return [];
    seen.add(id);
    const section = normalizePlacement(s, { id } as SectionConfig);
    if (s.hidden === true && id !== 'cards') section.hidden = true;
    return [section];
  });
  for (const fallback of DEFAULT_SECTIONS) {
    if (seen.has(fallback.id)) continue;
    const section: SectionConfig = { ...fallback };
    // older configs switched widgets on and off in "widgets"; the weather needs a place either way
    const enabled = obj(w[fallback.id]).enabled;
    const noPlace = fallback.id === 'weather' && enabled !== true && !str(obj(w.weather).place);
    if (!given && (enabled === false || noPlace)) section.hidden = true;
    sections.push(section);
  }
  for (const widget of added) {
    if (seen.has(widget.id)) continue;
    sections.splice(sections.findIndex(s => s.id === 'cards'), 0, { id: widget.id });
  }
  return { density: l.density === 'compact' ? 'compact' : 'comfortable', sections };
}

/** A data widget's template is cut off past this many characters. */
export const MAX_TEMPLATE = 20_000;
/** Kept as a list of lines in the file, so it reads well there; a single string works too. */
const lines = (v: unknown) => (Array.isArray(v) ? v.filter(line => typeof line === 'string').join('\n') : str(v));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** An extension widget's settings: plain values only. */
function normalizeOptions(v: unknown) {
  return Object.fromEntries(Object.entries(obj(v)).flatMap(([k, x]): [string, string | number | boolean][] => {
    if (!isKey(k)) return [];
    if (typeof x === 'string') return [[k, x.slice(0, 5000)]];
    return typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) ? [[k, x]] : [];
  }));
}

function normalizeAdded(list: unknown): AddedWidget[] {
  const taken = new Set<string>(SECTION_IDS);
  return arr(list).flatMap((w): AddedWidget[] => {
    const type = str(w.type) as AddedWidget['type'];
    const url = str(w.url).trim();
    const extension = str(w.extension);
    if (!WIDGET_TYPES.includes(type) || (type === 'extension' ? !isName(extension) : !isHttpUrl(url))) return [];
    let id = str(w.id) || slug(str(w.title) || (type === 'extension' ? extension : hostOf(url)), type);
    while (taken.has(id)) id += '-2';
    taken.add(id);
    const title = str(w.title);
    if (type === 'extension') return [{ id, type, extension, title, options: normalizeOptions(w.options) }];
    if (type === 'embed') return [{ id, type, title, url, height: clamp(Math.round(num(w.height, 320)), 120, 1600) }];
    return [{ id, type, title, url, template: lines(w.template).slice(0, MAX_TEMPLATE), refresh: clamp(Math.round(num(w.refresh, 5)), 0, 1440) }];
  });
}

/** Custom CSS is cut off past this many characters. */
export const MAX_CSS = 50_000;

function normalizeLook(o: Obj): Look {
  const l = obj(o.look);
  const css = lines(l.css);
  return {
    theme: oneOf(l.theme, THEME_MODES), style: oneOf(l.style, STYLES), background: isName(l.background) ? l.background : 'particles',
    css: css.trim() ? css.slice(0, MAX_CSS) : '',
  };
}

function normalizeLink(l: Obj): LinkItem {
  const link: LinkItem = { label: str(l.label), url: str(l.url) };
  const icon = str(l.icon) as LinkIcon;
  if (icon && icon !== 'auto' && LINK_ICONS.includes(icon)) link.icon = icon;
  return link;
}

function normalizeTile(t: Obj, columnIds: Set<string>, taken: Set<string>): TileConfig | undefined {
  const url = str(t.url).trim();
  if (!url) return undefined;
  const column = str(t.column) || str(t.env); // versions 1–3 said "env"
  let tile: TileConfig;
  if (column) {
    // one tile per column; tiles for columns that no longer exist are dropped
    if (!columnIds.has(column) || taken.has(column)) return undefined;
    taken.add(column);
    tile = { column, url };
    if (str(t.name)) tile.name = str(t.name);
  } else {
    let id = str(t.id) || slug(str(t.name) || str(t.label) || hostOf(url), 'tile');
    while (taken.has(id) || columnIds.has(id)) id += '-2';
    taken.add(id);
    tile = { id, name: str(t.name), url };
    if (str(t.label)) tile.label = str(t.label);
    if (str(t.color)) tile.color = str(t.color);
  }
  if (str(t.host)) tile.host = str(t.host);
  if (t.health === false || (typeof t.health === 'string' && t.health)) tile.health = t.health;
  return tile;
}

// keys are added in the order they should appear in the written config file
export function normalize(input: unknown): LaunchpadConfig {
  let o = obj(input);
  if (isV1(o)) o = migrateV1(o);
  // versions 1–3 called cards "apps" and their tiles "envs"
  const legacy = !Array.isArray(o.cards) && Array.isArray(o.apps);

  const s = obj(o.site);
  const logo = str(s.logo);
  const site: SiteConfig = {
    title: str(s.title, STARTER.site.title),
    ...(isImageRef(logo) ? { logo } : {}),
    heading: str(s.heading, legacy ? 'Applications' : STARTER.site.heading),
    footer: str(s.footer),
  };

  // versions 1–3 called the columns "environments", and always used them
  const columnIds = new Set<string>();
  const columns = arr(Array.isArray(o.columns) ? o.columns : o.environments).map((e): ColumnDef => {
    const label = str(e.label) || str(e.id) || 'COLUMN';
    let id = str(e.id) || slug(label, 'column');
    while (columnIds.has(id)) id += '-2';
    columnIds.add(id);
    const column: ColumnDef = { id, label, color: str(e.color) || '#888888' };
    if (e.caution === true) column.caution = true;
    return column;
  });

  const groupIds = new Set<string>();
  const groups = arr(o.groups).map((g): GroupDef => {
    const name = str(g.name) || 'Group';
    let id = str(g.id) || slug(name, 'group');
    while (groupIds.has(id)) id += '-2';
    groupIds.add(id);
    return { id, name };
  });

  const cardIds = new Set<string>();
  const cards = arr(legacy ? o.apps : o.cards).map((c, i): CardConfig => {
    let id = str(c.id) || `card-${i + 1}`;
    while (cardIds.has(id)) id += '-2';
    cardIds.add(id);

    const card = { id, name: str(c.name) } as CardConfig;
    if (str(c.description)) card.description = str(c.description);
    if (str(c.badge)) card.badge = str(c.badge);
    if (groupIds.has(str(c.group))) card.group = str(c.group);
    if (c.health === false) card.health = false;
    normalizePlacement(c, card);
    card.links = arr(c.links).map(normalizeLink).filter(l => l.url);
    const taken = new Set<string>();
    card.tiles = arr(Array.isArray(c.tiles) ? c.tiles : c.envs).flatMap(t => normalizeTile(t, columnIds, taken) ?? []);
    return card;
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
    greeting: { title: str(g.title, d.greeting.title), subtitle: str(g.subtitle), typing: bool(g.typing, true) },
    clock: { zones: zones.length ? zones : d.clock.zones },
    weather: {
      place: str(wx.place),
      latitude: num(wx.latitude, 0),
      longitude: num(wx.longitude, 0),
      units: wx.units === 'celsius' ? 'celsius' : 'fahrenheit',
    },
    added: normalizeAdded(w.added),
  };

  return {
    version: 4, site, statusChecks: bool(o.statusChecks, true),
    useColumns: bool(o.useColumns, columns.length > 0), columns, groups,
    links: arr(o.links).map(normalizeLink).filter(l => l.url), cards, widgets, layout: normalizeLayout(o, widgets.added), look: normalizeLook(o),
    extensions: [...new Set(Array.isArray(o.extensions) ? o.extensions.filter(isExtensionPath) : [])].slice(0, 30),
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
  #cards: Card[] = [];
  #tiles = new Map<string, TileRef>();
  #saved?: Saved;
  #previewing = false;

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
  /** The columns tiles line up in — none when the page doesn't use them. */
  get columns() { return this.#raw.useColumns ? this.#raw.columns : []; }
  get groups() { return this.#raw.groups; }
  get statusChecks() { return this.#raw.statusChecks; }
  get links() { return this.#raw.links; }
  get widgets() { return this.#raw.widgets; }
  get layout() { return this.#raw.layout; }
  get look() { return this.#raw.look; }
  get extensions() { return this.#raw.extensions; }
  get cards() { return this.#cards; }
  /** Every tile on the page, keyed by `cardId:tileId`. */
  get tiles() { return this.#tiles; }

  /** True when this browser has changes that aren't in launchpad.config.js. */
  get customized() { return !!this.#saved; }
  get savedAt() { return this.#saved?.savedAt; }
  /** True when launchpad.config.js changed after this browser's copy was made. */
  get fileChanged() { return !!this.#saved && this.#saved.base !== this.#fileHash; }

  /** Apply changes and keep them in this browser. */
  save(next: LaunchpadConfig) {
    this.#previewing = false;
    const data = normalize(next);
    if (same(data, this.#file)) return this.discard();
    this.#saved = { base: this.#fileHash, savedAt: Date.now(), data };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#saved)); } catch { /* storage blocked */ }
    this.#apply(data);
  }

  /** Show `data` without keeping it — Arrange mode's live preview. With no argument, go back to what's saved. */
  preview(data?: LaunchpadConfig) {
    this.#previewing = !!data;
    this.#apply(data ? normalize(data) : this.#saved ? normalize(this.#saved.data) : this.#file);
  }

  /** True while showing a preview rather than what's saved. */
  get previewing() { return this.#previewing; }

  /** Drop this browser's changes and go back to launchpad.config.js. */
  discard() {
    this.#previewing = false;
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
    this.#cards = raw.cards.map((card, i) => {
      // checks can be off for the whole page, the card, or just one tile
      const health = (t: TileConfig) => (!raw.statusChecks || card.health === false ? false : t.health);
      // a column's tile is known by the column's id either way, so pins survive switching columns off and on
      const resolve = (t: TileConfig, def?: ColumnDef): Tile => ({
        id: def?.id ?? t.id!, label: def?.label ?? t.label ?? '', color: def?.color ?? (t.color || cardColor(i)),
        caution: !!def?.caution, name: t.name ?? '', url: t.url, host: t.host || hostOf(t.url), health: health(t),
        fixedColor: !!(def?.color || t.color),
      });
      if (!raw.useColumns) {
        // columns off: tiles keep their order, and a column's tile just wears its label
        return { ...card, tiles: card.tiles.map(t => resolve(t, raw.columns.find(d => d.id === t.column))) };
      }
      // column tiles first, in column order, so they line up from card to card
      const inColumns = raw.columns.flatMap((def): Tile[] => {
        const t = card.tiles.find(x => x.column === def.id);
        return t ? [{ ...resolve(t, def), column: def.id }] : [];
      });
      return { ...card, tiles: [...inColumns, ...card.tiles.filter(t => !t.column).map(t => resolve(t))] };
    });
    this.#tiles = new Map(this.#cards.flatMap(card => card.tiles.map(tile => {
      const key = tileKey(card, tile);
      return [key, { key, card, tile }] as const;
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
