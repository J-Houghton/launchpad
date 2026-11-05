// src/components/quick-dock.ts
// Pinned or recently opened tiles — one panel, each its own section of the page.
import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { config, type TileRef } from '../config.js';
import { prefs } from '../lib/prefs.js';
import { health } from '../lib/health.js';
import { StoreController } from '../lib/store-controller.js';
import { transition, vtName } from '../lib/transition.js';
import { Clock, Ellipsis, Pin, X, icon } from '../lib/icons.js';
import { ago } from '../lib/util.js';
import { onTileContextMenu, tileTitle } from './tile-menu.js';

@customElement('quick-dock')
export class QuickDock extends LitElement {
  protected createRenderRoot() { return this; }

  @property() kind: 'pinned' | 'recent' = 'pinned';
  #tick = 0;

  constructor() {
    super();
    new StoreController(this, config, prefs, health);
  }

  connectedCallback() {
    super.connectedCallback();
    // refresh the "5m ago" labels
    this.#tick = window.setInterval(() => this.requestUpdate(), 60_000);
  }

  disconnectedCallback() {
    clearInterval(this.#tick);
    super.disconnectedCallback();
  }

  #open(ref: TileRef) {
    return () => transition(() => prefs.recordOpen(ref.key));
  }

  #chip(ref: TileRef, kind: 'pin' | 'recent', at = 0) {
    const { key, tile } = ref;
    // a column tile reads "Billing · DEV"; any other tile just by its own name
    const name = tile.column ? ref.card.name : tileTitle(ref).primary;
    const h = health.get(key);
    return html`
      <li class="chip-item" data-env style="--env:${tile.color}; --vt:${vtName(kind, key)}">
        <a class="chip" href=${tile.url} target="_blank" rel="noopener"
           title="${name}${tile.label ? ` ${tile.label}` : ''} · ${tile.host}"
           @click=${this.#open(ref)}
           @auxclick=${(e: MouseEvent) => e.button === 1 && this.#open(ref)()}
           @contextmenu=${onTileContextMenu(key)}>
          <span class="status-dot" data-state=${h.state} ?data-pending=${h.pending}></span>
          <span class="chip-app">${name}</span>
          ${tile.label ? html`<span class="chip-tag">${tile.label}</span>` : nothing}
          ${kind === 'recent' ? html`<span class="chip-time">${ago(at)}</span>` : nothing}
        </a>
        ${kind === 'pin' ? html`
          <button class="chip-x" type="button" aria-label="Unpin ${name} ${tile.label}" title="Unpin"
                  @click=${() => transition(() => prefs.togglePin(key))}>${icon(X)}</button>` : nothing}
      </li>
    `;
  }

  #pinned() {
    const pins = prefs.pins.map(k => config.tiles.get(k)).filter(r => r !== undefined);
    return html`
      <section class="panel glass enter" style="--i:5" aria-label="Pinned links">
        <header class="panel-head">
          <h2 class="panel-title">${icon(Pin)}Pinned</h2>
          ${pins.length ? html`<span class="panel-count">${pins.length}</span>` : nothing}
        </header>
        ${pins.length
          ? html`<ul class="chip-row">${pins.map(ref => this.#chip(ref, 'pin'))}</ul>`
          : html`<p class="empty">Use the <span class="kbd">${icon(Ellipsis)}</span> button on any tile,
                   or right-click it, and choose <strong>Pin to top</strong>.</p>`}
      </section>
    `;
  }

  #recent() {
    const recents = prefs.recents.flatMap(r => {
      const ref = config.tiles.get(r.key);
      return ref ? [{ ref, at: r.at }] : [];
    });
    return html`
      <section class="panel glass enter" style="--i:6" aria-label="Recently opened links">
        <header class="panel-head">
          <h2 class="panel-title">${icon(Clock)}Recent</h2>
          ${recents.length ? html`
            <button class="panel-action" type="button"
                    @click=${() => transition(() => prefs.clearRecents())}>Clear</button>` : nothing}
        </header>
        ${recents.length
          ? html`<ul class="chip-row">${recents.map(r => this.#chip(r.ref, 'recent', r.at))}</ul>`
          : html`<p class="empty">Links you open will show up here.</p>`}
      </section>
    `;
  }

  render() {
    return this.kind === 'recent' ? this.#recent() : this.#pinned();
  }
}
