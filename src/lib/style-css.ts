// src/lib/style-css.ts
// A style's CSS as the page has it now, to start custom CSS from (Settings → Edit page → Page → Custom CSS):
// its colours in light and in dark, its corners and its type, each line commented out so nothing changes until
// one is uncommented. The colours are the page's (its combo and colours from "Make it everyone's"), not anyone's
// own from My view.
import type { Style, StyleColors } from '../config.js';
import { toHex } from './colors.js';
import { ownHues } from './combos.js';
import { GLASS_STYLES } from './glass.js';

const COLOURS: [string, string][] = [
  ['--bg', 'behind everything'], ['--panel', 'cards and panels'], ['--ink', 'text'], ['--muted', 'softer text'],
  ['--accent', ''], ['--accent-2', ''], ['--accent-3', 'highlights'],
];
const SHAPES = ['--radius-sm', '--radius', '--radius-lg', '--border-w'];
const FONTS = ['--font-heading', '--font-display'];

/** A colour as CSS: #rrggbb, or rgb() with its alpha when it's see-through. */
function colour(css: string) {
  const hex = toHex(css);
  const alpha = /\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/.exec(css);
  const a = alpha ? Number(alpha[1] ?? alpha[2]) : 1;
  if (a >= 1) return hex;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${Math.round(a * 100) / 100})`;
}

/**
 * `style` as it stands in light and in dark: read from a hidden element wearing it, with the root switched to
 * each theme for a moment (in one go, so nothing is painted in between).
 */
function read(style: Style, colors: StyleColors) {
  const root = document.documentElement;
  const probe = Object.assign(document.createElement('i'), { hidden: true });
  probe.dataset.style = style;
  probe.dataset.combo = ''; // leaves out anyone's own colours (lib/colors.ts)
  (colors[style]?.hues ?? ownHues(style)).forEach((h, i) => probe.style.setProperty(`--hue-${i + 1}`, String(h)));
  document.body.append(probe);
  const was = { dark: root.classList.contains('theme-dark'), light: root.classList.contains('theme-light') };
  const value = (name: string) => getComputedStyle(probe).getPropertyValue(name).trim();
  const resolved = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  try {
    const themes = (['light', 'dark'] as const).map(theme => {
      root.classList.toggle('theme-dark', theme === 'dark');
      root.classList.toggle('theme-light', theme === 'light');
      const own = colors[style]?.[theme] ?? {};
      const names = [...COLOURS.map(([n]) => n), ...(GLASS_STYLES.includes(style) ? ['--lens-tint'] : [])];
      return names.map(name => [name, own[name.slice(2) as keyof typeof own] ?? colour(resolved(name))] as const);
    });
    const fonts = { sans: value('--font-sans'), serif: value('--font-serif'), mono: value('--font-mono') };
    const font = (name: string) => {
      const v = value(name);
      const which = (Object.keys(fonts) as (keyof typeof fonts)[]).find(k => fonts[k] === v);
      return which ? `var(--font-${which})` : v;
    };
    return {
      light: themes[0], dark: themes[1],
      shapes: SHAPES.map(name => [name, value(name)] as const),
      fonts: FONTS.map(name => [name, font(name)] as const),
    };
  } finally {
    root.classList.toggle('theme-dark', was.dark);
    root.classList.toggle('theme-light', was.light);
    probe.remove();
  }
}

/** The CSS of the page's style, every line commented out, with one of its own cards as an example. */
export function styleCss(style: Style, name: string, colors: StyleColors = {}, card?: string) {
  const s = read(style, colors);
  const note = (name: string) => COLOURS.find(([n]) => n === name)?.[1];
  const lines = (vars: readonly (readonly [string, string])[]) => vars.map(([n, v]) => {
    const line = `  /* ${n}: ${v}; */`;
    const why = note(n);
    return why ? `${line.padEnd(40)} /* ${why} */` : line;
  }).join('\n');
  const at = `[data-style="${style}"]`;
  return [
    `/* ${name}, as the page has it now. Uncomment a line and change it: the page behind shows it as you type.`,
    `   These are for ${name} only; the other styles keep their own. */`,
    '',
    `/* Colours in light */`,
    `:root.theme-light${at} {`, lines(s.light), '}',
    '',
    `/* Colours in dark */`,
    `:root.theme-dark${at} {`, lines(s.dark), '}',
    '',
    `/* Corners and type */`,
    `:root${at} {`, lines([...s.shapes, ...s.fonts]), '}',
    ...(card ? ['', '/* One card\'s colour: a hue from 0 to 360 */', `/* [data-card="${card}"] { --hue: 160; } */`] : []),
    '',
  ].join('\n');
}
