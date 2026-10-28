// src/components/page-backdrop.ts
// Fixed full-page atmosphere: drifting color blobs, a particle constellation and film grain.
// The cursor carries a soft glow, pushes nearby particles aside, links to them, and — in the
// Classic palette, where particles are otherwise kept to the margins — reveals them around it.
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';

type Particle = { x: number; y: number; vx: number; vy: number; r: number };

const LINK_DIST = 130;     // px — particles closer than this get joined by a line
const POINTER_DIST = 240;  // px — particles closer than this to the cursor reach for it
const REPEL_DIST = 140;    // px — particles closer than this drift away from the cursor

@customElement('page-backdrop')
export class PageBackdrop extends LitElement {
  protected createRenderRoot() { return this; }

  #backdrop?: HTMLElement;
  #canvas?: HTMLCanvasElement;
  #ctx?: CanvasRenderingContext2D;
  #parts: Particle[] = [];
  #w = 0;
  #h = 0;
  #pointer = { x: -1e4, y: -1e4 };
  #pointerRaf = 0;
  #color = 'gray';
  #raf = 0;
  #last = 0;
  #dpr = 1;
  #reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  #themeObserver = new MutationObserver(() => this.#readColor());
  // the canvas' own size, so window resizes, zoom and side panels opening are all caught
  #sizeObserver = new ResizeObserver(() => this.#resize());

  firstUpdated() {
    this.#backdrop = this.querySelector<HTMLElement>('.backdrop') ?? undefined;
    this.#canvas = this.querySelector('canvas') ?? undefined;
    this.#ctx = this.#canvas?.getContext('2d') ?? undefined;
    if (!this.#ctx) return;
    this.#readColor();
    this.#resize();
    this.#sizeObserver.observe(this.#canvas!);
    addEventListener('pointermove', this.#onPointer, { passive: true });
    addEventListener('pointerout', this.#onPointerOut);
    this.#themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-palette'] });
    this.#reduceMotion.addEventListener('change', this.#restart);
    this.#restart();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.#raf);
    cancelAnimationFrame(this.#pointerRaf);
    this.#sizeObserver.disconnect();
    removeEventListener('pointermove', this.#onPointer);
    removeEventListener('pointerout', this.#onPointerOut);
    this.#themeObserver.disconnect();
    this.#reduceMotion.removeEventListener('change', this.#restart);
  }

  // the canvas' CSS `color` is set to var(--particle), so this picks up theme changes
  #readColor() {
    if (!this.#canvas) return;
    this.#color = getComputedStyle(this.#canvas).color;
    if (this.#reduceMotion.matches) this.#draw();
  }

  #onPointer = (e: PointerEvent) => {
    this.#pointer = { x: e.clientX, y: e.clientY };
    // the glow + reveal are positioned with CSS variables, updated at most once a frame
    this.#pointerRaf ||= requestAnimationFrame(() => {
      this.#pointerRaf = 0;
      const b = this.#backdrop;
      if (!b) return;
      b.style.setProperty('--cx', `${this.#pointer.x}px`);
      b.style.setProperty('--cy', `${this.#pointer.y}px`);
      b.toggleAttribute('data-pointer', true);
      if (this.#reduceMotion.matches) this.#draw();
    });
  };

  // relatedTarget is null when the pointer leaves the window
  #onPointerOut = (e: PointerEvent) => {
    if (e.relatedTarget) return;
    this.#pointer = { x: -1e4, y: -1e4 };
    this.#backdrop?.removeAttribute('data-pointer');
  };

  #spawn(): Particle {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.12 + Math.random() * 0.22;
    return {
      x: Math.random() * this.#w, y: Math.random() * this.#h,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: 0.8 + Math.random() * 1.6,
    };
  }

  #resize() {
    const canvas = this.#canvas!, ctx = this.#ctx!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    // stretch the constellation to the new size, rather than leaving particles stranded
    // where the old edges were (they'd bunch up against the sides as they wrap back in)
    if (this.#w && this.#h) {
      for (const p of this.#parts) {
        p.x *= w / this.#w;
        p.y *= h / this.#h;
      }
    }
    this.#w = w;
    this.#h = h;
    this.#dpr = dpr;
    canvas.width = Math.round(this.#w * dpr);
    canvas.height = Math.round(this.#h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(110, (this.#w * this.#h) / 14_000));
    while (this.#parts.length < target) this.#parts.push(this.#spawn());
    this.#parts.length = target;
    this.#draw();
  }

  #restart = () => {
    cancelAnimationFrame(this.#raf);
    if (this.#reduceMotion.matches) return this.#draw();
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#frame);
  };

  #frame = (now: number) => {
    // dragged to a screen with different scaling: same CSS size, so no resize event
    if (Math.min(devicePixelRatio || 1, 2) !== this.#dpr) this.#resize();
    const dt = Math.min((now - this.#last) / 16.67, 3); // frame-rate independent movement
    this.#last = now;
    const { x: px, y: py } = this.#pointer;
    for (const p of this.#parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // drift away from the cursor, so it clears a little space as it moves
      const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
      if (d < REPEL_DIST && d > 0.5) {
        const push = (1 - d / REPEL_DIST) * 1.8 * dt;
        p.x += (dx / d) * push;
        p.y += (dy / d) * push;
      }
      // wrap around the edges
      if (p.x < -10) p.x = this.#w + 10; else if (p.x > this.#w + 10) p.x = -10;
      if (p.y < -10) p.y = this.#h + 10; else if (p.y > this.#h + 10) p.y = -10;
    }
    this.#draw();
    this.#raf = requestAnimationFrame(this.#frame);
  };

  #draw() {
    const ctx = this.#ctx, parts = this.#parts;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.#w, this.#h);
    ctx.strokeStyle = ctx.fillStyle = this.#color;
    const { x: px, y: py } = this.#pointer;

    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      ctx.lineWidth = 1;
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK_DIST) this.#line(a.x, a.y, b.x, b.y, (1 - d / LINK_DIST) * 0.2);
      }
      const dp = Math.hypot(a.x - px, a.y - py);
      if (dp < POINTER_DIST) {
        ctx.lineWidth = 1.25;
        this.#line(a.x, a.y, px, py, (1 - dp / POINTER_DIST) * 0.6);
      }
    }

    // dots near the cursor glow brighter and a little bigger
    for (const p of parts) {
      const near = Math.max(0, 1 - Math.hypot(p.x - px, p.y - py) / POINTER_DIST);
      ctx.globalAlpha = 0.5 + near * 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + near * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  #line(x1: number, y1: number, x2: number, y2: number, alpha: number) {
    const ctx = this.#ctx!;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
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
