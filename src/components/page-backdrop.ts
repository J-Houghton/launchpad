// src/components/page-backdrop.ts
// Fixed full-page atmosphere: the style's backdrop (blobs of colour, or its pattern), a soft glow that
// follows the pointer, film grain, and a canvas for the background in use — the built-in particles
// (backgrounds/particles.ts) or one an extension adds (lib/extensions.ts). This runs its frames, sizes its
// canvas and tells it the colours, so a background only has to draw.
// The "still" background leaves the canvas out, and "plain" everything but the base colour.
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import '../backgrounds/particles.js';
import { registry, type BackgroundType, type Colors } from '../lib/extensions.js';
import { look } from '../lib/look.js';

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
  #raf = 0;
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
    const bg = this.#chosen();
    const shown = [look.theme, look.style, look.reducedMotion, bg?.name].join();
    if (shown === this.#shown && bg === this.#bg) return;
    this.#shown = shown;
    if (bg !== this.#bg) {
      this.#bg = bg;
      this.#start = performance.now();
      this.#safely(() => bg?.setup?.({ width: this.#w, height: this.#h }));
    }
    // the canvas' CSS `color` is var(--particle); the rest are read off it as they stand in this style and theme
    const cs = getComputedStyle(this.#canvas);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    this.#colors = {
      particle: cs.color, accent: v('--accent'), accent2: v('--accent-2'), accent3: v('--accent-3'),
      ink: v('--ink'), muted: v('--muted'), bg: v('--bg'),
    };
    this.#restart();
  };

  #onPointer = (e: PointerEvent) => {
    this.#pointer = { x: e.clientX, y: e.clientY };
    // the glow + reveal are positioned with CSS variables, updated at most once a frame
    this.#pointerRaf ||= requestAnimationFrame(() => {
      this.#pointerRaf = 0;
      const b = this.#backdrop;
      if (!b || !this.#pointer) return;
      b.style.setProperty('--cx', `${this.#pointer.x}px`);
      b.style.setProperty('--cy', `${this.#pointer.y}px`);
      b.toggleAttribute('data-pointer', true);
      if (look.reducedMotion) this.#draw(0);
    });
  };

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
    this.#draw(0);
    if (!this.#bg || look.reducedMotion) return;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#frame);
  }

  #frame = (now: number) => {
    // dragged to a screen with different scaling: same CSS size, so no resize event
    if (Math.min(devicePixelRatio || 1, 2) !== this.#dpr) this.#resize();
    const dt = Math.min((now - this.#last) / 16.67, 3); // frame-rate independent movement
    this.#last = now;
    this.#draw(dt);
    if (this.#bg) this.#raf = requestAnimationFrame(this.#frame);
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
