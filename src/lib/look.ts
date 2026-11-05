// src/lib/look.ts
// How the page looks: light or dark, its style, its background, its colours, and how much it moves.
// The page sets its own look in its config ("look", plus the layout's density). Anyone can pick their own
// theme, style, background, colours and motion in Settings → My view, kept in this browser, and theirs wins;
// from there, "Make it everyone's" copies yours into the page's config.
//
// An inline script in index.html applies the same choices before the first paint, so there's no flash.
// Keep the two in step.
import {
  STYLES, THEME_MODES, config, isName, normalizeColors, type ColorSlot, type Colors, type Look, type StyleColors, type ThemeMode,
} from '../config.js';
import { colorsCss, mergeColors, showColors, withoutPage } from './colors.js';
import { ownHues, type Hues } from './combos.js';
import { safeMode } from './custom-css.js';
import { quietly } from './transition.js';

export type Theme = 'light' | 'dark';
export const MOTIONS = ['system', 'full', 'reduced'] as const;
export type Motion = (typeof MOTIONS)[number];
/** The parts of the look anyone can pick for themselves (colours aside). */
const LOOKS = ['theme', 'style', 'background'] as const;
/** Your own picks; anything left out follows the page. */
export type MyLook = Partial<Pick<Look, (typeof LOOKS)[number]>> & { motion?: Motion; colors?: StyleColors };

const some = (colors: StyleColors) => (Object.keys(colors).length ? colors : undefined);

const KEY = 'launchpad:look';
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const systemCalm = matchMedia('(prefers-reduced-motion: reduce)');

const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const maybe = <T extends string>(v: unknown, options: readonly T[]) => (options.includes(v as T) ? (v as T) : undefined);

function readMine(): MyLook {
  let saved: Record<string, unknown> | null = null;
  try { saved = JSON.parse(read(KEY) ?? 'null'); } catch { /* not ours */ }
  // older versions kept just two choices: the theme, once toggled, and the palette (Aurora was the default)
  if (typeof saved !== 'object' || !saved) saved = { theme: read('theme'), style: read('palette') === 'classic' ? 'classic' : undefined };
  const mine: MyLook = {
    theme: maybe(saved.theme, THEME_MODES), style: maybe(saved.style, STYLES), background: isName(saved.background) ? saved.background : undefined,
    motion: maybe(saved.motion, MOTIONS), colors: some(normalizeColors(saved.colors)),
  };
  for (const key of Object.keys(mine) as (keyof MyLook)[]) if (!mine[key]) delete mine[key];
  return mine;
}

class LookStore extends EventTarget {
  #mine = readMine();
  #shown = '';

  constructor() {
    super();
    config.addEventListener('change', () => {
      // a pick that's become the page's own (say, after "Make it everyone's") just follows the page now
      if (!config.previewing && this.#forgetPages()) {
        this.#save();
        return this.#apply(true);
      }
      this.#apply();
    });
    systemDark.addEventListener('change', () => this.#apply());
    systemCalm.addEventListener('change', () => this.#apply());
    // keep several open tabs in step
    addEventListener('storage', e => {
      if (e.key !== KEY) return;
      this.#mine = readMine();
      this.#apply(true);
    });
    this.#apply();
  }

  /** Drops picks that are the page's own anyway. Says whether there were any. */
  #forgetPages() {
    const before = JSON.stringify(this.#mine);
    for (const k of LOOKS) if (this.#mine[k] === config.look[k]) delete this.#mine[k];
    const colors = some(withoutPage(this.#mine.colors, config.look.colors));
    if (colors) this.#mine.colors = colors;
    else delete this.#mine.colors;
    return JSON.stringify(this.#mine) !== before;
  }

  /** What you've picked for yourself. */
  get mine(): Readonly<MyLook> { return this.#mine; }
  /** Whether you've picked a look of your own. Motion doesn't count: that's about comfort, not looks. */
  get customized() { return LOOKS.some(k => this.#mine[k]) || !!this.#mine.colors; }

  #pick<K extends (typeof LOOKS)[number]>(key: K): Look[K] {
    return (this.#mine[key] as Look[K] | undefined) ?? config.look[key];
  }

  get themeMode(): ThemeMode { return this.#pick('theme'); }
  get theme(): Theme {
    const mode = this.themeMode;
    return mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode;
  }
  get style() { return this.#pick('style'); }
  get background() { return this.#pick('background'); }
  get motion(): Motion { return this.#mine.motion ?? 'system'; }
  get reducedMotion() { return this.motion === 'reduced' || (this.motion === 'system' && systemCalm.matches); }

  /** Pick something for yourself. Picking what the page has (or `undefined`) follows the page again. */
  set<K extends keyof MyLook>(key: K, value: MyLook[K] | undefined) {
    this.#keep(key, value);
    this.#save();
    this.#swap();
  }

  #keep<K extends keyof MyLook>(key: K, value: MyLook[K] | undefined) {
    const page = key === 'motion' ? 'system' : config.look[key as keyof Look];
    if (value === undefined || value === page) delete this.#mine[key];
    else this.#mine[key] = value;
  }

  /** The page's colours with yours over them, for every style. */
  get colors(): StyleColors { return mergeColors(config.look.colors, this.#mine.colors); }

  /** The colours you've picked one by one for the style and theme showing now. */
  get myColors(): Colors { return this.#mine.colors?.[this.style]?.[this.theme] ?? {}; }

  /** The hues of the style showing now: your combo, or the page's, or the style's own. */
  get hues(): Hues { return this.colors[this.style]?.hues ?? ownHues(this.style); }

  /**
   * Start the style showing now afresh from a colour combo, in light and dark: its hues, in place of any
   * colours picked one by one (yours, and the page's).
   */
  setHues(hues: Hues) {
    const colors = structuredClone(this.#mine.colors ?? {});
    colors[this.style] = { hues };
    this.#setColors(colors);
  }

  /**
   * Pick one of the colours for the style and theme showing now (each keeps its own), or `undefined` to put
   * it back. Applies at once, with no cross-fade, so it keeps up with a colour picker.
   */
  setColor(slot: ColorSlot, hex: string | undefined) {
    const { style, theme } = this;
    const colors = structuredClone(this.#mine.colors ?? {});
    const set = ((colors[style] ??= {})[theme] ??= {});
    if (hex === undefined) delete set[slot];
    else set[slot] = hex.toLowerCase();
    this.#setColors(colors);
  }

  #setColors(colors: StyleColors) {
    const tidy = some(withoutPage(colors, config.look.colors));
    if (tidy) this.#mine.colors = tidy;
    else delete this.#mine.colors;
    this.#save();
    this.#apply(true);
  }

  /** Follow the page's look again, colours too. Your motion setting stays. */
  reset() {
    this.#mine = this.#mine.motion ? { motion: this.#mine.motion } : {};
    this.#save();
    this.#swap();
  }

  /** Flip between light and dark for yourself, with a circular reveal that grows out of `origin`. */
  async toggleTheme(origin: { x: number; y: number }) {
    this.#keep('theme', this.theme === 'dark' ? 'light' : 'dark');
    this.#save();
    if (!this.#canTransition) return this.#apply(true);

    root.classList.add('vt-theme');
    const vt = document.startViewTransition(() => this.#apply(true));
    try {
      await vt.ready;
      const { x, y } = origin;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(.2, .7, .2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
      await vt.finished;
    } catch {
      // transition skipped — the theme still switched
    } finally {
      root.classList.remove('vt-theme');
    }
  }

  get #canTransition() { return 'startViewTransition' in document && !this.reducedMotion; }

  /** Cross-fade to the new look, if it looks any different. */
  #swap() {
    if (this.#canTransition && this.#key() !== this.#shown) quietly(document.startViewTransition(() => this.#apply(true)));
    else this.#apply(true);
  }

  #save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.#mine)); } catch { /* storage blocked */ }
  }

  /** The colours' CSS. ?safe leaves them out too, in case they've made the page unreadable. */
  get #colorsCss() { return safeMode ? '' : colorsCss(this.colors); }

  #key() { return [this.theme, this.style, this.background, this.reducedMotion, config.layout.density, this.#colorsCss].join(); }

  /** Put the look on the page. Tells listeners when it changed, or always with `announce`. */
  #apply(announce = false) {
    const theme = this.theme;
    const shown = this.#key();
    if (shown !== this.#shown) {
      this.#shown = shown;
      root.classList.toggle('theme-dark', theme === 'dark');
      root.classList.toggle('theme-light', theme === 'light');
      root.dataset.style = this.style;
      root.dataset.background = this.background;
      root.dataset.motion = this.reducedMotion ? 'reduced' : 'full';
      root.dataset.density = config.layout.density;
      showColors(this.#colorsCss);
    } else if (!announce) {
      return;
    }
    this.dispatchEvent(new Event('change'));
  }
}

export const look = new LookStore();
