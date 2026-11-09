// src/lib/panel-glass.ts
// Liquid glass on the page's panels (the header, widgets, pinned and recent, and the cards), in the styles
// drawn with it. A panel's lens comes and goes with the panel and with the style. The panel springs in as it
// first appears, rises a little under the pointer, and squishes when pressed (and stretches as it's dragged
// across). Less motion (My view, or the system's) turns all of that off; so does arranging the page, where
// cards are dragged about.
import { nothing } from 'lit';
import { AsyncDirective, PartType, directive, type ElementPart, type PartInfo } from 'lit/async-directive.js';
import type { GlassParams } from 'liquid-glass-filter';
import type { Style } from '../config.js';
import { arrange } from './arrange.js';
import { Glass, type GlassSetup } from './glass.js';
import { look } from './look.js';

/** The styles with liquid glass panels. The rest keep their frosted (or solid) ones. */
export const GLASS_STYLES: readonly Style[] = ['aurora', 'liquid', 'neon'];

/** A strong lens, frosted a little inside so what's on the panel stays easy to read. */
const LENS: Partial<GlassParams> = { bezelWidth: 46, displacementScale: 180, shade: 0.4, specularStrength: 1, blur: 1.5, blurStage: 'before' };
/**
 * A lens's map, which the browser draws each time the lens is redrawn, is the bulk of what it costs: capped at
 * this many pixels, a page of glass panels redraws four times as fast on a laptop's graphics, and looks the same.
 */
const MAP_PIXELS = 32_000;

/** The header links' sliding highlight: a small drop of glass over the link, bending just the edges of its name. */
const DROP: Partial<GlassParams> = { bezelWidth: 10, displacementScale: 12, shade: 0.55, specularStrength: 1.3, blur: 0 };

/** 'panel' eases in and squishes; the 'header' bar holds still; a 'drop' is the links' highlight. */
export type GlassKind = 'panel' | 'header' | 'drop';

class PanelGlassDirective extends AsyncDirective {
  #element?: HTMLElement;
  #kind: GlassKind = 'panel';
  #glass?: Glass;
  #listening = false;
  #sync = () => this.#apply();

  constructor(part: PartInfo) {
    super(part);
    if (part.type !== PartType.ELEMENT) throw new Error('panelGlass() goes on an element');
  }

  render(_kind?: GlassKind) { return nothing; }

  update(part: ElementPart, [kind = 'panel']: [GlassKind?]) {
    this.#element = part.element as HTMLElement;
    this.#kind = kind;
    if (this.isConnected) this.#listen(true);
    this.#apply();
    return nothing;
  }

  #listen(on: boolean) {
    if (on === this.#listening) return;
    this.#listening = on;
    for (const store of [look, arrange]) {
      if (on) store.addEventListener('change', this.#sync);
      else store.removeEventListener('change', this.#sync);
    }
  }

  #setup(): GlassSetup | undefined {
    if (!GLASS_STYLES.includes(look.style)) return undefined;
    const panel = this.#kind === 'panel';
    return {
      params: this.#kind === 'drop' ? DROP : LENS,
      mapPixels: MAP_PIXELS,
      light: {},
      appear: panel ? 450 : undefined,
      motion: panel && !arrange.active,
      reducedMotion: look.reducedMotion,
    };
  }

  /** Give the panel its lens, update it (the style may have changed its corners), or take it away. */
  #apply() {
    const setup = this.#setup();
    if (!setup || !this.#element) {
      this.#glass?.destroy();
      this.#glass = undefined;
    } else if (this.#glass) {
      this.#glass.set(setup);
    } else if (this.isConnected) {
      this.#glass = new Glass(this.#element, setup);
    }
  }

  protected disconnected() {
    this.#listen(false);
    this.#glass?.destroy();
    this.#glass = undefined;
  }

  protected reconnected() {
    this.#listen(true);
    this.#apply();
  }
}

/** Liquid glass on a panel, in the styles that have it: `<section class="panel glass" ${panelGlass()}>`. */
export const panelGlass = directive(PanelGlassDirective);
