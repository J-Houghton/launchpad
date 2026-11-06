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
  attachGlassMotion, attachLiquidGlass, displacementCurve, displacementMap, maxAbs,
  type GlassMotionHandle, type GlassParams, type LiquidGlassHandle, type ResolvedGlassParams,
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

/**
 * A lens's shading and rim light, drawn once into an image instead of by its filter on every frame. They depend
 * only on the shape, and taking them out of the filter halves what a lens costs to redraw. They're made with the
 * package's own engine at the element's full size and the screen's scale, so the rim stays crisp however small
 * the lens's map is. The engine bakes them into a map's blue channel (light above 128, shade below); here they
 * become white and black, see-through by as much as the filter would have blended them in, which, laid over the
 * lens, comes to the same thing. Shared by every lens of the same shape, and let go when none uses it.
 */
const lights = new Map<string, { url: Promise<string>; users: number }>();

function takeLight(p: ResolvedGlassParams, shade: number, rim: number) {
  const scale = Math.min(devicePixelRatio || 1, 2);
  const [width, height] = [Math.round(p.width), Math.round(p.height)];
  const key = [width, height, p.radius, p.bezelWidth, p.surface, p.glassThickness, p.refractiveIndex, p.specularAngleDeg, scale, shade, rim].join(' ');
  let light = lights.get(key);
  if (!light) lights.set(key, (light = { url: paintLight({ ...p, width, height }, scale, shade, rim), users: 0 }));
  light.users++;
  return { key, url: light.url };
}

function dropLight(key: string) {
  const light = lights.get(key);
  if (!light || --light.users > 0) return;
  lights.delete(key);
  void light.url.then(url => URL.revokeObjectURL(url), () => {});
}

async function paintLight(p: ResolvedGlassParams, scale: number, shade: number, rim: number) {
  await new Promise(done => setTimeout(done)); // after the frame that asked for it
  const curve = displacementCurve({
    glassThickness: p.glassThickness, bezelWidth: p.bezelWidth, refractiveIndex: p.refractiveIndex, surface: p.surface,
  });
  const map = displacementMap({
    width: p.width, height: p.height, radius: p.radius, bezelWidth: p.bezelWidth, dpr: scale,
    curve, maxDisplacement: maxAbs(curve), rim: { angleDeg: p.specularAngleDeg, rimPx: 2 },
  });
  const image = new ImageData(map.width, map.height);
  const [from, px] = [map.data, image.data];
  for (let i = 0; i < px.length; i += 4) {
    const b = from[i + 2];
    const lit = b > 128;
    px[i] = px[i + 1] = px[i + 2] = lit ? 255 : 0;
    px[i + 3] = Math.round(255 * Math.min(1, lit ? ((b - 128) / 127) * rim : ((128 - b) / 128) * shade));
  }
  const canvas = Object.assign(document.createElement('canvas'), { width: map.width, height: map.height });
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>(done => canvas.toBlob(done));
  if (!blob) throw new Error('Couldn\'t draw the lens\'s light');
  return URL.createObjectURL(blob);
}

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
  /** How the lens was attached (a change starts it over), and what it was last given. */
  #how = '';
  #params = '';
  #started = false;
  /** The shading and rim light on the element now, and the one last asked for (keys into `lights`). */
  #light = '';
  #wanted = '';

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
      return;
    }
    this.#how = how;
    this.#stop();
    this.#start();
  }

  /**
   * The lens's parameters, with the element's corners as they are now (the style can change them). When the
   * package styles the element, it reads the corners itself: given a number, it would write it onto the element.
   * Otherwise the shading and rim light are left out of the filter, and drawn as an image instead (`lights`).
   */
  #lensParams() {
    if (this.#setup.ownStyles) return { ...this.#setup.params };
    return { ...this.#setup.params, shade: 0, specular: false, radius: this.#radius() };
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

  /** After each render: tell the CSS which way it's drawn, and hand it the lens and its light. */
  #paint(handle: LiquidGlassHandle) {
    this.element.dataset.lens = handle.mode;
    if (this.#setup.ownStyles) return;
    this.element.style.setProperty('--lens', handle.getStyle().backdropFilter ?? 'none');
    const p = this.#setup.params ?? {};
    const shade = p.shade ?? 0;
    const rim = p.specular === false ? 0 : (p.specularStrength ?? 0.81);
    if (handle.mode !== 'glass' || !(shade || rim)) return this.#setLight('');
    const { key, url } = takeLight(handle.params, shade, rim);
    if (key === this.#wanted) return dropLight(key);
    this.#wanted = key;
    // the old light stays until the new one is ready, so it never blinks off
    url.then(src => {
      if (this.#handle !== handle || this.#wanted !== key) return dropLight(key);
      this.element.style.setProperty('--lens-light', `url("${src}")`);
      this.#setLight(key);
    }, () => dropLight(key));
  }

  /** Let go of the light on the element (and take the newly shown one, if any). */
  #setLight(key: string) {
    if (this.#light && this.#light !== key) dropLight(this.#light);
    this.#light = key;
    if (!key) {
      this.#wanted = '';
      this.element.style.removeProperty('--lens-light');
    }
  }

  #stop() {
    Glass.#queue.delete(this);
    this.#motion?.destroy();
    this.#handle?.destroy();
    this.#motion = this.#handle = undefined;
    this.#setLight('');
    delete this.element.dataset.lens;
    this.element.style.removeProperty('--lens');
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
