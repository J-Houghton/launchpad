// src/lib/layout.ts
// The 12-column grid that sections and cards sit on, worked out the way Oracle APEX does it:
// every item starts a new row unless it says otherwise, a fixed span takes that many columns,
// and items without one share what's left of their row equally. When a row is full, the next
// item wraps. The CSS (styles/layout.css) applies it at three sizes:
//   wide   — as placed;
//   medium — anything a third wide or less goes half width, the rest full width;
//   narrow — a quarter or less (like the clock and weather) goes half width, the rest full width.
import type { LaunchpadConfig, Placement } from '../config.js';

export const GRID = 12;

export type Placed<T> = { item: T; span: number; spanMedium: number; spanNarrow: number; rowStart: boolean };

export function place<T extends Placement>(items: T[]): Placed<T>[] {
  const rows: T[][] = [];
  const needs = (row: T[]) => row.reduce((n, x) => n + (x.span ?? 1), 0);
  for (const item of items) {
    const row = rows.at(-1);
    if (!row || item.newRow !== false || needs(row) + (item.span ?? 1) > GRID) rows.push([item]);
    else row.push(item);
  }
  return rows.flatMap(row => {
    const autos = row.filter(x => !x.span).length;
    const free = GRID - row.reduce((n, x) => n + (x.span ?? 0), 0);
    let extra = autos ? free % autos : 0;
    return row.map((item, i) => {
      const span = item.span ?? Math.floor(free / autos) + (extra-- > 0 ? 1 : 0);
      const half = (most: number) => (span <= most ? GRID / 2 : GRID);
      return { item, span, spanMedium: half(GRID / 3), spanNarrow: half(GRID / 4), rowStart: i === 0 };
    });
  });
}

/** A placed item's style attribute: its spans at each size, and a name while arranging so moves glide. */
export const layoutStyle = (p: Placed<unknown>, vt?: string) =>
  `--span:${p.span}; --span-md:${p.spanMedium}; --span-sm:${p.spanNarrow}${vt ? `; view-transition-name:${vt}` : ''}`;

/** The widths offered in menus, after Auto: 1 to 12 columns. */
export const SPANS = Array.from({ length: GRID }, (_, i) => i + 1);

/** The span under the pointer, for an item whose left edge is at `left`, dragged out to `x` (see arrange-ui.ts). */
export function spanAt(grid: HTMLElement, left: number, x: number) {
  const cs = getComputedStyle(grid);
  const gap = parseFloat(cs.columnGap) || 0;
  const inner = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const column = (inner - gap * (GRID - 1)) / GRID;
  return Math.min(GRID, Math.max(1, Math.round((x - left + gap) / (column + gap))));
}

/** Set an item's width from a menu value: '' for Auto, or a span. */
export function setSpan(p: Placement, value: string) {
  const span = Number(value);
  if (span >= 1 && span <= GRID) p.span = span; else delete p.span;
}

export function setNewRow(p: Placement, on: boolean) {
  if (on) delete p.newRow; else p.newRow = false;
}

/**
 * Move an item when only some of `list` is on show (sections that aren't hidden, say): `shown`
 * is what's displayed, in order, and `to` is a position in it once the item has been taken out.
 */
export function moveAmong<T>(list: T[], shown: T[], from: number, to: number) {
  const item = shown[from];
  if (!item) return;
  list.splice(list.indexOf(item), 1);
  const rest = shown.filter(x => x !== item);
  const before = rest[to];
  if (before) list.splice(list.indexOf(before), 0, item);
  else if (rest.length) list.splice(list.indexOf(rest[rest.length - 1]) + 1, 0, item);
  else list.push(item);
}

/** Move a card from one group's list to a place in another's ('' = no group). Only the order within a group matters. */
export function moveCard(draft: LaunchpadConfig, from: { group: string; index: number }, to: { group: string; index: number }) {
  const cardsIn = (group: string) => draft.cards.filter(c => (c.group ?? '') === group);
  const card = cardsIn(from.group)[from.index];
  if (!card) return;
  draft.cards.splice(draft.cards.indexOf(card), 1);
  if (to.group) card.group = to.group; else delete card.group;
  const peers = cardsIn(to.group);
  const before = peers[to.index];
  if (before) draft.cards.splice(draft.cards.indexOf(before), 0, card);
  else if (peers.length) draft.cards.splice(draft.cards.indexOf(peers[peers.length - 1]) + 1, 0, card);
  else draft.cards.push(card);
}
