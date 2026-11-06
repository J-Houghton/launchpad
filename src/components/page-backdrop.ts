// src/components/page-backdrop.ts
// Fixed full-page atmosphere: the style's backdrop (blobs of colour, or its pattern), a soft glow that
// follows the pointer, film grain, and a canvas for the background in use — the built-in particles
// (backgrounds/particles.ts) or one an extension adds (lib/extensions.ts). This runs its frames, sizes its
// canvas and tells it the colours, so a background only has to draw.
// The "still" background leaves the canvas out, and "plain" everything but the base colour.
//
// Liquid glass lenses (lib/panel-glass.ts) redraw on every frame where anything behind them moves, so while
// they're drawn the page is "calm" (data-calm on the root): the backdrop's motion (the background, the glow
// under the pointer and Neon's floor) moves together 30 times a second, and styles/glass.css stills the rest.
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { isLiquidGlassSupported } from 'liquid-glass-filter';
import '../backgrounds/particles.js';
import { cssColor } from '../lib/colors.js';
import { registry, type BackgroundType, type Colors } from '../lib/extensions.js';
import { look } from '../lib/look.js';
import { GLASS_STYLES } from '../lib/panel-glass.js';

/** Calm frames are this far apart: 30 a second. */
const CALM_MS = 1000 / 30;

@customElement('page-backdrop')
export class PageBackdrop extends LitElement {
  protected createRenderRoot() { return this; }

  #backdrop?: HTMLElement;
  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;
  /** The background being drawn, if any. */
  #bg?: BackgroundType;
  #colors: Colors = { particle: 'gray', accent: 'gray', accent2: 'gray', accent3: 'gray', ink: 'black', muted: 'gray', bg: 'white' };
  #w = 0;
  #h = 0;
  #dpr = 1;
  #pointer: { x: number; y: number } | null = null;
  #pointerRaf = 0;
  #pointerTimer = 0;
  #raf = 0;
  #calm = false;
  /** The pointer has moved since the glow was last put under it. */
  #glowDue = false;
  #start = 0;
  #last = 0;
  #shown = '';
  // the canvas' own size, so window resizes, zoom and side panels opening are all caught
  #sizeObserver = new ResizeObserver(() => this.#resize());

  firstUpdated() {
    this.#backdrop = this.querySelector<HTMLElement>('.backdrop') ?? undefined;
    this.#canvas = this.querySelector('canvas') ?? undefined;
    this.#ctx = this.#canvas?.getContext('2d') ?? undefined;
    if (!this.#ctx) return;
    this.#sizeObserver.observe(this.#canvas!);
    addEventListener('pointermove', this.#onPointer, { passive: true });
    addEventListener('pointerout', this.#onPointerOut);
    look.addEventListener('change', this.#onLook);
    registry.addEventListener('change', this.#onLook);
    this.#onLook();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.#raf);
    cancelAnimationFrame(this.#pointerRaf);
    clearTimeout(this.#pointerTimer);
    this.#sizeObserver.disconnect();
    removeEventListener('pointermove', this.#onPointer);
    removeEventListener('pointerout', this.#onPointerOut);
    look.removeEventListener('change', this.#onLook);
    registry.removeEventListener('change', this.#onLook);
  }

  /** The background chosen — falling back to the particles while (or if) an extension's isn't there. */
  #chosen() {
    const id = look.background;
    if (id === 'still' || id === 'plain') return undefined;
    return registry.backgrounds.get(id) ?? registry.backgrounds.get('particles');
  }

  #onLook = () => {
    if (!this.#canvas) return;
    this.#calm = GLASS_STYLES.includes(look.style) && isLiquidGlassSupported();
    document.documentElement.toggleAttribute('data-calm', this.#calm);
    const bg = this.#chosen();
    const shown = [look.theme, look.style, look.reducedMotion, bg?.name, JSON.stringify(look.colors)].join();
    if (shown === this.#shown && bg === this.#bg) return;
    this.#shown = shown;
    if (bg !== this.#bg) {
      this.#bg = bg;
      this.#start = performance.now();
      this.#safely(() => bg?.setup?.({ width: this.#w, height: this.#h }));
    }
    // the canvas' CSS `color` is var(--particle); the rest are worked out as they stand in this style and theme
    // (some are mixed from others, which a canvas can't do itself)
    this.#colors = {
      particle: getComputedStyle(this.#canvas).color, accent: cssColor('--accent'), accent2: cssColor('--accent-2'),
      accent3: cssColor('--accent-3'), ink: cssColor('--ink'), muted: cssColor('--muted'), bg: cssColor('--bg'),
    };
    this.#restart();
  };

  #onPointer = (e: PointerEvent) => {
    this.#pointer = { x: e.clientX, y: e.clientY };
    if (!this.#calm) {
      // the glow + reveal are positioned with CSS variables, updated at most once a frame
      this.#pointerRaf ||= requestAnimationFrame(() => {
        this.#pointerRaf = 0;
        this.#glow();
      });
      return;
    }
    // calm: with the backdrop's frames if they're running, else on a calm schedule of its own
    this.#glowDue = true;
    if (this.#raf) return;
    this.#pointerTimer ||= window.setTimeout(() => {
      this.#pointerTimer = 0;
      this.#glow();
    }, CALM_MS);
  };

  /** Put the glow (and the particles' reveal) under the pointer. */
  #glow() {
    this.#glowDue = false;
    const b = this.#backdrop;
    if (!b || !this.#pointer) return;
    b.style.setProperty('--cx', `${this.#pointer.x}px`);
    b.style.setProperty('--cy', `${this.#pointer.y}px`);
    b.toggleAttribute('data-pointer', true);
    if (look.reducedMotion) this.#draw(0);
  }

  // relatedTarget is null when the pointer leaves the window
  #onPointerOut = (e: PointerEvent) => {
    if (e.relatedTarget) return;
    this.#pointer = null;
    this.#backdrop?.removeAttribute('data-pointer');
  };

  #resize() {
    const canvas = this.#canvas!, ctx = this.#ctx!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.#w = canvas.clientWidth || innerWidth;
    this.#h = canvas.clientHeight || innerHeight;
    this.#dpr = dpr;
    canvas.width = Math.round(this.#w * dpr);
    canvas.height = Math.round(this.#h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#safely(() => this.#bg?.setup?.({ width: this.#w, height: this.#h }));
    this.#draw(0);
  }

  #restart() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#draw(0);
    if (!this.#bg || look.reducedMotion) return;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#frame);
  }

  #frame = (now: number) => {
    this.#raf = this.#bg ? requestAnimationFrame(this.#frame) : 0;
    // calm: every other frame, with all the backdrop's motion together
    if (this.#calm && now - this.#last < CALM_MS - 2) return;
    // dragged to a screen with different scaling: same CSS size, so no resize event
    if (Math.min(devicePixelRatio || 1, 2) !== this.#dpr) this.#resize();
    const dt = Math.min((now - this.#last) / 16.67, 3); // frame-rate independent movement
    this.#last = now;
    this.#draw(dt);
    if (this.#calm) {
      if (this.#glowDue) this.#glow();
      // Neon's floor, which otherwise runs as a CSS animation of its own (looks.css)
      this.#backdrop?.style.setProperty('--floor', String(((now - this.#start) / 3200) % 1));
    }
  };

  #draw(dt: number) {
    const ctx = this.#ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.#w, this.#h);
    const bg = this.#bg;
    if (!bg) return;
    ctx.save();
    this.#safely(() => bg.draw(ctx, {
      width: this.#w, height: this.#h, time: performance.now() - this.#start, dt,
      pointer: this.#pointer, colors: this.#colors, still: look.reducedMotion,
    }));
    ctx.restore();
  }

  /** A background that throws stops drawing, rather than throwing every frame. */
  #safely(run: () => void) {
    try {
      run();
    } catch (err) {
      console.error(`Launchpad: the "${this.#bg?.name}" background stopped —`, err);
      this.#bg = undefined;
      cancelAnimationFrame(this.#raf);
    }
  }

  render() {
    return html`
      <div class="backdrop" aria-hidden="true">
        <div class="backdrop-art">
          <div class="stripes"></div>
          <div class="blob blob-1"></div>
          <div class="blob blob-2"></div>
          <div class="blob blob-3"></div>
          <div class="blob blob-4"></div>
        </div>
        <div class="cursor-glow"></div>
        <canvas></canvas>
        <div class="grain"></div>
      </div>
    `;
  }
}
