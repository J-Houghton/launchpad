// src/app-shell.ts
// The page: header, then its sections laid out on a 12-column grid (see lib/layout.ts), then the footer.
import { LitElement, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import './components/page-backdrop.js';
import './components/site-header.js';
import './components/hero-section.js';
import './components/clock-widget.js';
import './components/weather-widget.js';
import './components/quick-dock.js';
import './components/app-main.js';
import './components/added-widgets.js';
import './components/site-footer.js';
import './components/tile-menu.js';
import './components/settings-panel.js';
import './components/setup-guide.js';
import { arrangeTools, gridGuides, resizeHandle } from './components/arrange-ui.js';
import { config, sectionName, type SectionId } from './config.js';
import { arrange } from './lib/arrange.js';
import { safeMode } from './lib/custom-css.js';
import { startExtensions } from './lib/extensions.js';
import { health } from './lib/health.js';
import { layoutStyle, moveAmong, place } from './lib/layout.js';
import type { SortMove } from './lib/sortable.js';
import { StoreController } from './lib/store-controller.js';
import { toast } from './lib/util.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  protected createRenderRoot() { return this; } // keep light DOM

  constructor() {
    super();
    new StoreController(this, config, arrange);
  }

  connectedCallback() {
    super.connectedCallback();
    health.start();
    startExtensions();
    if (safeMode && (config.look.css || config.extensions.length)) toast('Safe mode: the page\'s custom CSS and extensions are off');
  }

  #content(id: SectionId) {
    switch (id) {
      case 'greeting': return html`<hero-section></hero-section>`;
      case 'clock': return html`<clock-widget class="widget glass enter" style="--i:3"></clock-widget>`;
      case 'weather': return html`<weather-widget class="widget glass enter" style="--i:4"></weather-widget>`;
      case 'pinned': return html`<quick-dock kind="pinned"></quick-dock>`;
      case 'recent': return html`<quick-dock kind="recent"></quick-dock>`;
      case 'cards': return html`<app-main></app-main>`;
    }
    const added = config.widgets.added.find(w => w.id === id);
    if (added?.type === 'embed') return html`<embed-widget class="widget glass enter" style="--i:5" .widget=${added}></embed-widget>`;
    if (added?.type === 'data') return html`<data-widget class="widget glass enter" style="--i:5" .widget=${added}></data-widget>`;
    if (added?.type === 'extension') return html`<extension-widget class="widget glass enter" style="--i:5" .widget=${added}></extension-widget>`;
    return nothing;
  }

  #onMove = ({ from, to, by }: SortMove) => arrange.edit(d => {
    const sections = d.layout.sections;
    moveAmong(sections, sections.filter(s => !s.hidden), from.index, to.index);
  }, by === 'keyboard');

  render() {
    const arranging = arrange.active;
    const placed = place(config.layout.sections.filter(s => !s.hidden));
    return html`
      <page-backdrop></page-backdrop>
      <site-header></site-header>
      <main class="page layout-grid" id="main" data-sort-list="sections" data-sort-axis="grid">
        ${arranging ? gridGuides() : nothing}
        ${repeat(placed, p => p.item.id, (p, i) => {
          const { id } = p.item;
          return html`
            <div class="layout-item section-${id}" data-section=${id} data-sort-item ?data-row-start=${p.rowStart}
                 style=${layoutStyle(p, arranging ? `section-${id}` : '')}>
              ${arranging ? arrangeTools({
                name: sectionName(config, id), placement: p.item, placed: p.span, first: i === 0,
                target: d => d.layout.sections.find(s => s.id === id),
                onMove: this.#onMove,
                // the cards are the page; everything else can step aside
                onHide: id === 'cards' ? undefined : () => arrange.edit(d => { d.layout.sections.find(s => s.id === id)!.hidden = true; }),
              }) : nothing}
              ${arranging ? resizeHandle({
                name: sectionName(config, id), placement: p.item, placed: p.span, target: d => d.layout.sections.find(s => s.id === id),
              }) : nothing}
              <div class="layout-body" ?inert=${arranging && id !== 'cards'}>${this.#content(id)}</div>
            </div>`;
        })}
      </main>
      <site-footer></site-footer>
      <tile-menu></tile-menu>
      <settings-panel></settings-panel>
      <setup-guide></setup-guide>
      <arrange-bar></arrange-bar>
    `;
  }
}
