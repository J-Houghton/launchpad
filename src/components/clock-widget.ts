// src/components/clock-widget.ts
// The main time zone large, any others listed underneath (with +1 / −1 when the date differs).
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { config, type ClockZone } from '../config.js';
import { StoreController } from '../lib/store-controller.js';
import { Clock, icon } from '../lib/icons.js';

type Formatters = { time: Intl.DateTimeFormat; date: Intl.DateTimeFormat; day: Intl.DateTimeFormat };
const formatters = new Map<string, Formatters>();

function formattersFor(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = {
      time: new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }),
      date: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }),
      day: new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }),
    };
    formatters.set(timeZone, f);
  }
  return f;
}

/** Days between the calendar dates two zones are on right now. */
function dayOffset(zone: string, main: string, now: Date) {
  const days = (tz: string) => Date.parse(`${formattersFor(tz).day.format(now)}T00:00:00Z`) / 864e5;
  return days(zone) - days(main);
}

@customElement('clock-widget')
export class ClockWidget extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private now = new Date();
  #id = 0;

  constructor() {
    super();
    new StoreController(this, config);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#id = window.setInterval(() => (this.now = new Date()), 1000);
  }

  disconnectedCallback() {
    clearInterval(this.#id);
    super.disconnectedCallback();
  }

  #zone(zone: ClockZone, main: string) {
    const offset = dayOffset(zone.timeZone, main, this.now);
    return html`
      <li>
        <span class="zone-label">${zone.label}</span>
        <span class="zone-time">
          ${formattersFor(zone.timeZone).time.format(this.now)}
          ${offset ? html`<span class="zone-day" title=${offset > 0 ? 'Tomorrow there' : 'Yesterday there'}>${offset > 0 ? '+' : '−'}${Math.abs(offset)}</span>` : nothing}
        </span>
      </li>`;
  }

  render() {
    const [main, ...others] = config.widgets.clock.zones;
    const f = formattersFor(main.timeZone);
    const parts = f.time.formatToParts(this.now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
    const time = `${part('hour')}:${part('minute')}`;
    const period = part('dayPeriod');
    // each character is keyed by position + value, so only digits that change re-mount and roll in
    return html`
      <div class="widget-label">${icon(Clock)}${main.label}</div>
      <div class="clock-time" aria-hidden="true">
        ${[...time].map((ch, i) => keyed(`${i}${ch}`, html`<span class=${ch === ':' ? 'colon' : 'digit'}>${ch}</span>`))}
        <span class="clock-period">${period}</span>
      </div>
      <span class="visually-hidden">${time} ${period}</span>
      <div class="widget-foot">${f.date.format(this.now).replace(/ (\d+)$/, ' $1')}</div>
      ${others.length ? html`<ul class="clock-zones">${others.map(z => this.#zone(z, main.timeZone))}</ul>` : nothing}
    `;
  }
}
