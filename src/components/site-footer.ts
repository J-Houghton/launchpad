// src/components/site-footer.ts
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { config } from '../config.js';
import { StoreController } from '../lib/store-controller.js';
import { Settings, icon } from '../lib/icons.js';
import { openSettings } from './settings-panel.js';

@customElement('site-footer')
export class SiteFooter extends LitElement {
  protected createRenderRoot() { return this; }

  constructor() {
    super();
    new StoreController(this, config);
  }

  render() {
    return html`
      <footer class="site-footer">
        <div class="footer-inner">
          <span>${config.site.footer}</span>
          <span class="footer-meta">
            ${config.statusChecks ? 'Status checks every 2 min · ' : ''}Pins are saved in this browser
            <span class="footer-version" title="Launchpad version">v${__APP_VERSION__}</span>
            <!-- deliberately easy to miss: the settings live behind this faint gear (or Ctrl+,) -->
            <button class="settings-trigger" type="button" aria-label="Settings" title="Settings (Ctrl+,)"
                    @click=${() => openSettings()}>${icon(Settings)}</button>
          </span>
        </div>
      </footer>
    `;
  }
}
