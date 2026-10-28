// src/components/env-menu.ts
// One shared quick-actions popover for every environment tile and chip.
// It lives in the top layer (Popover API) and is placed with CSS anchor positioning.
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { config, type EnvRef } from '../config.js';
import { prefs } from '../lib/prefs.js';
import { health, healthLabel } from '../lib/health.js';
import { StoreController } from '../lib/store-controller.js';
import { transition, vtName } from '../lib/transition.js';
import { ArrowRight, Copy, ExternalLink, Link, Pin, PinOff, RefreshCw, icon, type IconNode } from '../lib/icons.js';
import { ago, copyText, toast } from '../lib/util.js';

type Point = { x: number; y: number };

const supportsAnchor = CSS.supports('anchor-name: --a');
let instance: EnvMenu | undefined;

export function openEnvMenu(key: string, anchor: HTMLElement, point?: Point) {
  instance?.open(key, anchor, point);
}

/** Right-click (or the keyboard context-menu key) on anything that represents an environment. */
export const onEnvContextMenu = (key: string) => (e: MouseEvent) => {
  e.preventDefault();
  const fromKeyboard = e.clientX === 0 && e.clientY === 0;
  openEnvMenu(key, e.currentTarget as HTMLElement, fromKeyboard ? undefined : { x: e.clientX, y: e.clientY });
};

@customElement('env-menu')
export class EnvMenu extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private key?: string;
  #anchor?: HTMLElement;
  #closedAt = 0;
  #closedKey?: string;
  #restoreFocus = false;

  constructor() {
    super();
    new StoreController(this, config, prefs, health);
  }

  connectedCallback() {
    super.connectedCallback();
    instance = this;
  }

  disconnectedCallback() {
    if (instance === this) instance = undefined;
    super.disconnectedCallback();
  }

  get #menu() { return this.querySelector<HTMLElement>('.env-menu')!; }

  async open(key: string, anchor: HTMLElement, point?: Point) {
    // the click on a ⋯ button that light-dismissed this menu shouldn't reopen it straight away
    if (!point && key === this.#closedKey && performance.now() - this.#closedAt < 300) return;

    const menu = this.#menu;
    if (menu.matches(':popover-open')) menu.hidePopover();
    this.#anchor?.style.removeProperty('anchor-name');
    this.#anchor = anchor;
    this.key = key;
    await this.updateComplete;

    const anchored = !point && supportsAnchor;
    menu.classList.toggle('anchored', anchored);
    menu.style.removeProperty('left');
    menu.style.removeProperty('top');
    if (anchored) anchor.style.setProperty('anchor-name', '--env-menu-anchor');
    menu.showPopover();
    if (!anchored) this.#placeAt(point ?? this.#below(anchor));
    menu.querySelector<HTMLElement>('.menu-item')?.focus();
  }

  #below(el: HTMLElement): Point {
    const r = el.getBoundingClientRect();
    return { x: r.right - this.#menu.offsetWidth, y: r.bottom + 6 };
  }

  #placeAt({ x, y }: Point) {
    const menu = this.#menu;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - h - 8))}px`;
  }

  #close() {
    this.#restoreFocus = true;
    this.#menu.hidePopover();
  }

  #onBeforeToggle = (e: ToggleEvent) => {
    if (e.newState !== 'closed') return;
    this.#closedAt = performance.now();
    this.#closedKey = this.key;
  };

  #onToggle = (e: ToggleEvent) => {
    if (e.newState !== 'closed') return;
    if (this.#restoreFocus) this.#anchor?.focus({ preventScroll: true });
    this.#restoreFocus = false;
  };

  #onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { this.#restoreFocus = true; return; }
    const items = [...this.#menu.querySelectorAll<HTMLElement>('.menu-item')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items.at(n % items.length)?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
  };

  #item(glyph: IconNode, label: string, run: () => void) {
    return html`
      <button class="menu-item" type="button" @click=${() => { this.#close(); run(); }}>
        ${icon(glyph)}<span>${label}</span>
      </button>`;
  }

  #body({ key, app, env }: EnvRef) {
    const h = health.get(key);
    const pinned = prefs.isPinned(key);
    const togglePin = () => {
      // when pinning, morph the tile/chip the menu was opened from into its new pinned chip
      const from = this.#anchor?.closest<HTMLElement>('.env-tile, .chip-item');
      transition(() => prefs.togglePin(key), pinned ? undefined : { from, name: vtName('pin', key) });
    };
    const copy = async (text: string, what: string) => {
      toast(await copyText(text) ? `Copied ${what}` : 'Copy failed');
    };

    return html`
      <div class="menu-head" data-env style="--env:${env.color}">
        <div class="menu-title">
          <span class="env-tag">${env.label}</span>
          <span>${app.name}</span>
          <span class="menu-name">${env.name}</span>
        </div>
        <code class="menu-host">${env.host}</code>
      </div>
      <div class="menu-status">
        <span class="status-dot" data-state=${h.state} ?data-pending=${h.pending}></span>
        <span>${healthLabel(h)}${h.at ? html` · ${ago(h.at)}` : nothing}</span>
        <button class="icon-btn xs ${h.pending ? 'spinning' : ''}" type="button"
                aria-label="Re-check" title="Re-check" @click=${() => health.check(key)}>${icon(RefreshCw)}</button>
      </div>
      <div class="menu-sep" role="separator"></div>
      ${this.#item(ExternalLink, 'Open in new tab', () => {
        window.open(env.url, '_blank', 'noopener');
        transition(() => prefs.recordOpen(key));
      })}
      ${this.#item(ArrowRight, 'Open in this tab', () => {
        prefs.recordOpen(key);
        location.href = env.url;
      })}
      <div class="menu-sep" role="separator"></div>
      ${this.#item(Link, 'Copy URL', () => copy(env.url, 'URL'))}
      ${this.#item(Copy, 'Copy host', () => copy(env.host, env.host))}
      <div class="menu-sep" role="separator"></div>
      ${this.#item(pinned ? PinOff : Pin, pinned ? 'Unpin' : 'Pin to top', togglePin)}
    `;
  }

  render() {
    const ref = this.key ? config.envs.get(this.key) : undefined;
    return html`
      <div class="env-menu" popover role="dialog"
           aria-label=${ref ? `${ref.app.name} ${ref.env.label} actions` : 'Environment actions'}
           @keydown=${this.#onKeyDown} @beforetoggle=${this.#onBeforeToggle} @toggle=${this.#onToggle}>
        ${ref ? this.#body(ref) : nothing}
      </div>
    `;
  }
}
