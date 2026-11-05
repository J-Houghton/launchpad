// src/lib/colors.ts
// Colours: your own (Settings → My view), or the page's ("colors" in the config's look). Each style keeps its
// own: a colour combo (three hues, lib/combos.ts), then any of its six colours picked one by one, with light and
// dark apart. They replace what a style is built from (styles/tokens.css), and its other colours (the glow,
// borders, particles…) follow from those, so the style still looks like itself.
//
// An inline script in index.html writes the same CSS before the first paint, so there's no flash.
// Keep the two in step.
import { COLOR_SLOTS, STYLES, isHex, normalizeColors, type ColorSlot, type StyleColors } from '../config.js';
import { ownHues, sameHues } from './combos.js';

const THEMES = ['light', 'dark'] as const;

export const COLOR_INFO: Record<ColorSlot, { name: string; hint: string }> = {
  bg: { name: 'Background', hint: 'Behind everything' },
  panel: { name: 'Panels', hint: 'Cards, tiles, menus and this window' },
  ink: { name: 'Text', hint: 'Words, and the softer text made from them' },
  accent: { name: 'Accent', hint: 'Buttons, links and focus rings, and most of the glow and particles' },
  'accent-2': { name: 'Second accent', hint: 'Gradients, and some of the glow' },
  'accent-3': { name: 'Highlight', hint: 'Small touches: the greeting\'s highlight, lines, and some of the glow' },
};

/** Two sets of colours as one, with `over`'s winning. */
export function mergeColors(under: StyleColors = {}, over: StyleColors = {}): StyleColors {
  const all: StyleColors = {};
  for (const style of STYLES) {
    const hues = over[style]?.hues ?? under[style]?.hues;
    if (hues) (all[style] ??= {}).hues = hues;
    // a combo starts the style afresh, so it leaves out the colours under it
    const fresh = !!over[style]?.hues;
    for (const theme of THEMES) {
      const colors = { ...(fresh ? {} : under[style]?.[theme]), ...over[style]?.[theme] };
      if (Object.keys(colors).length) (all[style] ??= {})[theme] = colors;
    }
  }
  return all;
}

/** `mine` without what `page` already has (or a style's own hues, when the page hasn't changed them). */
export function withoutPage(mine: StyleColors = {}, page: StyleColors = {}): StyleColors {
  const left = structuredClone(mine);
  for (const style of STYLES) {
    const own = left[style];
    // your combo matters while it's not what's there anyway, or the page has single colours it should leave out
    const covered = THEMES.every(theme => Object.entries(page[style]?.[theme] ?? {}).every(([slot, hex]) => own?.[theme]?.[slot as ColorSlot] === hex));
    if (own?.hues && covered && sameHues(own.hues, page[style]?.hues ?? ownHues(style))) delete own.hues;
    if (own?.hues) continue;
    for (const theme of THEMES) for (const slot of COLOR_SLOTS) {
      const colors = own?.[theme];
      if (colors?.[slot] && colors[slot] === page[style]?.[theme]?.[slot]) delete colors[slot];
    }
  }
  return normalizeColors(left);
}

/**
 * The CSS for a set of colours: a style's combo as its three hues, then a rule for each theme with colours
 * picked one by one. A combo's preview in Settings ([data-combo]) shows the combo alone.
 */
export function colorsCss(all: StyleColors) {
  const rules: string[] = [];
  for (const style of STYLES) {
    const hues = all[style]?.hues;
    if (hues) rules.push(`[data-style="${style}"] { ${hues.map((h, i) => `--hue-${i + 1}: ${h};`).join(' ')} }`);
    for (const theme of THEMES) {
      const c = all[style]?.[theme] ?? {};
      const set = COLOR_SLOTS.filter(slot => isHex(c[slot])).map(slot => `--${slot}: ${c[slot]};`);
      // softer text, mixed from the text and the background; and words on the accent, dark or light to suit it
      if (isHex(c.ink)) set.push(`--muted: color-mix(in oklab, ${c.ink} 72%, var(--bg));`, `--subtle: color-mix(in oklab, ${c.ink} 52%, var(--bg));`);
      if (isHex(c.accent)) set.push(`--accent-fg: oklch(from ${c.accent} clamp(0.15, (0.6 - l) * 1000, 0.99) 0 0);`);
      if (set.length) rules.push(`:root.theme-${theme}[data-style="${style}"], .theme-${theme} [data-style="${style}"]:not([data-combo]) { ${set.join(' ')} }`);
    }
  }
  return rules.join('\n');
}

/** A hex colour's place on the colour wheel and how bright it is: hue 0–360, saturation and value 0–1. */
export function toHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export function fromHsv(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

const ID = 'launchpad-colors';

/** Put colours on the page, in place of any that were there. */
export function showColors(css: string) {
  let style = document.getElementById(ID);
  if (!css) return style?.remove();
  if (!style) {
    style = Object.assign(document.createElement('style'), { id: ID });
    document.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

let probe: HTMLElement | undefined;
let pen: CanvasRenderingContext2D | null | undefined;

/** A colour variable as it stands on the page, worked out (e.g. "oklch(0.48 0.2 300)"). */
export function cssColor(name: string) {
  probe ??= Object.assign(document.createElement('i'), { hidden: true });
  if (!probe.isConnected) document.body.append(probe);
  probe.style.color = `var(${name})`;
  return getComputedStyle(probe).color;
}

/** Any CSS colour as #rrggbb, as a colour input wants it. */
export function toHex(color: string) {
  pen ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!pen) return '#000000';
  pen.clearRect(0, 0, 1, 1);
  pen.fillStyle = '#000';
  pen.fillStyle = color;
  pen.fillRect(0, 0, 1, 1);
  const [r, g, b] = pen.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/** The six colours as the page shows them now. */
export const shownColors = () =>
  Object.fromEntries(COLOR_SLOTS.map(slot => [slot, toHex(cssColor(`--${slot}`))])) as Record<ColorSlot, string>;

/** How readable one colour is on another: WCAG's contrast ratio, from 1 to 21. */
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
