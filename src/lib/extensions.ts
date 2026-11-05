// src/lib/extensions.ts
// Extensions: script files next to index.html, listed in the config ("extensions"), that add widgets and
// backgrounds through window.Launchpad (see the README, and the examples in public/extensions/).
//
// They're plain scripts rather than modules, so they load from disk too. They run with the page's full
// trust — which is why they only ever come from files beside it, never from an address or from text in
// the config. Opening the page with ?safe leaves them all out.
import { config, isExtensionPath, isKey, isName } from '../config.js';
import { safeMode } from './custom-css.js';
import { toast } from './util.js';

export type FieldType = 'text' | 'textarea' | 'number' | 'url' | 'date' | 'datetime' | 'select' | 'checkbox';
/** One of a widget's settings, as Settings → Widgets offers it. */
export type Field = {
  key: string;
  label: string;
  type?: FieldType;
  /** For a select: the values, or { value, label } pairs. */
  choices?: (string | { value: string; label: string })[];
  default?: string | number | boolean;
  placeholder?: string;
  hint?: string;
};
export type Options = Record<string, string | number | boolean>;

export type WidgetContext = {
  /** The widget's id on the page, and its title. */
  id: string;
  title: string;
  /** Kept in this browser, for this widget alone. */
  store: { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void };
  toast(message: string): void;
};

export type WidgetType = {
  name: string;
  description?: string;
  fields?: Field[];
  /** No title bar or panel of its own — for a widget that's all its own, like a search box in place of the greeting. */
  bare?: boolean;
  /** Draws the widget into `el`; called when it appears and whenever its settings change. May return a clean-up. */
  render(el: HTMLElement, options: Options, ctx: WidgetContext): void | (() => void);
};

export type Colors = { particle: string; accent: string; accent2: string; accent3: string; ink: string; muted: string; bg: string };
/** What a background is told each frame. Sizes are in CSS pixels; the canvas is scaled to match. */
export type Frame = {
  width: number;
  height: number;
  /** Milliseconds since it started, and how far this frame moves things along (1 at 60 frames a second). */
  time: number;
  dt: number;
  /** Where the pointer is, or null when it's away. */
  pointer: { x: number; y: number } | null;
  /** The style's colours, in this theme. */
  colors: Colors;
  /** True when motion is turned down: draw a still picture (this is the only frame until something changes). */
  still: boolean;
};

export type BackgroundType = {
  name: string;
  description?: string;
  /** Called when it starts and whenever the page changes size. */
  setup?(size: { width: number; height: number }): void;
  /** Draws one frame. The canvas is cleared first. */
  draw(g: CanvasRenderingContext2D, frame: Frame): void;
};

export type FileState = { state: 'loading' | 'loaded' | 'failed'; error?: string; adds: string[] };

/** Ids the page keeps for itself. */
const RESERVED_WIDGETS = new Set(['embed', 'data', 'extension']);
const RESERVED_BACKGROUNDS = new Set(['still', 'plain']);

class Registry extends EventTarget {
  readonly widgets = new Map<string, WidgetType>();
  readonly backgrounds = new Map<string, BackgroundType>();
  /** Each extension file the config lists, how its loading went, and what it added. */
  readonly files = new Map<string, FileState>();

  /** The extension file whose script is running now, if any. */
  currentPath() {
    return (document.currentScript as HTMLScriptElement | null)?.dataset.extension;
  }

  #current() {
    const path = this.currentPath();
    return path ? this.files.get(path) : undefined;
  }

  addWidget(type: string, def: WidgetType) {
    if (!isName(type) || RESERVED_WIDGETS.has(type)) throw new Error(`Launchpad.widget: "${type}" won't do — use lowercase letters, digits and dashes`);
    if (this.widgets.has(type)) throw new Error(`Launchpad.widget: there's already a "${type}" widget`);
    if (typeof def?.render !== 'function' || typeof def.name !== 'string') throw new Error('Launchpad.widget: it needs a name and a render function');
    this.widgets.set(type, Object.freeze({ ...def, fields: def.fields?.filter(f => f && isKey(f.key)) }));
    this.#current()?.adds.push(`${def.name} widget`);
    this.#emit();
  }

  addBackground(id: string, def: BackgroundType) {
    if (!isName(id) || RESERVED_BACKGROUNDS.has(id)) throw new Error(`Launchpad.background: "${id}" won't do — use lowercase letters, digits and dashes`);
    if (this.backgrounds.has(id)) throw new Error(`Launchpad.background: there's already a "${id}" background`);
    if (typeof def?.draw !== 'function' || typeof def.name !== 'string') throw new Error('Launchpad.background: it needs a name and a draw function');
    this.backgrounds.set(id, Object.freeze({ ...def }));
    this.#current()?.adds.push(`${def.name} background`);
    this.#emit();
  }

  /** Loads the listed files that haven't been yet, in order. Taking one out of the list only counts after a reload. */
  load(paths: string[]) {
    if (safeMode) return;
    for (const path of paths) {
      if (this.files.has(path) || !isExtensionPath(path)) continue;
      const file: FileState = { state: 'loading', adds: [] };
      this.files.set(path, file);
      const script = Object.assign(document.createElement('script'), { src: path, async: false });
      script.dataset.extension = path;
      script.addEventListener('load', () => {
        if (file.state === 'loading') file.state = 'loaded';
        this.#emit();
      });
      script.addEventListener('error', () => {
        Object.assign(file, { state: 'failed', error: 'not found next to index.html' });
        this.#emit();
      });
      document.head.append(script);
    }
    this.#emit();
  }

  /** Marks an extension's file as failed, with the reason. */
  fail(path: string, message: string) {
    const file = this.files.get(path);
    if (!file) return;
    Object.assign(file, { state: 'failed', error: message });
    this.#emit();
  }

  #emit() { this.dispatchEvent(new Event('change')); }
}

export const registry = new Registry();

/**
 * The API's complaints are put down to the file that made them, so Settings can say what went wrong.
 * (Pages opened from disk aren't told which file other errors come from, so this is the reliable way.)
 */
function blame<A extends unknown[]>(run: (...args: A) => void) {
  return (...args: A) => {
    try {
      run(...args);
    } catch (err) {
      const path = registry.currentPath();
      if (path) registry.fail(path, (err as Error).message);
      throw err;
    }
  };
}

// and when the browser does say where an error came from, that counts too
addEventListener('error', e => {
  for (const path of registry.files.keys()) {
    if (e.filename && new URL(path, location.href).href === e.filename) registry.fail(path, e.message.replace(/^Uncaught (Error: )?/, ''));
  }
});

/** The API extensions see, as window.Launchpad. */
const api = Object.freeze({
  version: 1,
  widget: blame((type: string, def: WidgetType) => registry.addWidget(type, def)),
  background: blame((id: string, def: BackgroundType) => registry.addBackground(id, def)),
  toast: (message: string) => toast(String(message)),
});

declare global {
  interface Window { Launchpad: typeof api }
}
Object.defineProperty(window, 'Launchpad', { value: api, enumerable: true });

/** Starts loading the config's extensions, and any it gains later. */
export function startExtensions() {
  registry.load(config.extensions);
  config.addEventListener('change', () => registry.load(config.extensions));
}

/** What a widget's settings work out to: its fields' defaults, then what's been set. */
export function widgetOptions(def: WidgetType | undefined, options: Options): Options {
  const defaults = Object.fromEntries((def?.fields ?? []).flatMap(f => (f.default === undefined ? [] : [[f.key, f.default]])));
  return { ...defaults, ...options };
}

/** A widget's own corner of this browser's storage. */
export function widgetStore(id: string): WidgetContext['store'] {
  const key = (k: string) => `launchpad:widget:${id}:${k}`;
  return {
    get<T>(k: string, fallback: T): T {
      try {
        const v = localStorage.getItem(key(k));
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(k: string, value: unknown) {
      try { localStorage.setItem(key(k), JSON.stringify(value)); } catch { /* storage blocked */ }
    },
  };
}
