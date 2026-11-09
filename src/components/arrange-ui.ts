// src/components/arrange-ui.ts
// Arrange mode's controls: a small toolbar on each section and card (move, width, new row, hide), a handle
// on its right edge to drag its width, faint guides for the 12 columns, and the bar along the bottom
// (density, hidden sections, Cancel / Save). See lib/arrange.ts.
import { LitElement, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { config, sectionName, type Density, type Placement } from '../config.js';
import { arrange } from '../lib/arrange.js';
import { GRID, SPANS, setNewRow, setSpan, spanAt } from '../lib/layout.js';
import { dragToReorder, keyboardReorder, type SortMove } from '../lib/sortable.js';
import { controlGlass, segmentedGlass } from '../lib/glass-controls.js';
import { StoreController } from '../lib/store-controller.js';
import { Check, CornerDownLeft, EyeOff, GripVertical, LayoutGrid, MoveHorizontal, Plus, Save, icon } from '../lib/icons.js';

const DENSITIES: { id: Density; label: string }[] = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
];

type Tools = {
  name: string;
  /** The item's own settings, and the span it works out to. */
  placement: Placement;
  placed: number;
  /** The first item can't share a row with anything before it. */
  first: boolean;
  /** Finds the item in arrange's draft, to change it. */
  target: (draft: typeof arrange.draft) => Placement | undefined;
  onMove: (move: SortMove) => void;
  onHide?: () => void;
};

/** The toolbar on a section or card while arranging. */
export function arrangeTools(t: Tools) {
  const newRow = t.placement.newRow !== false;
  const edit = (change: (p: Placement) => void) => arrange.edit(d => { const p = t.target(d); if (p) change(p); });
  return html`
    <div class="arrange-tools" role="group" aria-label="Arrange ${t.name}">
      <button class="drag-handle" type="button" data-sort-handle title="Drag to move"
              aria-label="Move ${t.name} — drag, or use the arrow keys"
              @pointerdown=${(e: PointerEvent) => dragToReorder(e, t.onMove)}
              @keydown=${(e: KeyboardEvent) => keyboardReorder(e, t.onMove)}>${icon(GripVertical)}</button>
      <span class="arrange-name">${t.name}</span>
      <label class="arrange-width" title="Width: how many of the 12 columns it takes. Auto shares what's left of the row.">
        ${icon(MoveHorizontal)}
        <select aria-label="Width of ${t.name}, out of 12 columns"
                @change=${(e: Event) => edit(p => setSpan(p, (e.target as HTMLSelectElement).value))}>
          <option value="" ?selected=${!t.placement.span}>Auto</option>
          ${SPANS.map(s => html`<option value=${s} ?selected=${t.placement.span === s}>${s}</option>`)}
        </select>
      </label>
      <button class="arrange-btn" type="button" aria-pressed=${String(newRow)} ?disabled=${t.first}
              aria-label="Start a new row" title=${newRow ? 'Starts a new row — click to share the row before' : 'Shares the row before — click to start a new row'}
              @click=${() => edit(p => setNewRow(p, !newRow))}>${icon(CornerDownLeft)}</button>
      ${t.onHide ? html`
        <button class="arrange-btn" type="button" title="Hide" aria-label="Hide ${t.name}" @click=${t.onHide}>${icon(EyeOff)}</button>` : nothing}
    </div>`;
}

/**
 * The handle on an item's right edge: drag it to set the width, snapping to the columns, or use the arrow keys.
 * Only on wide screens, where widths are used as set (styles/layout.css).
 */
export function resizeHandle(t: Pick<Tools, 'name' | 'placement' | 'placed' | 'target'>) {
  const set = (span: number, animate: boolean) =>
    arrange.edit(d => { const p = t.target(d); if (p) setSpan(p, String(span)); }, animate);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const handle = e.currentTarget as HTMLElement;
    const item = handle.closest<HTMLElement>('.layout-item');
    const grid = item?.parentElement;
    if (!item || !grid) return;
    e.preventDefault();
    // measured once: if it wraps to the next row part-way, the drag still reads from where it began
    const left = item.getBoundingClientRect().left;
    let span = t.placed;
    handle.setPointerCapture(e.pointerId);
    item.toggleAttribute('data-resizing', true);
    const move = (ev: PointerEvent) => {
      const next = spanAt(grid, left, ev.clientX);
      if (next !== span) set((span = next), false);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      item.removeAttribute('data-resizing');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end, { once: true });
    handle.addEventListener('pointercancel', end, { once: true });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, Home: -GRID, End: GRID }[e.key];
    if (!step) return;
    e.preventDefault();
    set(Math.min(GRID, Math.max(1, t.placed + step)), true);
  };

  return html`
    <div class="resize-handle" role="slider" tabindex="0" aria-label="Width of ${t.name}" aria-valuemin="1" aria-valuemax=${GRID}
         aria-valuenow=${t.placed} aria-valuetext="${t.placed} of ${GRID} columns${t.placement.span ? '' : ' (auto)'}"
         title="Drag to change the width" @pointerdown=${onPointerDown} @keydown=${onKeyDown}>
      <span class="resize-badge" aria-hidden="true">${t.placed}<small>/${GRID}</small></span>
    </div>`;
}

/** Faint guides for the grid's 12 columns, drawn behind its items while arranging. */
export const gridGuides = () => html`
  <div class="grid-guides" aria-hidden="true">
    ${SPANS.map(n => html`<span style="--n:${n}"></span>`)}
  </div>`;

@customElement('arrange-bar')
export class ArrangeBar extends LitElement {
  protected createRenderRoot() { return this; }

  constructor() {
    super();
    new StoreController(this, arrange, config);
  }

  connectedCallback() {
    super.connectedCallback();
    addEventListener('keydown', this.#onKey);
  }

  disconnectedCallback() {
    removeEventListener('keydown', this.#onKey);
    super.disconnectedCallback();
  }

  // Esc leaves (asking first if anything changed) — unless it's closing an open menu
  #onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && arrange.active && !(e.target as Element).closest?.('select, dialog')) arrange.cancel();
  };

  render() {
    if (!arrange.active) return nothing;
    const { density, sections } = config.layout;
    const hidden = sections.filter(s => s.hidden);
    return html`
      <div class="arrange-bar glass" role="toolbar" aria-label="Arrange the page" ${controlGlass('bar')}>
        <span class="arrange-title">${icon(LayoutGrid)} Arrange</span>
        <span class="arrange-hint">Drag to move · drag an edge to resize · ${icon(CornerDownLeft)} starts a new row</span>
        <div class="segmented sm" role="radiogroup" aria-label="Density" ${segmentedGlass()}>
          ${DENSITIES.map(d => html`
            <label><input type="radio" name="arrange-density" .checked=${density === d.id}
                          @change=${() => arrange.edit(draft => { draft.layout.density = d.id; })}>${d.label}</label>`)}
        </div>
        ${hidden.length ? html`
          <div class="arrange-hidden">
            <span>Hidden:</span>
            ${hidden.map(s => html`
              <button class="arrange-chip" type="button" title="Show ${sectionName(config, s.id)} again"
                      @click=${() => arrange.edit(draft => { delete draft.layout.sections.find(x => x.id === s.id)!.hidden; })}>
                ${icon(Plus)} ${sectionName(config, s.id)}
              </button>`)}
          </div>` : nothing}
        <div class="arrange-actions">
          <button class="btn btn-ghost btn-sm" type="button" @click=${arrange.cancel}>Cancel</button>
          <button class="btn btn-soft btn-sm" type="button" @click=${arrange.save}>${icon(Check)} Save</button>
          <button class="btn btn-primary btn-sm" type="button" @click=${arrange.saveToFile}>${icon(Save)} Save to file</button>
        </div>
      </div>
    `;
  }
}
