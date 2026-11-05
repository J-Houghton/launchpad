// src/components/app-main.ts
// The cards: each one a name, links and tiles — flowing tiles (projects, bookmarks), or one tile
// per column when the page lines them up. A row of more than four scrolls sideways. Cards sit on
// the same 12-column grid as the page's sections, so two half-width cards share a row.
import { LitElement, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { config, tileKey, type Card, type Tile } from '../config.js';
import { prefs } from '../lib/prefs.js';
import { health, healthLabel } from '../lib/health.js';
import { arrange } from '../lib/arrange.js';
import { layoutStyle, moveCard, place, type Placed } from '../lib/layout.js';
import type { SortMove } from '../lib/sortable.js';
import { StoreController } from '../lib/store-controller.js';
import { transition, vtName } from '../lib/transition.js';
import {
  ChevronDown, ChevronLeft, ChevronRight, Ellipsis, Eye, EyeOff, Pin, Plus, RefreshCw, Rocket, Sparkles, icon, linkIcon,
} from '../lib/icons.js';
import { initials } from '../lib/util.js';
import { onTileContextMenu, openTileMenu, tileTitle } from './tile-menu.js';
import { GALLERY_AFTER } from './tile-gallery.js';
import { arrangeTools, resizeHandle } from './arrange-ui.js';
import { openSettings } from './settings-panel.js';
import { openSetupGuide } from './setup-guide.js';

@customElement('app-main')
export class AppMain extends LitElement {
  protected createRenderRoot() { return this; }

  #pointer = { x: 0, y: 0 };
  #raf = 0;

  constructor() {
    super();
    new StoreController(this, config, prefs, health, arrange);
  }

  // every card tracks the cursor, so the glow spills across neighbouring cards too
  #onPointerMove = (e: PointerEvent) => {
    this.#pointer = { x: e.clientX, y: e.clientY };
    this.#raf ||= requestAnimationFrame(this.#spotlight);
  };

  #spotlight = () => {
    this.#raf = 0;
    for (const card of this.querySelectorAll<HTMLElement>('.app-card')) {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${this.#pointer.x - r.left}px`);
      card.style.setProperty('--my', `${this.#pointer.y - r.top}px`);
    }
  };

  #tile(card: Card, tile: Tile) {
    const key = tileKey(card, tile);
    const h = health.get(key);
    const open = () => transition(() => prefs.recordOpen(key));
    const { primary } = tileTitle({ key, card, tile });
    return html`
      <li class="env-tile" data-env data-tile=${tile.id} data-column=${tile.column ?? nothing}
          style=${tile.fixedColor ? `--tile-color:${tile.color}` : ''} ?data-caution=${tile.caution}>
        <a class="env-link" href=${tile.url} target="_blank" rel="noopener"
           @click=${open}
           @auxclick=${(e: MouseEvent) => e.button === 1 && open()}
           @contextmenu=${onTileContextMenu(key)}>
          <span class="env-row">
            ${tile.label ? html`<span class="env-tag">${tile.label}</span>` : nothing}
            <span class="status-dot" data-state=${h.state} ?data-pending=${h.pending} title=${healthLabel(h)}></span>
            ${prefs.isPinned(key) ? html`<span class="env-pinned" title="Pinned">${icon(Pin)}</span>` : nothing}
          </span>
          ${tile.name ? html`<span class="env-name">${tile.name}</span>` : nothing}
          <span class="env-host">${tile.host}</span>
          <span class="visually-hidden">${healthLabel(h)}</span>
        </a>
        <button class="env-more" type="button" aria-label="More actions for ${primary} ${tile.label}"
                aria-haspopup="dialog" title="More actions"
                @click=${(e: MouseEvent) => openTileMenu(key, e.currentTarget as HTMLElement)}>
          ${icon(Ellipsis)}
        </button>
      </li>
    `;
  }

  /** A row of tiles: a plain grid, or past GALLERY_AFTER a gallery that scrolls sideways (see tile-gallery.ts). */
  #row(kind: 'env-grid' | 'tile-grid', card: Card, items: unknown[], sync?: string) {
    if (items.length <= GALLERY_AFTER) return html`<ul class=${kind}>${items}</ul>`;
    // the arrows are for pointers; keyboard focus already scrolls each tile into view as it's reached
    return html`
      <tile-gallery data-sync=${sync ?? nothing}>
        <button class="gallery-btn prev" type="button" tabindex="-1" aria-hidden="true" data-gallery-step="-1"
                title="Scroll back">${icon(ChevronLeft)}</button>
        <ul class="${kind} gallery-track" aria-label="${card.name}: ${items.length} tiles">${items}</ul>
        <button class="gallery-btn next" type="button" tabindex="-1" aria-hidden="true" data-gallery-step="1"
                title="Scroll for more">${icon(ChevronRight)}</button>
      </tile-gallery>`;
  }

  #tiles(card: Card) {
    const inColumns = card.tiles.filter(t => t.column);
    const others = card.tiles.filter(t => !t.column);
    return html`
      ${inColumns.length ? this.#row('env-grid', card, config.columns.map(def => {
        const tile = inColumns.find(t => t.column === def.id);
        // an empty slot keeps each column in its place from card to card
        return tile ? this.#tile(card, tile) : html`<li class="env-empty" aria-hidden="true">No ${def.label}</li>`;
      }), 'columns') : nothing}
      ${others.length ? this.#row('tile-grid', card, others.map(t => this.#tile(card, t))) : nothing}
    `;
  }

  // a card dragged (or moved with the arrow keys) in Arrange mode; lists are "cards:<group id>"
  #onMove = ({ from, to, by }: SortMove) => arrange.edit(d => moveCard(d,
    { group: from.list.slice(6), index: from.index },
    { group: to.list.slice(6), index: to.index },
  ), by === 'keyboard');

  #card(p: Placed<Card>, i: number, first: boolean) {
    const card = p.item;
    const arranging = arrange.active;
    // its colour follows its place in the config (so it doesn't shift when others are hidden): the hue is
    // worked out from --card-index in apps.css, where custom CSS can override it
    return html`
      <article class="app-card glass enter layout-item" data-card=${card.id} data-sort-item ?data-row-start=${p.rowStart}
               style="--i:${8 + i}; --card-index:${config.cards.indexOf(card)}; ${layoutStyle(p, arranging ? vtName('card', card.id) : '')}"
               aria-labelledby="card-${card.id}">
        ${arranging ? arrangeTools({
          name: card.name, placement: card, placed: p.span, first,
          target: d => d.cards.find(c => c.id === card.id),
          onMove: this.#onMove,
        }) : nothing}
        ${arranging ? resizeHandle({
          name: card.name, placement: card, placed: p.span, target: d => d.cards.find(c => c.id === card.id),
        }) : nothing}
        <div class="app-layout" ?inert=${arranging}>
          <div class="app-info">
            <span class="app-mark" aria-hidden="true">${card.badge || initials(card.name)}</span>
            <div class="app-heading">
              <h3 class="app-title" id="card-${card.id}">${card.name}</h3>
              ${card.description ? html`<p class="app-strap">${card.description}</p>` : nothing}
              ${card.links.length ? html`
                <div class="app-docs">
                  ${card.links.map(link => html`
                    <a class="icon-pill" href=${link.url} target="_blank" rel="noopener" title=${link.label}>
                      ${icon(linkIcon(link))}<span class="label">${link.label}</span>
                    </a>`)}
                </div>` : nothing}
            </div>
          </div>
          ${card.tiles.length ? html`<div class="card-tiles">${this.#tiles(card)}</div>` : nothing}
        </div>
      </article>
    `;
  }

  /** Cards on the grid — one group's, or all of them when there are no groups ('' = no group). */
  #grid(cards: Card[], group: string, start: number, cls: string) {
    return html`
      <div class="${cls} layout-grid" data-sort-list="cards:${group}" data-sort-group="cards" data-sort-axis="grid">
        ${repeat(place(cards), p => p.item.id, (p, i) => this.#card(p, start + i, i === 0))}
      </div>`;
  }

  // a collapsible group of cards; collapsing is remembered per browser (My view), and undone while arranging
  #group(id: string, name: string, cards: Card[], start: number) {
    const collapsed = !arrange.active && prefs.isCollapsed(id);
    return html`
      <section class="app-group" data-group=${id === '__other' ? 'other' : id} ?data-collapsed=${collapsed} aria-label=${name}>
        <button class="group-head enter" type="button" style="--i:${8 + start}" aria-expanded=${String(!collapsed)}
                @click=${() => transition(() => prefs.toggleCollapsed(id))}>
          ${icon(ChevronDown)}
          <span class="group-name">${name}</span>
          <span class="count">${cards.length}</span>
          <span class="group-rule" aria-hidden="true"></span>
        </button>
        ${collapsed ? nothing : this.#grid(cards, id === '__other' ? '' : id, start, 'group-apps')}
      </section>
    `;
  }

  #list(cards: Card[]) {
    if (!config.groups.length) return this.#grid(cards, '', 0, 'card-grid');
    const sections = [
      ...config.groups.map(g => ({ id: g.id, name: g.name, cards: cards.filter(c => c.group === g.id) })),
      { id: '__other', name: 'Other', cards: cards.filter(c => !c.group) },
    ].filter(s => s.cards.length);
    let start = 0;
    return sections.map(s => {
      const out = this.#group(s.id, s.name, s.cards, start);
      start += s.cards.length;
      return out;
    });
  }

  render() {
    const { up, checked, total, pending } = health.summary;
    const allUp = checked > 0 && up === total;
    // arranging is about the page, not your view of it, so every card shows
    const cards = arrange.active ? config.cards : config.cards.filter(c => !prefs.isHidden(c.id));
    const hidden = config.cards.length - cards.length;
    const heading = config.site.heading.trim();
    return html`
      <section class="apps" aria-labelledby="cards-title" style="--env-count:${Math.max(config.columns.length, 1)}">
        <div class="section-head enter" style="--i:7">
          <h2 id="cards-title" class=${heading ? '' : 'visually-hidden'}>
            ${heading || 'Links'} ${heading ? html`<span class="count">${cards.length}</span>` : nothing}
          </h2>
          ${hidden ? html`
            <button class="hidden-note" type="button" @click=${() => openSettings('view')}>
              ${icon(EyeOff)} ${hidden} hidden
            </button>` : nothing}
          ${total ? html`
            <div class="health-pill glass" role="status">
              <span class="status-dot ping" data-state=${checked === 0 ? 'unknown' : allUp ? 'up' : 'down'}
                    ?data-pending=${checked === 0}></span>
              <span>${checked === 0 ? 'Checking links…' : `${up} of ${total} reachable`}</span>
              <button class="icon-btn sm ${pending ? 'spinning' : ''}" type="button"
                      aria-label="Re-check all links" title="Re-check all"
                      @click=${() => health.checkAll()}>${icon(RefreshCw)}</button>
            </div>` : nothing}
        </div>
        ${cards.length ? html`
          <div class="apps-list" @pointermove=${this.#onPointerMove}>${this.#list(cards)}</div>`
        : config.cards.length ? html`
          <div class="apps-empty glass">
            <p>Every card is hidden in your view.</p>
            <button class="btn btn-soft" type="button" @click=${() => openSettings('view')}>${icon(Eye)} Show them again</button>
          </div>`
        : html`
          <div class="apps-empty glass">
            ${icon(Rocket, 'apps-empty-icon')}
            <h3>Let's set up your page</h3>
            <p>Add your projects, apps or favourite links, sorted into cards — about a minute.</p>
            <div class="apps-empty-actions">
              <button class="btn btn-primary" type="button" @click=${() => openSetupGuide()}>${icon(Sparkles)} Start the setup guide</button>
              <button class="btn btn-ghost" type="button" @click=${() => openSettings('cards')}>${icon(Plus)} Add cards in settings</button>
            </div>
          </div>`}
      </section>
    `;
  }
}
