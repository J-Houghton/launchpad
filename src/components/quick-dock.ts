// src/components/quick-dock.ts
// Pinned + recently opened environments.
import { LitElement, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { config, type EnvRef } from '../config.js';
import { prefs } from '../lib/prefs.js';
import { health } from '../lib/health.js';
import { StoreController } from '../lib/store-controller.js';
import { transition, vtName } from '../lib/transition.js';
import { Clock, Ellipsis, Pin, X, icon } from '../lib/icons.js';
import { ago } from '../lib/util.js';
import { onEnvContextMenu } from './env-menu.js';

@customElement('quick-dock')
export class QuickDock extends LitElement {
  protected createRenderRoot() { return this; }

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

  #open(ref: EnvRef) {
    return () => transition(() => prefs.recordOpen(ref.key));
  }

  #chip(ref: EnvRef, kind: 'pin' | 'recent', at = 0) {
    const { key, app, env } = ref;
    const h = health.get(key);
    return html`
      <li class="chip-item" data-env style="--env:${env.color}; --vt:${vtName(kind, key)}">
        <a class="chip" href=${env.url} target="_blank" rel="noopener"
           title="${app.name} ${env.label} · ${env.host}"
           @click=${this.#open(ref)}
           @auxclick=${(e: MouseEvent) => e.button === 1 && this.#open(ref)()}
           @contextmenu=${onEnvContextMenu(key)}>
          <span class="status-dot" data-state=${h.state} ?data-pending=${h.pending}></span>
          <span class="chip-app">${app.name}</span>
          <span class="chip-tag">${env.label}</span>
          ${kind === 'recent' ? html`<span class="chip-time">${ago(at)}</span>` : nothing}
        </a>
        ${kind === 'pin' ? html`
          <button class="chip-x" type="button" aria-label="Unpin ${app.name} ${env.label}" title="Unpin"
                  @click=${() => transition(() => prefs.togglePin(key))}>${icon(X)}</button>` : nothing}
      </li>
    `;
  }

  render() {
    const pins = prefs.pins.map(k => config.envs.get(k)).filter(r => r !== undefined);
    const recents = prefs.recents.flatMap(r => {
      const ref = config.envs.get(r.key);
      return ref ? [{ ref, at: r.at }] : [];
    });

    return html`
      <section class="dock" aria-label="Pinned and recent environments">
        <div class="panel glass enter" style="--i:5">
          <header class="panel-head">
            <h2 class="panel-title">${icon(Pin)}Pinned</h2>
            ${pins.length ? html`<span class="panel-count">${pins.length}</span>` : nothing}
          </header>
          ${pins.length
            ? html`<ul class="chip-row">${pins.map(ref => this.#chip(ref, 'pin'))}</ul>`
            : html`<p class="empty">Use the <span class="kbd">${icon(Ellipsis)}</span> button on any environment,
                     or right-click it, and choose <strong>Pin to top</strong>.</p>`}
        </div>
        <div class="panel glass enter" style="--i:6">
          <header class="panel-head">
            <h2 class="panel-title">${icon(Clock)}Recent</h2>
            ${recents.length ? html`
              <button class="panel-action" type="button"
                      @click=${() => transition(() => prefs.clearRecents())}>Clear</button>` : nothing}
          </header>
          ${recents.length
            ? html`<ul class="chip-row">${recents.map(r => this.#chip(r.ref, 'recent', r.at))}</ul>`
            : html`<p class="empty">Environments you open will show up here.</p>`}
        </div>
      </section>
    `;
  }
}
