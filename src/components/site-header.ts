// src/components/site-header.ts
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { config } from '../config.js';
import { look } from '../lib/look.js';
import { panelGlass } from '../lib/panel-glass.js';
import { StoreController } from '../lib/store-controller.js';
import { Moon, Sun, icon } from '../lib/icons.js';

@customElement('site-header')
export class SiteHeader extends LitElement {
  protected createRenderRoot() { return this; }

  constructor() {
    super();
    new StoreController(this, config, look);
  }

  #toggleTheme = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    look.toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  render() {
    const label = look.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    return html`
      <header class="topbar">
        <div class="topbar-inner" ${panelGlass('header')}>
          <a class="brand" href="/">
            ${config.site.logo
              ? html`<img class="brand-logo" src=${config.site.logo} alt="">`
              : html`<span class="brand-mark" aria-hidden="true"></span>`}
            <span class="brand-pipe" aria-hidden="true"></span>
            <span class="brand-name">${config.site.title}</span>
          </a>
          <nav class="quick-links" aria-label="Quick links">
            <ul>
              ${config.links.map(l => html`<li><a href=${l.url}>${l.label}</a></li>`)}
            </ul>
            <span class="quick-links-highlight" aria-hidden="true" ${panelGlass('drop')}></span>
          </nav>
          <button class="icon-btn theme-toggle" type="button" aria-label=${label} title=${label}
                  @click=${this.#toggleTheme}>
            ${icon(Sun, 'sun')}${icon(Moon, 'moon')}
          </button>
        </div>
      </header>
    `;
  }
}
