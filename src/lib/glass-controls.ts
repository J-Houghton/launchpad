// src/lib/glass-controls.ts
// Settings in liquid glass, in the styles drawn with it (Aurora, Liquid and Neon), after Apple's Liquid Glass
// and kube.io's components (kube.io/blog/liquid-glass-css-svg). As Apple has it, the sheet and what's written
// on it aren't glass; the controls are, floating over it:
//   controlGlass()    buttons, search fields, the bars a row of choices sits in, and menus: each glass of its own;
//                     a button swells and squishes under the pointer. A menu morphs out of the button that opens
//                     it (morphMenu).
//   segmentedGlass()  a row of choices, whose selection is a solid pill that lifts into a clear lens while it's
//                     held, slides along the choices under the pointer, and drops onto the one it's let go on.
//   glassSwitches()   switches whose thumb, held, swells into a clear lens over the track and can be slid
//                     across it (kube.io's switch).
//   sliderGlass()     a slider whose knob, held, does the same, showing the track through it (kube.io's slider).
// Chrome and Edge draw the lenses; other browsers get the same motion in frosted glass. Less motion holds it all
// still.
import { nothing } from 'lit';
import { AsyncDirective, PartType, directive, type ElementPart, type PartInfo } from 'lit/async-directive.js';
import {
  createGlassFilter, isLiquidGlassSupported, isSpringAtRest, springLinearEasing, springPhysics, stepSpring,
  type GlassFilterHandle, type GlassMotionOptions, type GlassParams, type SpringConfig, type SpringPhysics,
  type SpringState,
} from 'liquid-glass-filter';
import { Glass, lensHolder, type GlassSetup } from './glass.js';
import { look } from './look.js';
import { GLASS_STYLES } from './panel-glass.js';

/** Whether the page's style is drawn in glass. */
export const glassOn = () => GLASS_STYLES.includes(look.style);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A value that follows its target on a spring, a frame at a time. */
class Spring {
  state: SpringState;
  to: number;
  #physics: SpringPhysics;
  readonly #rest: { delta: number; speed: number };

  constructor(value: number, config: SpringConfig, rest = 0.002) {
    this.state = { value, velocity: 0 };
    this.to = value;
    this.#physics = springPhysics(config);
    this.#rest = { delta: rest, speed: rest * 10 };
  }

  get value() { return this.state.value; }
  get velocity() { return this.state.velocity; }
  get resting() { return isSpringAtRest(this.state, this.to, this.#rest); }
  step(dt: number) { this.state = stepSpring(this.state, this.to, dt, this.#physics); }
  /** Another spring from here on, keeping where it is and how fast it's going. */
  use(config: SpringConfig) { this.#physics = springPhysics(config); }
  snap(value = this.to) {
    this.to = value;
    this.state = { value, velocity: 0 };
  }
}

/** Calls `step` with each frame's seconds while it returns true. */
function frames(step: (dt: number) => boolean) {
  let id = 0;
  let last = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    id = step(dt) ? requestAnimationFrame(tick) : 0;
  };
  return {
    start() {
      if (id) return;
      last = performance.now();
      id = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(id);
      id = 0;
    },
  };
}

// ---- buttons, fields and menus ----

export type ControlKind = 'button' | 'field' | 'bar' | 'menu';

/** Small and rounded: a short bezel with a strong rim, frosted a little so the label on it reads. */
const BUTTON: Partial<GlassParams> = { bezelWidth: 12, displacementScale: 30, shade: 0.3, specularStrength: 1.2, blur: 0.6, blurStage: 'before' };
const FIELD: Partial<GlassParams> = { bezelWidth: 14, displacementScale: 32, shade: 0.25, specularStrength: 1, blur: 1, blurStage: 'before' };
/** The bar a row of choices sits in, which floats in the header (its selection moves; it doesn't). */
const BAR: Partial<GlassParams> = { bezelWidth: 14, displacementScale: 34, shade: 0.25, specularStrength: 1.1, blur: 0.8, blurStage: 'before' };
/** A menu is a panel of glass over the sheet: frostier, so its items read over whatever is behind. */
const MENU: Partial<GlassParams> = { bezelWidth: 18, displacementScale: 48, shade: 0.3, specularStrength: 1.1, blur: 4, blurStage: 'before' };

/** Pressed, a button swells and squishes, as Apple's interactive glass does; hovered, it rises a touch. */
const BUTTON_MOTION: GlassMotionOptions = {
  press: { scale: 1.08, dim: 0.9, spring: { duration: 0.35, bounce: 0.35 } },
  hover: { scale: 1.025, spring: { duration: 0.35, bounce: 0.2 } },
  drag: { maxStretch: 0.08, maxSkew: 4 },
};
/** A field gives a little under the pointer instead. */
const FIELD_MOTION: GlassMotionOptions = { press: { scale: 0.985, dim: 1, spring: { duration: 0.3, bounce: 0.2 } }, drag: false };

/** Maps are small for these: a control is small, and its rim smooth. */
const CONTROL_MAP_PIXELS = 12_000;

class ControlGlassDirective extends AsyncDirective {
  #element?: HTMLElement;
  #kind: ControlKind = 'button';
  #on = true;
  #glass?: Glass;
  #listening = false;
  #sync = () => this.#apply();

  constructor(part: PartInfo) {
    super(part);
    if (part.type !== PartType.ELEMENT) throw new Error('controlGlass() goes on an element');
  }

  render(_kind?: ControlKind, _on?: boolean) { return nothing; }

  update(part: ElementPart, [kind = 'button', on = true]: [ControlKind?, boolean?]) {
    this.#element = part.element as HTMLElement;
    this.#kind = kind;
    this.#on = on;
    if (this.isConnected) this.#listen(true);
    this.#apply();
    return nothing;
  }

  #listen(on: boolean) {
    if (on === this.#listening) return;
    this.#listening = on;
    if (on) look.addEventListener('change', this.#sync);
    else look.removeEventListener('change', this.#sync);
  }

  #setup(): GlassSetup | undefined {
    if (!glassOn() || !this.#on) return undefined;
    const kind = this.#kind;
    return {
      params: { button: BUTTON, field: FIELD, bar: BAR, menu: MENU }[kind],
      mapPixels: CONTROL_MAP_PIXELS,
      light: {},
      motion: { button: BUTTON_MOTION, field: FIELD_MOTION, bar: false, menu: false }[kind],
      reducedMotion: look.reducedMotion,
    };
  }

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

/**
 * Glass on a control, in the styles that have it: `<button class="btn" ${controlGlass('button', shown)}>`. With
 * `on` false (its dialog is closed, say), it has none, and nothing is spent on it.
 */
export const controlGlass = directive(ControlGlassDirective);

/** A menu opening grows out of the button that opened it, settling with a little bounce. */
const MORPH = springLinearEasing({ duration: 0.45, bounce: 0.22 });

/**
 * For a popover's `beforetoggle` and `toggle` events: as it opens, it morphs out of the button that opened it (the
 * one whose popovertarget names it), growing from that button's size and place to its own, and its items fade in
 * once it has room for them. In the styles with glass, and with motion.
 */
export function morphMenu(e: Event) {
  const menu = e.currentTarget as HTMLElement;
  const morph = (e as ToggleEvent).newState === 'open' && glassOn() && !look.reducedMotion;
  if (e.type === 'beforetoggle') {
    // kept out of sight until it can be measured, so it's never seen at full size before it grows
    if (morph) menu.style.visibility = 'hidden';
    return;
  }
  menu.style.visibility = '';
  if (!morph) return;
  const trigger = menu.ownerDocument.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(menu.id)}"]`);
  if (!trigger) return;
  const from = trigger.getBoundingClientRect();
  const to = menu.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  // the button's corners, as they'd be drawn scaled up to the menu's size
  const r = Math.min(parseFloat(getComputedStyle(trigger).borderTopLeftRadius) || 0, from.height / 2, from.width / 2);
  menu.animate([
    {
      transformOrigin: '0 0',
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`,
      borderRadius: `${r / sx}px / ${r / sy}px`,
    },
    { transformOrigin: '0 0', transform: 'none' },
  ], { duration: MORPH.durationMs, easing: MORPH.easing });
  for (const item of menu.children) {
    (item as HTMLElement).animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: Math.min(400, MORPH.durationMs) });
  }
}

// ---- a row of choices ----

const ITEMS = ':scope > label, :scope > [role="tab"]';
const isChosen = (item: Element) => item.getAttribute('aria-selected') === 'true' || !!item.querySelector('input:checked');

/** The lens the selection lifts into: clear, with a bright rim, zooming in a little on the choice under it. */
const DROP: Partial<GlassParams> = { bezelWidth: 8, displacementScale: 8, magnify: 6, shade: 0.12, specularStrength: 1.3, blur: 0, tint: 0 };
/** How much bigger than the choice the lifted lens is, all round, px. */
const DROP_PAD = 7;
/** Sliding to a choice, and lifting. */
const SLIDE: SpringConfig = { duration: 0.42, bounce: 0.22 };
const FOLLOW: SpringConfig = { duration: 0.18, bounce: 0.1 };
const LIFT: SpringConfig = { duration: 0.32, bounce: 0.3 };

/**
 * The glass selection of one row of choices (radio buttons in labels, or tabs). The row keeps working as it
 * always has (keyboard included); this only draws the selection, and lets the pointer drag it.
 */
class Segmented {
  readonly #el: HTMLElement;
  readonly #plate = document.createElement('span');
  readonly #lens = document.createElement('span');
  #glass?: Glass;
  #x = new Spring(0, SLIDE, 0.05);
  #w = new Spring(0, SLIDE, 0.05);
  readonly #lift = new Spring(0, LIFT);
  #box = { top: 0, height: 0, lensWidth: 0 };
  #held?: { id: number; startX: number; moved: boolean };
  #placed = false;
  #swallow = false;
  #ours = false;
  readonly #frames = frames(dt => this.#frame(dt));
  readonly #resize = new ResizeObserver(() => this.sync(true));

  constructor(el: HTMLElement) {
    this.#el = el;
    this.#plate.className = 'seg-plate';
    this.#lens.className = 'seg-lens';
    for (const span of [this.#plate, this.#lens]) span.setAttribute('aria-hidden', 'true');
    el.prepend(this.#plate);
    el.append(this.#lens);
    el.addEventListener('pointerdown', this.#down);
    el.addEventListener('pointermove', this.#move);
    el.addEventListener('pointerup', this.#up);
    el.addEventListener('pointercancel', this.#up);
    el.addEventListener('click', this.#click, true);
    el.addEventListener('change', this.#changed);
    look.addEventListener('change', this.#look);
    this.#resize.observe(el);
    this.#look();
  }

  get #on() { return this.#el.hasAttribute('data-glass-seg'); }

  #items() { return [...this.#el.querySelectorAll<HTMLElement>(ITEMS)]; }

  #look = () => {
    const on = glassOn();
    this.#el.toggleAttribute('data-glass-seg', on);
    if (!on) {
      this.#glass?.destroy();
      this.#glass = undefined;
    }
    this.sync(true);
  };

  #changed = () => this.sync();

  /** Move the selection to the chosen one: at once the first time (or with `snap`), else sliding there. */
  sync(snap = false) {
    if (!this.#on) return;
    const chosen = this.#items().find(isChosen);
    this.#plate.hidden = !chosen;
    if (!chosen || this.#held) return;
    this.#box.top = chosen.offsetTop;
    this.#box.height = chosen.offsetHeight;
    const x = chosen.offsetLeft;
    const w = chosen.offsetWidth;
    if (snap || !this.#placed || look.reducedMotion) {
      this.#x.snap(x);
      this.#w.snap(w);
      this.#placed = w > 0;
      this.#draw();
      return;
    }
    if (this.#x.to === x && this.#w.to === w) return;
    this.#x.to = x;
    this.#w.to = w;
    this.#frames.start();
  }

  /** The choice nearest the pointer, across. */
  #itemAt(clientX: number) {
    let best: HTMLElement | undefined;
    let gap = Infinity;
    for (const item of this.#items()) {
      const r = item.getBoundingClientRect();
      const d = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (d < gap) {
        gap = d;
        best = item;
      }
    }
    return best;
  }

  #down = (e: PointerEvent) => {
    if (!this.#on || e.button !== 0 || this.#held || look.reducedMotion) return;
    const items = this.#items();
    if (!items.length || (e.target as Element).closest('input:disabled')) return;
    this.#held = { id: e.pointerId, startX: e.clientX, moved: false };
    // the row keeps the pointer, so the drag can leave a choice; the choosing happens on letting go
    this.#el.setPointerCapture(e.pointerId);
    if (!this.#glass) this.#readyLens(items);
    // held, it keeps up with the pointer
    this.#x.use(FOLLOW);
    this.#w.use(FOLLOW);
    this.#lift.to = 1;
    this.#follow(e.clientX);
    this.#frames.start();
  };

  /**
   * The lens is made the first time it's wanted: as big as the widest choice, so it's never made again. Where the
   * browser can't draw it, it's frosted.
   */
  #readyLens(items: HTMLElement[]) {
    const widest = Math.max(...items.map(i => i.offsetWidth));
    this.#box.lensWidth = widest + DROP_PAD * 2;
    this.#lens.style.width = `${this.#box.lensWidth}px`;
    this.#lens.style.height = `${this.#box.height + DROP_PAD * 2}px`;
    this.#glass = new Glass(this.#lens, { params: DROP, light: {}, mapPixels: 6000 });
  }

  #move = (e: PointerEvent) => {
    const held = this.#held;
    if (held?.id !== e.pointerId) return;
    if (Math.abs(e.clientX - held.startX) > 4) held.moved = true;
    this.#follow(e.clientX);
    this.#frames.start();
  };

  /** Held, the selection follows the pointer along the row, as wide as the choice it's over. */
  #follow(clientX: number) {
    const items = this.#items();
    const item = this.#itemAt(clientX)!;
    const first = items[0];
    const last = items[items.length - 1];
    const left = this.#el.getBoundingClientRect().left + this.#el.clientLeft - this.#el.scrollLeft;
    const w = item.offsetWidth;
    this.#w.to = w;
    this.#x.to = clamp(clientX - left - w / 2, first.offsetLeft, last.offsetLeft + last.offsetWidth - w);
  }

  #up = (e: PointerEvent) => {
    if (this.#held?.id !== e.pointerId) return;
    this.#held = undefined;
    this.#x.use(SLIDE);
    this.#w.use(SLIDE);
    this.#lift.to = 0;
    if (e.type === 'pointerup') {
      // the browser's own click lands on the row (it kept the pointer), so the choosing is done here
      this.#swallow = true;
      setTimeout(() => (this.#swallow = false));
      const item = this.#itemAt(e.clientX);
      if (item && !isChosen(item)) {
        this.#ours = true;
        item.click();
        this.#ours = false;
      }
    }
    this.sync();
    this.#frames.start();
  };

  #click = (e: MouseEvent) => {
    if (!this.#swallow || this.#ours) return;
    this.#swallow = false;
    e.preventDefault();
    e.stopPropagation();
  };

  #frame(dt: number) {
    this.#x.step(dt);
    this.#w.step(dt);
    this.#lift.step(dt);
    const still = !this.#held && this.#x.resting && this.#w.resting && this.#lift.resting;
    if (still) {
      this.#x.snap();
      this.#w.snap();
      this.#lift.snap();
    }
    this.#draw();
    return !still;
  }

  #draw() {
    const x = this.#x.value;
    const w = this.#w.value;
    const lift = clamp(this.#lift.value, 0, 1.25);
    const { top, height, lensWidth } = this.#box;
    // on its way, it stretches along the way it's going (the morph), more the faster it goes
    const stretch = Math.min(0.28, Math.abs(this.#x.velocity) / 2400);
    const plate = this.#plate.style;
    plate.translate = `${x}px ${top}px`;
    plate.width = `${w}px`;
    plate.height = `${height}px`;
    plate.scale = stretch > 0.002 ? `${1 + stretch} ${1 - stretch / 2}` : '';
    plate.opacity = String(clamp(1 - lift * 1.4, 0, 1));
    const lens = this.#lens.style;
    // put away, it's hidden and draws nothing (the browser would still bend what's under a hidden glass)
    const lifted = lift >= 0.01 && lensWidth > 0;
    this.#lens.toggleAttribute('data-lifted', lifted);
    if (!lifted) return;
    lens.opacity = String(clamp(lift * 1.6, 0, 1));
    const s = 0.82 + 0.18 * lift;
    lens.translate = `${x + w / 2 - lensWidth / 2}px ${top - DROP_PAD}px`;
    lens.scale = `${s * ((w + DROP_PAD * 2) / lensWidth) * (1 + stretch)} ${s * (1 - stretch / 2)}`;
  }

  destroy() {
    this.#frames.stop();
    this.#resize.disconnect();
    look.removeEventListener('change', this.#look);
    this.#el.removeEventListener('pointerdown', this.#down);
    this.#el.removeEventListener('pointermove', this.#move);
    this.#el.removeEventListener('pointerup', this.#up);
    this.#el.removeEventListener('pointercancel', this.#up);
    this.#el.removeEventListener('click', this.#click, true);
    this.#el.removeEventListener('change', this.#changed);
    this.#el.removeAttribute('data-glass-seg');
    this.#glass?.destroy();
    this.#plate.remove();
    this.#lens.remove();
  }
}

class SegmentedGlassDirective extends AsyncDirective {
  #element?: HTMLElement;
  #row?: Segmented;

  constructor(part: PartInfo) {
    super(part);
    if (part.type !== PartType.ELEMENT) throw new Error('segmentedGlass() goes on an element');
  }

  render() { return nothing; }

  update(part: ElementPart) {
    this.#element = part.element as HTMLElement;
    if (this.isConnected) {
      this.#row ??= new Segmented(this.#element);
      // once the rest of the template has been written: which one is chosen may have changed with it
      const row = this.#row;
      queueMicrotask(() => row.sync());
    }
    return nothing;
  }

  protected disconnected() {
    this.#row?.destroy();
    this.#row = undefined;
  }

  protected reconnected() {
    if (this.#element) this.#row = new Segmented(this.#element);
  }
}

/** A glass selection on a row of choices: `<div class="segmented" role="radiogroup" ${segmentedGlass()}>`. */
export const segmentedGlass = directive(SegmentedGlassDirective);

// ---- switches ----

/**
 * The thumb's lens (kube.io's switch): a lip bezel, raised at the rim and dipped in the middle, so through the
 * middle the track shows a little smaller and round the rim it bends. One filter serves every switch, since only
 * the one being held is ever clear. Its size is the thumb's at full size (styles/settings.css).
 */
const THUMB: Partial<GlassParams> = {
  width: 48, height: 32, radius: 16, bezelWidth: 9, surface: 'lip', displacementScale: 20, specularStrength: 1.1, blur: 0.2, tint: 0,
};
/** The thumb's size at rest and held, of full size; the clear lens bends less at rest (kube.io: 0.4 to 0.9). */
const THUMB_REST = 0.62;
const THUMB_HELD = 0.95;
const THUMB_SPRING: SpringConfig = { duration: 0.32, bounce: 0.3 };
const THUMB_SLIDE: SpringConfig = { duration: 0.3, bounce: 0.18 };
/** Dragged past an end, it gives this much of the overshoot (kube.io: 1/22). */
const THUMB_GIVE = 1 / 22;

let thumbLens: GlassFilterHandle | undefined;
const thumbFilter = () => (thumbLens ??= createGlassFilter(lensHolder(), { ...THUMB, maxMapPixels: 8000 }));

class SwitchMotion {
  readonly input: HTMLInputElement;
  readonly x: Spring;
  readonly scale = new Spring(THUMB_REST, THUMB_SPRING);
  readonly clear = new Spring(0, THUMB_SPRING);
  held?: { id: number; startX: number; from: number; moved: boolean; travel: number };
  readonly frames = frames(dt => this.frame(dt));

  constructor(input: HTMLInputElement) {
    this.input = input;
    this.x = new Spring(input.checked ? 1 : 0, THUMB_SLIDE);
  }

  press(e: PointerEvent) {
    const input = this.input;
    this.held = {
      id: e.pointerId, startX: e.clientX, from: input.checked ? 1 : 0, moved: false,
      travel: parseFloat(getComputedStyle(input).getPropertyValue('--thumb-travel')) || 16,
    };
    input.setPointerCapture(e.pointerId);
    this.x.snap(this.held.from);
    this.scale.to = THUMB_HELD;
    this.clear.to = 1;
    this.frames.start();
  }

  move(e: PointerEvent) {
    const held = this.held;
    if (held?.id !== e.pointerId) return;
    const dx = e.clientX - held.startX;
    if (Math.abs(dx) > 4) held.moved = true;
    const at = held.from + dx / held.travel;
    const over = at < 0 ? at : at > 1 ? at - 1 : 0;
    this.x.to = clamp(at, 0, 1) + over * THUMB_GIVE;
    this.frames.start();
  }

  release(e: PointerEvent) {
    const held = this.held;
    if (held?.id !== e.pointerId) return;
    this.held = undefined;
    this.scale.to = THUMB_REST;
    this.clear.to = 0;
    const input = this.input;
    if (held.moved && e.type === 'pointerup') {
      // slid: it lands on the side it's nearer, and the click that follows mustn't flip it back
      const on = this.x.to > 0.5;
      swallowClick(input);
      if (on !== input.checked) {
        input.checked = on;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    // a plain click: the browser flips it, and its change sends the thumb across (see changed)
    this.x.to = input.checked ? 1 : 0;
    this.frames.start();
  }

  /** Flipped (by a click, a key, or the slide): the thumb goes across. */
  changed() {
    if (this.held) return;
    this.x.to = this.input.checked ? 1 : 0;
    this.frames.start();
  }

  frame(dt: number) {
    this.x.step(dt);
    this.scale.step(dt);
    this.clear.step(dt);
    const still = !this.held && this.x.resting && this.scale.resting && this.clear.resting;
    const style = this.input.style;
    if (still) {
      // at rest, the stylesheet places it by whether it's checked
      for (const p of ['--thumb-x', '--thumb-s', '--thumb-clear', '--thumb-lens']) style.removeProperty(p);
      delete this.input.dataset.thumb;
      return false;
    }
    this.input.dataset.thumb = '';
    const clear = clamp(this.clear.value, 0, 1);
    style.setProperty('--thumb-x', this.x.value.toFixed(4));
    style.setProperty('--thumb-s', this.scale.value.toFixed(4));
    style.setProperty('--thumb-clear', clear.toFixed(3));
    if (clear > 0.01 && isLiquidGlassSupported()) {
      const lens = thumbFilter();
      style.setProperty('--thumb-lens', lens.url);
      // it bends more as it lifts
      if (Math.abs(lens.intensity - (0.45 + 0.55 * clear)) > 0.02) void lens.setIntensity(0.45 + 0.55 * clear);
    } else {
      style.removeProperty('--thumb-lens');
    }
    return true;
  }
}

/** The click a slide ends with lands on the switch; it's dropped, so the slide decides. */
function swallowClick(input: HTMLInputElement) {
  const drop = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  input.addEventListener('click', drop, { capture: true, once: true });
  setTimeout(() => input.removeEventListener('click', drop, { capture: true }));
}

/**
 * The glass switches of everything under `root` (Settings): `input.switch` checkboxes. They stay checkboxes,
 * keys and labels included; holding one lifts its thumb into a lens that can be slid across.
 */
export function glassSwitches(root: HTMLElement) {
  const motions = new WeakMap<HTMLInputElement, SwitchMotion>();
  const of = (input: HTMLInputElement) => {
    let m = motions.get(input);
    if (!m) motions.set(input, (m = new SwitchMotion(input)));
    return m;
  };
  const isSwitch = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.classList.contains('switch');
  const live = () => glassOn() && !look.reducedMotion;
  root.addEventListener('pointerdown', e => {
    if (isSwitch(e.target) && !e.target.disabled && e.button === 0 && live()) of(e.target).press(e);
  });
  root.addEventListener('pointermove', e => {
    if (isSwitch(e.target)) motions.get(e.target)?.move(e);
  });
  for (const type of ['pointerup', 'pointercancel'] as const) {
    root.addEventListener(type, e => {
      if (isSwitch(e.target)) motions.get(e.target)?.release(e);
    });
  }
  root.addEventListener('change', e => {
    if (isSwitch(e.target) && live()) of(e.target).changed();
  });
}

// ---- sliders ----

/**
 * The knob's lens (kube.io's slider): a convex squircle, so the middle shows the track (the hue, the level) a
 * little larger and the rim bends it.
 */
const KNOB: Partial<GlassParams> = { bezelWidth: 10, displacementScale: 14, magnify: 6, shade: 0.1, specularStrength: 1.2, blur: 0, tint: 0 };
/** The knob is 44 × 30 at full size (styles/settings.css), and 0.6 of that at rest (kube.io: 0.6 to 1). */
const KNOB_WIDTH = 44;
const KNOB_REST = 0.6;
const KNOB_FOLLOW: SpringConfig = { duration: 0.12, bounce: 0 };

class GlassSlider {
  readonly #el: HTMLElement;
  readonly #knob = document.createElement('span');
  #glass?: Glass;
  readonly #x = new Spring(0, KNOB_FOLLOW, 0.05);
  readonly #scale = new Spring(KNOB_REST, THUMB_SPRING);
  readonly #clear = new Spring(0, THUMB_SPRING);
  #held = false;
  readonly #frames = frames(dt => this.#frame(dt));
  readonly #resize = new ResizeObserver(() => this.place(true));

  constructor(el: HTMLElement) {
    this.#el = el;
    this.#knob.className = 'slider-knob';
    this.#knob.setAttribute('aria-hidden', 'true');
    el.append(this.#knob);
    el.addEventListener('input', this.#moved);
    el.addEventListener('pointerdown', this.#down);
    look.addEventListener('change', this.#look);
    this.#resize.observe(el);
    this.#look();
  }

  get #on() { return this.#el.hasAttribute('data-glass-slider'); }

  #look = () => {
    const on = glassOn();
    this.#el.toggleAttribute('data-glass-slider', on);
    if (!on) {
      this.#glass?.destroy();
      this.#glass = undefined;
    }
    this.place(true);
  };

  #moved = () => this.place();

  /** Over the value: where the browser's own (unseen) knob is, which is as wide as this one at rest. */
  place(snap = false) {
    const input = this.#el.querySelector<HTMLInputElement>('input[type="range"]');
    if (!input || !this.#on) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const at = (Number(input.value) - min) / (max - min || 1);
    const half = (KNOB_WIDTH * KNOB_REST) / 2;
    const x = half + at * (input.offsetWidth - half * 2);
    if (snap || look.reducedMotion) {
      this.#x.snap(x);
      this.#draw();
    } else {
      this.#x.to = x;
      this.#frames.start();
    }
  }

  #down = (e: PointerEvent) => {
    if (e.button !== 0 || !this.#on || look.reducedMotion) return;
    // glass from the first time it's held: a picker that's never used costs nothing
    this.#glass ??= new Glass(this.#knob, { params: KNOB, light: {}, mapPixels: 4000 });
    this.#held = true;
    this.#scale.to = 1;
    this.#clear.to = 1;
    this.#frames.start();
    const up = () => {
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      this.#held = false;
      this.#scale.to = KNOB_REST;
      this.#clear.to = 0;
      this.#frames.start();
    };
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  };

  #frame(dt: number) {
    this.#x.step(dt);
    this.#scale.step(dt);
    this.#clear.step(dt);
    this.#draw();
    return this.#held || !(this.#x.resting && this.#scale.resting && this.#clear.resting);
  }

  #draw() {
    const style = this.#knob.style;
    style.translate = `${this.#x.value}px 0`;
    style.scale = String(this.#scale.value);
    style.setProperty('--clear', clamp(this.#clear.value, 0, 1).toFixed(3));
  }

  destroy() {
    this.#frames.stop();
    this.#resize.disconnect();
    look.removeEventListener('change', this.#look);
    this.#el.removeEventListener('input', this.#moved);
    this.#el.removeEventListener('pointerdown', this.#down);
    this.#el.removeAttribute('data-glass-slider');
    this.#glass?.destroy();
    this.#knob.remove();
  }
}

class SliderGlassDirective extends AsyncDirective {
  #element?: HTMLElement;
  #slider?: GlassSlider;

  constructor(part: PartInfo) {
    super(part);
    if (part.type !== PartType.ELEMENT) throw new Error('sliderGlass() goes on an element');
  }

  render() { return nothing; }

  update(part: ElementPart) {
    this.#element = part.element as HTMLElement;
    if (this.isConnected) {
      this.#slider ??= new GlassSlider(this.#element);
      // once the input inside has its new value
      const slider = this.#slider;
      queueMicrotask(() => slider.place());
    }
    return nothing;
  }

  protected disconnected() {
    this.#slider?.destroy();
    this.#slider = undefined;
  }

  protected reconnected() {
    if (this.#element) this.#slider = new GlassSlider(this.#element);
  }
}

/** A glass knob for the range input inside: `<div class="slider-glass" ${sliderGlass()}><input type="range"></div>`. */
export const sliderGlass = directive(SliderGlassDirective);
