// src/components/weather-widget.ts
import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { config, primaryTimeZone } from '../config.js';
import { StoreController } from '../lib/store-controller.js';
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun,
  MapPin, Moon, Sun, icon, type IconNode,
} from '../lib/icons.js';

type Weather = { temp: number; code: number; isDay: boolean; hi: number; lo: number };
type Condition = { codes: number[]; label: string; day: IconNode; night: IconNode; kind: string };

// WMO weather codes, as used by Open-Meteo
const CONDITIONS: Condition[] = [
  { codes: [0], label: 'Clear', day: Sun, night: Moon, kind: 'sun' },
  { codes: [1], label: 'Mostly clear', day: Sun, night: Moon, kind: 'sun' },
  { codes: [2], label: 'Partly cloudy', day: CloudSun, night: CloudMoon, kind: 'cloud' },
  { codes: [3], label: 'Overcast', day: Cloud, night: Cloud, kind: 'cloud' },
  { codes: [45, 48], label: 'Fog', day: CloudFog, night: CloudFog, kind: 'cloud' },
  { codes: [51, 53, 55, 56, 57], label: 'Drizzle', day: CloudDrizzle, night: CloudDrizzle, kind: 'rain' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: 'Rain', day: CloudRain, night: CloudRain, kind: 'rain' },
  { codes: [71, 73, 75, 77, 85, 86], label: 'Snow', day: CloudSnow, night: CloudSnow, kind: 'rain' },
  { codes: [95, 96, 99], label: 'Thunderstorms', day: CloudLightning, night: CloudLightning, kind: 'rain' },
];
const UNKNOWN: Condition = { codes: [], label: 'Current conditions', day: Cloud, night: Cloud, kind: 'cloud' };

const REFRESH_MS = 30 * 60_000;

@customElement('weather-widget')
export class WeatherWidget extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private weather?: Weather;
  @state() private failed = false;
  #id = 0;
  #place = '';

  constructor() {
    super();
    new StoreController(this, config);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#id = window.setInterval(this.#fetch, REFRESH_MS);
  }

  // (re)fetch on first render and whenever the location changes in config
  willUpdate() {
    const { latitude, longitude, units } = config.widgets.weather;
    const place = `${latitude},${longitude},${units}`;
    if (place === this.#place) return;
    this.#place = place;
    this.weather = undefined;
    this.failed = false;
    this.#fetch();
  }

  disconnectedCallback() {
    clearInterval(this.#id);
    super.disconnectedCallback();
  }

  #fetch = async () => {
    const { latitude, longitude } = config.widgets.weather;
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,weather_code,is_day',
      daily: 'temperature_2m_max,temperature_2m_min',
      temperature_unit: config.widgets.weather.units,
      timezone: primaryTimeZone(config),
      forecast_days: '1',
    });
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!r.ok) throw new Error(String(r.status));
      const { current, daily } = await r.json();
      this.weather = {
        temp: current.temperature_2m,
        code: current.weather_code,
        isDay: current.is_day === 1,
        hi: daily.temperature_2m_max[0],
        lo: daily.temperature_2m_min[0],
      };
      this.failed = false;
    } catch {
      // keep showing the last good reading if we have one
      this.failed = !this.weather;
    }
  };

  render() {
    const w = this.weather;
    const label = html`<div class="widget-label">${icon(MapPin)}${config.widgets.weather.place}</div>`;

    if (!w) {
      return this.failed
        ? html`${label}<div class="weather-now"><span class="weather-temp muted">—</span></div>
               <div class="widget-foot">Weather unavailable</div>`
        : html`${label}<div class="skeleton skeleton-lg"></div><div class="skeleton skeleton-sm"></div>`;
    }

    const c = CONDITIONS.find(c => c.codes.includes(w.code)) ?? UNKNOWN;
    return html`
      ${label}
      <div class="weather-now">
        <span class="weather-icon" data-kind=${c.kind}>${icon(w.isDay ? c.day : c.night)}</span>
        <span class="weather-temp">${Math.round(w.temp)}°</span>
      </div>
      <div class="widget-foot">${c.label} · ${`H ${Math.round(w.hi)}° L ${Math.round(w.lo)}°`.replaceAll(' ', ' ')}</div>
    `;
  }
}
