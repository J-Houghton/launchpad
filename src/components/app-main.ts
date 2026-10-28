// src/components/app-main.ts
import { LitElement, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { config, envKey, type App, type EnvDef, type Env } from '../config.js';
import { prefs } from '../lib/prefs.js';
import { health, healthLabel } from '../lib/health.js';
import { StoreController } from '../lib/store-controller.js';
import { transition } from '../lib/transition.js';
import { ChevronDown, Ellipsis, Eye, EyeOff, Pin, Plus, RefreshCw, Rocket, Sparkles, icon, linkIcon } from '../lib/icons.js';
import { initials } from '../lib/util.js';
import { onEnvContextMenu, openEnvMenu } from './env-menu.js';
import { openSettings } from './settings-panel.js';
import { openSetupGuide } from './setup-guide.js';

@customElement('app-main')
export class AppMain extends LitElement {
  protected createRenderRoot() { return this; }

  #pointer = { x: 0, y: 0 };
  #raf = 0;

  constructor() {
    super();
    new StoreController(this, config, prefs, health);
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

  #tile(app: App, env: Env) {
    const key = envKey(app, env);
    const h = health.get(key);
    const open = () => transition(() => prefs.recordOpen(key));
    return html`
      <li class="env-tile" data-env style="--env:${env.color}" ?data-caution=${env.caution}>
        <a class="env-link" href=${env.url} target="_blank" rel="noopener"
           @click=${open}
           @auxclick=${(e: MouseEvent) => e.button === 1 && open()}
           @contextmenu=${onEnvContextMenu(key)}>
          <span class="env-row">
            <span class="env-tag">${env.label}</span>
            <span class="status-dot" data-state=${h.state} ?data-pending=${h.pending} title=${healthLabel(h)}></span>
            ${prefs.isPinned(key) ? html`<span class="env-pinned" title="Pinned">${icon(Pin)}</span>` : nothing}
          </span>
          ${env.name ? html`<span class="env-name">${env.name}</span>` : nothing}
          <span class="env-host">${env.host}</span>
          <span class="visually-hidden">${healthLabel(h)}</span>
        </a>
        <button class="env-more" type="button" aria-label="More actions for ${app.name} ${env.label}"
                aria-haspopup="dialog" title="More actions"
                @click=${(e: MouseEvent) => openEnvMenu(key, e.currentTarget as HTMLElement)}>
          ${icon(Ellipsis)}
        </button>
      </li>
    `;
  }

  // keeps each environment in its own column from one app to the next
  #emptySlot(def: EnvDef) {
    return html`<li class="env-empty" aria-hidden="true">No ${def.label}</li>`;
  }

  #card(app: App, i: number) {
    // the badge color follows the app's place in the config, so it doesn't shift when others are hidden
    const hue = (285 + config.apps.indexOf(app) * 35) % 360;
    return html`
      <article class="app-card glass enter" style="--i:${8 + i}; --hue:${hue}"
               aria-labelledby="app-${app.id}">
        <div class="app-layout">
          <div class="app-info">
            <span class="app-mark" aria-hidden="true">${app.badge || initials(app.name)}</span>
            <div class="app-heading">
              <h3 class="app-title" id="app-${app.id}">${app.name}</h3>
              ${app.description ? html`<p class="app-strap">${app.description}</p>` : nothing}
              ${app.links.length ? html`
                <div class="app-docs">
                  ${app.links.map(link => html`
                    <a class="icon-pill" href=${link.url} target="_blank" rel="noopener" title=${link.label}>
                      ${icon(linkIcon(link))}<span class="label">${link.label}</span>
                    </a>`)}
                </div>` : nothing}
            </div>
          </div>
          <ul class="env-grid">
            ${config.environments.map(def => {
              const env = app.envs.find(e => e.id === def.id);
              return env ? this.#tile(app, env) : this.#emptySlot(def);
            })}
          </ul>
        </div>
      </article>
    `;
  }

  // a collapsible group of apps; collapsing is remembered per browser (My view)
  #group(id: string, name: string, apps: App[], start: number) {
    const collapsed = prefs.isCollapsed(id);
    return html`
      <section class="app-group" ?data-collapsed=${collapsed} aria-label=${name}>
        <button class="group-head enter" type="button" style="--i:${8 + start}" aria-expanded=${String(!collapsed)}
                @click=${() => transition(() => prefs.toggleCollapsed(id))}>
          ${icon(ChevronDown)}
          <span class="group-name">${name}</span>
          <span class="count">${apps.length}</span>
          <span class="group-rule" aria-hidden="true"></span>
        </button>
        ${collapsed ? nothing : html`<div class="group-apps">${apps.map((app, i) => this.#card(app, start + i))}</div>`}
      </section>
    `;
  }

  #list(apps: App[]) {
    if (!config.groups.length) return apps.map((app, i) => this.#card(app, i));
    const sections = [
      ...config.groups.map(g => ({ id: g.id, name: g.name, apps: apps.filter(a => a.group === g.id) })),
      { id: '__other', name: 'Other', apps: apps.filter(a => !a.group) },
    ].filter(s => s.apps.length);
    let start = 0;
    return sections.map(s => {
      const out = this.#group(s.id, s.name, s.apps, start);
      start += s.apps.length;
      return out;
    });
  }

  render() {
    const { up, checked, total, pending } = health.summary;
    const allUp = checked > 0 && up === total;
    const apps = config.apps.filter(a => !prefs.isHidden(a.id));
    const hidden = config.apps.length - apps.length;
    return html`
      <section class="apps" aria-labelledby="apps-title" style="--env-count:${Math.max(config.environments.length, 1)}">
        <div class="section-head enter" style="--i:7">
          <h2 id="apps-title">Applications <span class="count">${apps.length}</span></h2>
          ${hidden ? html`
            <button class="hidden-note" type="button" @click=${() => openSettings('view')}>
              ${icon(EyeOff)} ${hidden} hidden
            </button>` : nothing}
          ${total ? html`
            <div class="health-pill glass" role="status">
              <span class="status-dot ping" data-state=${checked === 0 ? 'unknown' : allUp ? 'up' : 'down'}
                    ?data-pending=${checked === 0}></span>
              <span>${checked === 0 ? 'Checking environments…' : `${up} of ${total} reachable`}</span>
              <button class="icon-btn sm ${pending ? 'spinning' : ''}" type="button"
                      aria-label="Re-check all environments" title="Re-check all"
                      @click=${() => health.checkAll()}>${icon(RefreshCw)}</button>
            </div>` : nothing}
        </div>
        ${apps.length ? html`
          <div class="apps-list" @pointermove=${this.#onPointerMove}>${this.#list(apps)}</div>`
        : config.apps.length ? html`
          <div class="apps-empty glass">
            <p>All applications are hidden in your view.</p>
            <button class="btn btn-soft" type="button" @click=${() => openSettings('view')}>${icon(Eye)} Show them again</button>
          </div>`
        : html`
          <div class="apps-empty glass">
            ${icon(Rocket, 'apps-empty-icon')}
            <h3>Let's set up your launchpad</h3>
            <p>Name it, pick your environments and add a few applications — about a minute.</p>
            <div class="apps-empty-actions">
              <button class="btn btn-primary" type="button" @click=${() => openSetupGuide()}>${icon(Sparkles)} Start the setup guide</button>
              <button class="btn btn-ghost" type="button" @click=${() => openSettings('apps')}>${icon(Plus)} Add apps in settings</button>
            </div>
          </div>`}
      </section>
    `;
  }
}
