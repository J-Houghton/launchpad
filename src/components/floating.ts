// src/components/floating.ts
// What floats over the page in the styles drawn in liquid glass (Aurora, Liquid and Neon), each of it glass:
//   <pin-dock>      your pinned links in a bar at the bottom of the window, whenever the Pinned panel is out of
//                   sight (scrolled away, or left off the page), so they're always one click away;
//   <page-actions>  round buttons in the corner: back to the top, once the page has scrolled, and Settings;
//   <tile-lens>     one lens that glides to the tile under the pointer, or the one the keyboard is on.
// The other styles don't have them, and neither does arranging the page, which has a bar of its own there.
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { GlassParams } from 'liquid-glass-filter';
import { config, type TileRef } from '../config.js';
import { arrange } from '../lib/arrange.js';
import { Glass } from '../lib/glass.js';
import { CONTROL_MAP_PIXELS, CONTROL_RIM, Spring, controlGlass, frames, glassOn, themed } from '../lib/glass-controls.js';
import { health } from '../lib/health.js';
import { ChevronUp, Settings, icon } from '../lib/icons.js';
import { look } from '../lib/look.js';
import { prefs } from '../lib/prefs.js';
import { StoreController } from '../lib/store-controller.js';
import { transition } from '../lib/transition.js';
import { openSettings } from './settings-panel.js';
import { onTileContextMenu, tileTitle } from './tile-menu.js';

@customElement('pin-dock')
export class PinDock extends LitElement {
  protected createRenderRoot() { return this; }

  /** The Pinned panel is out of sight (or not on the page). */
  @state() private away = true;
  #watched?: Element;
  // out of sight once less than half of it shows below the header
  #watch = new IntersectionObserver(entries => { this.away = entries[entries.length - 1].intersectionRatio < 0.5; }, { threshold: [0, 0.5, 1], rootMargin: '-80px 0px 0px 0px' });

  constructor() {
    super();
    new StoreController(this, config, prefs, health, look, arrange);
  }

  disconnectedCallback() {
    this.#watch.disconnect();
    this.#watched = undefined;
    document.documentElement.removeAttribute('data-dock');
    super.disconnectedCallback();
  }

  get #shown() { return glassOn() && !arrange.active && this.away && prefs.pins.some(k => config.tiles.has(k)); }

  protected updated() {
    // the Pinned panel comes and goes with the page's layout
    const panel = document.querySelector('[data-section="pinned"]') ?? undefined;
    if (panel !== this.#watched) {
      this.#watch.disconnect();
      this.#watched = panel;
      if (panel) this.#watch.observe(panel);
      else this.away = true;
    }
    // toasts rise above it while it's there (styles/glass.css)
    document.documentElement.toggleAttribute('data-dock', this.#shown);
  }

  #link(ref: TileRef) {
    const { key, tile } = ref;
    // a column tile reads "Billing · DEV"; any other tile just by its own name
    const name = tile.column ? ref.card.name : tileTitle(ref).primary;
    const h = health.get(key);
    const open = () => transition(() => prefs.recordOpen(key));
    return html`
      <li data-env style="--env:${tile.color}">
        <a class="dock-link" href=${tile.url} target="_blank" rel="noopener"
           title="${name}${tile.label ? ` ${tile.label}` : ''} · ${tile.host}"
           @click=${open} @auxclick=${(e: MouseEvent) => e.button === 1 && open()} @contextmenu=${onTileContextMenu(key)}>
          <span class="status-dot" data-state=${h.state} ?data-pending=${h.pending}></span>
          <span class="dock-name">${name}</span>
          ${tile.label ? html`<span class="dock-tag">${tile.label}</span>` : nothing}
        </a>
      </li>`;
  }

  render() {
    const shown = this.#shown;
    const pins = prefs.pins.map(k => config.tiles.get(k)).filter(r => r !== undefined);
    return html`
      <nav class="pin-dock" aria-label="Pinned links" ?data-shown=${shown} ?inert=${!shown} ${controlGlass('bar', shown)}>
        <ul>${pins.map(ref => this.#link(ref))}</ul>
      </nav>`;
  }
}

/** The page has scrolled this far before "back to the top" is offered, px. */
const TOP_AFTER = 480;

@customElement('page-actions')
export class PageActions extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private scrolled = false;
  #onScroll = () => { this.scrolled = scrollY > TOP_AFTER; };

  constructor() {
    super();
    new StoreController(this, look, arrange);
  }

  connectedCallback() {
    super.connectedCallback();
    addEventListener('scroll', this.#onScroll, { passive: true });
    this.#onScroll();
  }

  disconnectedCallback() {
    removeEventListener('scroll', this.#onScroll);
    super.disconnectedCallback();
  }

  #top = () => scrollTo({ top: 0, behavior: look.reducedMotion ? 'auto' : 'smooth' });

  render() {
    if (!glassOn() || arrange.active) return nothing;
    return html`
      <div class="page-actions" role="group" aria-label="Page actions">
        <button class="page-action" type="button" aria-label="Back to the top" title="Back to the top"
                ?data-away=${!this.scrolled} ?inert=${!this.scrolled} @click=${this.#top}
                ${controlGlass('button', this.scrolled)}>${icon(ChevronUp)}</button>
        <button class="page-action" type="button" aria-label="Settings" title="Settings (Ctrl+,)"
                @click=${() => openSettings()} ${controlGlass()}>${icon(Settings)}</button>
      </div>`;
  }
}

/** The tile lens: clear, with a bright edge, bending the tile's rim and drawing the tile a touch larger. */
const TILE_LENS: Partial<GlassParams> = { bezelWidth: 14, displacementScale: 20, magnify: 8, shade: 0.4, specularStrength: 1.3, blur: 0, tint: 0 };
/** How far it stands out round the tile, px. */
const LENS_PAD = 4;
/** Off a tile for this long (crossing the gap to the next takes less), it goes, ms. */
const LENS_LINGER = 140;

@customElement('tile-lens')
export class TileLens extends LitElement {
  protected createRenderRoot() { return this; }

  #lens!: HTMLElement;
  #glass?: Glass;
  #tile?: HTMLElement;
  /** Where it was last drawn, in the window. */
  #at?: { x: number; y: number };
  /** How far it still is from its tile, on its way there. */
  readonly #dx = new Spring(0, { duration: 0.38, bounce: 0.22 }, 0.05);
  readonly #dy = new Spring(0, { duration: 0.38, bounce: 0.22 }, 0.05);
  #leave = 0;
  #size = '';
  readonly #frames = frames(dt => this.#frame(dt));

  connectedCallback() {
    super.connectedCallback();
    addEventListener('pointerover', this.#over);
    addEventListener('focusin', this.#focus);
    addEventListener('focusout', this.#blur);
    addEventListener('pointerdown', this.#press);
    addEventListener('pointerup', this.#release);
    look.addEventListener('change', this.#sync);
    arrange.addEventListener('change', this.#sync);
  }

  disconnectedCallback() {
    removeEventListener('pointerover', this.#over);
    removeEventListener('focusin', this.#focus);
    removeEventListener('focusout', this.#blur);
    removeEventListener('pointerdown', this.#press);
    removeEventListener('pointerup', this.#release);
    look.removeEventListener('change', this.#sync);
    arrange.removeEventListener('change', this.#sync);
    this.#frames.stop();
    this.#glass?.destroy();
    this.#glass = undefined;
    super.disconnectedCallback();
  }

  protected firstUpdated() { this.#lens = this.querySelector<HTMLElement>('.tile-lens')!; }

  get #on() { return glassOn() && !arrange.active; }

  /** The style, the theme or arranging changed: the lens goes, and is made afresh when next wanted. */
  #sync = () => {
    this.#drop();
    this.#glass?.destroy();
    this.#glass = undefined;
  };

  #over = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !this.#on) return;
    const tile = (e.target as Element).closest?.<HTMLElement>('.env-tile');
    if (tile) this.#go(tile);
    else this.#leaveSoon();
  };

  #focus = (e: FocusEvent) => {
    const link = e.target as Element;
    if (!this.#on || !link.matches?.('.env-link:focus-visible')) return;
    this.#go(link.closest<HTMLElement>('.env-tile')!);
  };

  #blur = (e: FocusEvent) => {
    if ((e.target as Element).closest?.('.env-tile') === this.#tile) this.#leaveSoon();
  };

  #press = (e: PointerEvent) => {
    if ((e.target as Element).closest?.('.env-tile') === this.#tile) this.#lens.toggleAttribute('data-pressed', true);
  };

  #release = () => this.#lens?.removeAttribute('data-pressed');

  #go(tile: HTMLElement) {
    clearTimeout(this.#leave);
    this.#leave = 0;
    if (tile === this.#tile) return;
    // it glides from where it is; from nowhere, it's just there
    const to = this.#place(tile);
    if (this.#tile && this.#at && to && !look.reducedMotion) {
      this.#dx.snap(this.#at.x - to.x);
      this.#dy.snap(this.#at.y - to.y);
      this.#dx.to = this.#dy.to = 0;
    } else {
      this.#dx.snap(0);
      this.#dy.snap(0);
    }
    this.#tile = tile;
    this.#glass ??= new Glass(this.#lens, { params: themed(TILE_LENS), rimPx: CONTROL_RIM, light: {}, mapPixels: CONTROL_MAP_PIXELS });
    this.#lens.toggleAttribute('data-on', true);
    this.#frames.start();
  }

  #leaveSoon() {
    if (!this.#tile || this.#leave) return;
    this.#leave = window.setTimeout(() => this.#drop(), LENS_LINGER);
  }

  #drop() {
    clearTimeout(this.#leave);
    this.#leave = 0;
    this.#tile = undefined;
    this.#at = undefined;
    this.#lens?.removeAttribute('data-on');
    this.#lens?.removeAttribute('data-pressed');
  }

  /** Where the lens goes for a tile: round it, and no further than the row it scrolls in shows of it. */
  #place(tile: HTMLElement) {
    if (!tile.isConnected) return undefined;
    const r = tile.getBoundingClientRect();
    let [left, right] = [r.left, r.right];
    const track = tile.closest('.gallery-track')?.getBoundingClientRect();
    if (track) {
      left = Math.max(left, track.left);
      right = Math.min(right, track.right);
    }
    if (right - left < 24 || !r.height) return undefined;
    return { x: left - LENS_PAD, y: r.top - LENS_PAD, w: right - left + LENS_PAD * 2, h: r.height + LENS_PAD * 2 };
  }

  #frame(dt: number) {
    const tile = this.#tile;
    if (!tile) return false;
    const to = this.#place(tile);
    if (!to) {
      this.#drop();
      return false;
    }
    this.#dx.step(dt);
    this.#dy.step(dt);
    const style = this.#lens.style;
    const size = `${Math.round(to.w)}x${Math.round(to.h)}`;
    if (size !== this.#size) {
      this.#size = size;
      style.width = `${Math.round(to.w)}px`;
      style.height = `${Math.round(to.h)}px`;
      style.borderRadius = `${(parseFloat(getComputedStyle(tile).borderTopLeftRadius) || 0) + LENS_PAD}px`;
    }
    // it stays on its tile as the page (or its row) scrolls: the tile is read afresh each frame
    this.#at = { x: to.x + this.#dx.value, y: to.y + this.#dy.value };
    style.translate = `${this.#at.x}px ${this.#at.y}px`;
    return true;
  }

  render() {
    return html`<div class="tile-lens" aria-hidden="true"></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pin-dock': PinDock;
    'page-actions': PageActions;
    'tile-lens': TileLens;
  }
}
