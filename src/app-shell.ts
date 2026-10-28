// src/app-shell.ts
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import './components/page-backdrop.js';
import './components/site-header.js';
import './components/hero-section.js';
import './components/quick-dock.js';
import './components/app-main.js';
import './components/site-footer.js';
import './components/env-menu.js';
import './components/settings-panel.js';
import './components/setup-guide.js';
import { health } from './lib/health.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  protected createRenderRoot() { return this; } // keep light DOM

  connectedCallback() {
    super.connectedCallback();
    health.start();
  }

  render() {
    return html`
      <page-backdrop></page-backdrop>
      <site-header></site-header>
      <main class="page" id="main">
        <hero-section></hero-section>
        <quick-dock></quick-dock>
        <app-main></app-main>
      </main>
      <site-footer></site-footer>
      <env-menu></env-menu>
      <settings-panel></settings-panel>
      <setup-guide></setup-guide>
    `;
  }
}
