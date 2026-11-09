// src/lib/glass.ts
// Liquid glass on Launchpad's panels, from the liquid-glass-filter package (its guide: LiquidGLass-UI/docs).
// The package makes the lens, an SVG filter that refracts whatever is behind a panel; Launchpad's CSS keeps
// the look. Each glass gets --lens (the backdrop-filter that draws the lens) and data-lens: "glass" where the
// browser can draw it (Chrome, Edge), "frost" where it can't (Safari, Firefox), which keep the frosted glass
// Launchpad already has. The filters live in one holder at the end of the page, so nothing is added inside
// the panels themselves, which Lit and extensions render.
import { nothing } from 'lit';
import { AsyncDirective, PartType, directive, type ElementPart, type PartInfo } from 'lit/async-directive.js';
import {
  attachGlassLight, attachGlassMotion, attachLiquidGlass,
  type GlassLightHandle, type GlassLightOptions, type GlassMotionHandle, type GlassParams, type LiquidGlassHandle,
} from 'liquid-glass-filter';

export type GlassSetup = {
  /** The lens itself: its rim, strength, shading and so on (the package's parameters). */
  params?: Partial<GlassParams>;
  /** Let the package style the panel (its own tint and backdrop) in place of Launchpad's colours. */
  ownStyles?: boolean;
  /** Draw it as a browser that can't draw the lens would ('frost'), or as one that can ('full'). */
  support?: 'full' | 'frost';
  /** Ease the lens in over this many milliseconds when it first appears. */
  appear?: number;
  /** Squish on press, and stretch along a drag. */
  motion?: boolean;
  /**
   * Light the rim from the page (the package's scene light, above the top of the window, so every glass is lit
   * from the same place) and from the pointer as it comes near; or leave it lit from one fixed direction.
   */
  light?: GlassLightOptions | false;
  /**
   * The size of the lens's map, which the browser draws on every frame the lens is redrawn: most of what a lens
   * costs. Its pixels at most, and the scale it's made at (else the screen's). The lens stretches it to fit,
   * and since it only moves the backdrop about smoothly, a small one looks much the same.
   */
  mapPixels?: number;
  mapScale?: number;
  /** From My view: less motion (no easing in, no squish), and frostier, higher-contrast glass. */
  reducedMotion?: boolean;
  reducedTransparency?: boolean | 'auto';
};

/** Every glass on the page now. */
export const glasses = new Set<Glass>();

let holder: HTMLElement | undefined;

/** Where the lenses' SVG filters live: an empty corner of the page, in the same document as the panels. */
function lensHolder() {
  if (!holder) {
    holder = document.createElement('div');
    holder.className = 'lens-holder';
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position: fixed; width: 0; height: 0; overflow: hidden; pointer-events: none';
  }
  if (!holder.isConnected) document.body.append(holder);
  return holder;
}

/** Liquid glass on one element. */
export class Glass {
  readonly element: HTMLElement;
  #setup: GlassSetup = {};
  #handle?: LiquidGlassHandle;
  #motion?: GlassMotionHandle;
  #light?: GlassLightHandle;
  /** How the lens was attached (a change starts it over), what it was last given, and how it's lit. */
  #how = '';
  #params = '';
  #lit = '';
  #started = false;

  /**
   * Lenses waiting to start: a couple each frame, and only once their element is on the page (the lens is cut
   * to its size and corners). A page full of panels then never holds up a paint, and its lenses ease in in turn.
   */
  static #queue = new Set<Glass>();
  static #frame = 0;

  static #drain() {
    Glass.#frame = 0;
    let started = 0;
    for (const glass of Glass.#queue) {
      if (started === 2) break;
      if (!glass.element.isConnected) continue;
      Glass.#queue.delete(glass);
      glass.#begin();
      started++;
    }
    if (Glass.#queue.size) Glass.#frame = requestAnimationFrame(Glass.#drain);
  }

  constructor(element: HTMLElement, setup: GlassSetup = {}) {
    this.element = element;
    glasses.add(this);
    this.set(setup);
  }

  /** The package's handle: its mode, parameters and debug numbers. */
  get handle() { return this.#handle; }

  /** What it was last set up with. */
  get setup(): Readonly<GlassSetup> { return this.#setup; }

  /** New settings. The lens updates in place, or starts over if how it's attached has changed. */
  set(setup: GlassSetup) {
    this.#setup = setup;
    const how = JSON.stringify([setup.ownStyles, setup.support, setup.reducedTransparency, setup.mapPixels, setup.mapScale]);
    if ((this.#handle || Glass.#queue.has(this)) && how === this.#how) {
      this.#update();
      this.#move();
      this.#aim();
      return;
    }
    this.#how = how;
    this.#stop();
    this.#start();
  }

  /**
   * The lens's parameters, with the element's corners as they are now (the style can change them). When the
   * package styles the element, it reads the corners itself: given a number, it would write it onto the element.
   */
  #lensParams() {
    if (this.#setup.ownStyles) return { ...this.#setup.params };
    return { ...this.#setup.params, radius: this.#radius() };
  }

  /** Read the corners again, and take any new parameters. */
  #update() {
    if (!this.#handle) return;
    const params = this.#lensParams();
    const key = JSON.stringify(params);
    if (key === this.#params) return;
    this.#params = key;
    void this.#handle.update(params);
  }

  /** The element's corner radius, in px. */
  #radius() { return parseFloat(getComputedStyle(this.element).borderTopLeftRadius) || 0; }

  #start() {
    Glass.#queue.add(this);
    Glass.#frame ||= requestAnimationFrame(Glass.#drain);
  }

  #begin() {
    const s = this.#setup;
    const own = !!s.ownStyles;
    const params = this.#lensParams();
    this.#params = JSON.stringify(params);
    this.#handle = attachLiquidGlass(this.element, {
      ...params,
      applyStyles: own,
      // the light on its own layer, the panel's ::before (see #paint), so the lens has less to redo
      lightLayer: !own,
      support: s.support,
      ...(s.mapPixels ? { maxMapPixels: s.mapPixels } : {}),
      ...(s.mapScale ? { dpr: s.mapScale } : {}),
      mount: lensHolder(),
      reducedTransparency: s.reducedTransparency ?? 'auto',
      // only a new lens eases in, not one that's starting over with new settings
      appear: s.appear && !s.reducedMotion && !this.#started ? s.appear : undefined,
      onRender: handle => this.#paint(handle),
    });
    this.#started = true;
    this.#move();
    this.#aim();
  }

  /** Squish on press, or not: it comes and goes without touching the lens. */
  #move() {
    const want = !!this.#handle && !!this.#setup.motion && !this.#setup.reducedMotion;
    if (want && !this.#motion) this.#motion = attachGlassMotion(this.#handle!);
    else if (!want && this.#motion) {
      this.#motion.destroy();
      this.#motion = undefined;
    }
  }

  /** The moving light, or not: like the squish, it comes and goes without touching the lens. Less motion snaps it. */
  #aim() {
    const s = this.#setup;
    const lit = this.#handle && s.light ? JSON.stringify([s.light, s.reducedMotion]) : '';
    if (lit === this.#lit) return;
    this.#lit = lit;
    this.#light?.destroy();
    this.#light = this.#handle && s.light
      ? attachGlassLight(this.#handle, { ...s.light, ...(s.reducedMotion ? { smoothing: 1 } : {}) })
      : undefined;
  }

  /**
   * After each render: tell the CSS which way it's drawn, and hand it the lens, and the lens's light: its
   * shading and its lit rim, which the panel's ::before draws (styles/glass.css). In the lens's own filter, the
   * light would be redone over the backdrop on every frame the lens is redrawn, which made a page of glass three
   * times slower; on its own layer it's only redrawn when the light moves.
   */
  #paint(handle: LiquidGlassHandle) {
    this.element.dataset.lens = handle.mode;
    if (this.#setup.ownStyles) return;
    const light = handle.getLightStyle();
    this.#prop('--lens', handle.getStyle().backdropFilter);
    this.#prop('--lens-light', light.backgroundImage);
    this.#prop('--lens-lit', light.filter);
  }

  /** Set a custom property, or clear it; only when it changes, since this runs on every frame the light moves. */
  #prop(name: string, value: string | undefined) {
    const style = this.element.style;
    if (style.getPropertyValue(name) === (value ?? '')) return;
    if (value) style.setProperty(name, value);
    else style.removeProperty(name);
  }

  #stop() {
    Glass.#queue.delete(this);
    this.#light?.destroy();
    this.#motion?.destroy();
    this.#handle?.destroy();
    this.#light = this.#motion = this.#handle = undefined;
    this.#lit = '';
    delete this.element.dataset.lens;
    this.element.style.removeProperty('--lens');
    this.element.style.removeProperty('--lens-light');
    this.element.style.removeProperty('--lens-lit');
  }

  destroy() {
    this.#stop();
    glasses.delete(this);
  }
}

class GlassDirective extends AsyncDirective {
  #element?: HTMLElement;
  #setup: GlassSetup = {};
  #glass?: Glass;

  constructor(part: PartInfo) {
    super(part);
    if (part.type !== PartType.ELEMENT) throw new Error('glass() goes on an element');
  }

  render(_setup?: GlassSetup) { return nothing; }

  update(part: ElementPart, [setup = {}]: [GlassSetup?]) {
    this.#element = part.element as HTMLElement;
    this.#setup = setup;
    if (this.#glass) this.#glass.set(setup);
    else if (this.isConnected) this.#glass = new Glass(this.#element, setup);
    return nothing;
  }

  protected disconnected() {
    this.#glass?.destroy();
    this.#glass = undefined;
  }

  protected reconnected() {
    if (this.#element) this.#glass = new Glass(this.#element, this.#setup);
  }
}

/**
 * Liquid glass on an element in a Lit template, `<div class="glass" ${glass({ params })}>`. It comes and goes
 * with the element: added cards get theirs, removed ones give theirs back.
 */
export const glass = directive(GlassDirective);
