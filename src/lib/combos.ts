// src/lib/combos.ts
// Ready-made colour combos for each style, to start from in Settings → My view (then fine-tune any colour).
// A combo is just three hues: the accent's, the second accent's and the highlight's (styles/tokens.css
// --hue-1/2/3). The style keeps its own lightness and strength for each, in light and in dark, so a combo
// still looks like the style; tinted backgrounds, panels and text follow the accent's hue.
// Classic's hues are HSL hues; the others' are OKLCH hues.
import type { Style } from '../config.js';

export type Hues = [number, number, number];
export type Combo = { id: string; name: string; hues: Hues };

export const COMBOS: Record<Style, Combo[]> = {
  aurora: [
    { id: 'original', name: 'Aurora', hues: [300, 345, 70] },
    { id: 'lagoon', name: 'Lagoon', hues: [200, 250, 25] },
    { id: 'northern', name: 'Northern lights', hues: [155, 195, 300] },
    { id: 'sunset', name: 'Sunset', hues: [40, 355, 85] },
    { id: 'ocean', name: 'Ocean', hues: [255, 215, 150] },
    { id: 'berry', name: 'Berry', hues: [345, 300, 20] },
  ],
  liquid: [
    { id: 'original', name: 'Liquid', hues: [235, 300, 185] },
    { id: 'lagoon', name: 'Lagoon', hues: [195, 240, 160] },
    { id: 'orchid', name: 'Orchid', hues: [310, 350, 250] },
    { id: 'sunrise', name: 'Sunrise', hues: [35, 350, 85] },
    { id: 'mint', name: 'Mint', hues: [160, 200, 120] },
  ],
  classic: [
    { id: 'original', name: 'Classic', hues: [266, 38, 41.45] },
    { id: 'navy', name: 'Navy and gold', hues: [220, 38, 41.45] },
    { id: 'forest', name: 'Forest', hues: [150, 38, 41.45] },
    { id: 'burgundy', name: 'Burgundy', hues: [345, 38, 41.45] },
    { id: 'teal', name: 'Teal and copper', hues: [185, 15, 22] },
  ],
  blueprint: [
    { id: 'original', name: 'Blueprint', hues: [252, 215, 65] },
    { id: 'cyanotype', name: 'Cyanotype', hues: [215, 185, 85] },
    { id: 'green', name: 'Drafting green', hues: [160, 190, 60] },
    { id: 'violet', name: 'Violet', hues: [290, 250, 75] },
    { id: 'redline', name: 'Redline', hues: [25, 55, 250] },
  ],
  paper: [
    { id: 'original', name: 'Red ink', hues: [30, 28, 75] },
    { id: 'blue', name: 'Blue ink', hues: [255, 255, 75] },
    { id: 'green', name: 'Green ink', hues: [150, 150, 75] },
    { id: 'violet', name: 'Violet ink', hues: [305, 305, 60] },
    { id: 'teal', name: 'Teal and red', hues: [195, 30, 75] },
  ],
  neon: [
    { id: 'original', name: 'Neon', hues: [345, 215, 85] },
    { id: 'synthwave', name: 'Synthwave', hues: [300, 45, 85] },
    { id: 'toxic', name: 'Toxic', hues: [135, 330, 100] },
    { id: 'ice', name: 'Ice', hues: [215, 265, 180] },
    { id: 'inferno', name: 'Inferno', hues: [30, 60, 95] },
  ],
  bold: [
    { id: 'original', name: 'Bold', hues: [268, 355, 100] },
    { id: 'primary', name: 'Primary', hues: [25, 260, 100] },
    { id: 'tropical', name: 'Tropical', hues: [180, 30, 100] },
    { id: 'grape', name: 'Grape', hues: [305, 145, 100] },
    { id: 'citrus', name: 'Citrus', hues: [50, 145, 100] },
  ],
};

/** A style's own hues: its first combo. */
export const ownHues = (style: Style) => COMBOS[style][0].hues;

export const sameHues = (a?: readonly number[], b?: readonly number[]) => !!a && !!b && a.every((x, i) => x === b[i]);

/** The combo with these hues, if there is one. */
export const comboOf = (style: Style, hues = ownHues(style)) => COMBOS[style].find(c => sameHues(c.hues, hues));
