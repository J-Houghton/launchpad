// src/components/color-picker.ts
// A colour picker drawn in the page's own style, in place of the browser's: a square for how strong and how
// bright, a strip for the hue, and the hex code to type or paste. Each change goes to its host as a "pick"
// event (detail: #rrggbb), at most once a frame while dragging.
import { LitElement, html, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fromHsv, toHsv } from '../lib/colors.js';

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

@customElement('color-picker')
export class ColorPicker extends LitElement {
  protected createRenderRoot() { return this; }

  /** The colour, as #rrggbb. */
  @property() value = '#000000';
  /** What it's the colour of, for screen readers. */
  @property() label = 'Colour';

  // kept apart from `value`, so a grey doesn't lose its hue, or black its strength, as you drag through them
  @state() private h = 0;
  @state() private s = 0;
  @state() private v = 0;
  /** A hex code part-typed into the box. */
  @state() private typed?: string;
  /** The colour h, s and v were last taken from, or sent as. */
  #had = '';
  #frame = 0;

  protected willUpdate(changed: PropertyValues<this>) {
    if (!changed.has('value') || this.value === this.#had) return;
    const { h, s, v } = toHsv(this.value);
    if (s > 0 && v > 0) this.h = h;
    if (v > 0) this.s = s;
    this.v = v;
    this.#had = this.value;
    this.typed = undefined;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.#frame);
  }

  get #hex() { return fromHsv(this.h, this.s, this.v); }

  /** Tell the host, once this frame. */
  #send() {
    this.#frame ||= requestAnimationFrame(() => {
      this.#frame = 0;
      const hex = this.#hex;
      if (hex === this.#had) return;
      this.#had = hex;
      this.dispatchEvent(new CustomEvent('pick', { detail: hex, bubbles: true }));
    });
  }

  #drag = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const area = e.currentTarget as HTMLElement;
    const at = (ev: PointerEvent) => {
      const r = area.getBoundingClientRect();
      this.s = clamp((ev.clientX - r.left) / r.width);
      this.v = 1 - clamp((ev.clientY - r.top) / r.height);
      this.#send();
    };
    const stop = () => {
      area.removeEventListener('pointermove', at);
      area.removeEventListener('pointerup', stop);
      area.removeEventListener('pointercancel', stop);
    };
    e.preventDefault();
    area.setPointerCapture(e.pointerId);
    area.querySelector<HTMLElement>('.cp-thumb')?.focus({ preventScroll: true });
    area.addEventListener('pointermove', at);
    area.addEventListener('pointerup', stop);
    area.addEventListener('pointercancel', stop);
    at(e);
  };

  /** Arrow keys move the point in the square: a little, or more with Shift. */
  #nudge = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    this.s = clamp(this.s + move[0]);
    this.v = clamp(this.v + move[1]);
    this.#send();
  };

  #hue = (e: Event) => {
    this.h = Number((e.target as HTMLInputElement).value);
    this.#send();
  };

  #type = (e: Event) => {
    const text = (e.target as HTMLInputElement).value.trim();
    this.typed = text;
    const hex = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(text)?.[1];
    if (!hex) return;
    const full = `#${(hex.length === 3 ? [...hex].map(c => c + c).join('') : hex).toLowerCase()}`;
    const { h, s, v } = toHsv(full);
    if (s > 0 && v > 0) this.h = h;
    this.s = s;
    this.v = v;
    this.#send();
  };

  render() {
    const hex = this.#hex;
    return html`
      <div class="cp-area" style="--cp-hue: ${this.h}" @pointerdown=${this.#drag}>
        <span class="cp-thumb" tabindex="0" role="slider" aria-label="${this.label}: strength and brightness"
              aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(this.s * 100)}
              aria-valuetext="strength ${pct(this.s)}, brightness ${pct(this.v)}"
              style="left: ${this.s * 100}%; top: ${(1 - this.v) * 100}%; background: ${hex}"
              @keydown=${this.#nudge}></span>
      </div>
      <input class="cp-hue" type="range" min="0" max="359" step="1" aria-label="${this.label}: hue"
             .value=${String(Math.round(this.h))} @input=${this.#hue}>
      <div class="cp-foot">
        <span class="cp-now" style="background: ${hex}"></span>
        <input class="input mono cp-hex" spellcheck="false" autocomplete="off" maxlength="7" aria-label="${this.label}: hex code"
               .value=${this.typed ?? hex} @input=${this.#type} @change=${() => (this.typed = undefined)}>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'color-picker': ColorPicker }
}
