// src/lib/health.ts
// Lightweight reachability checks for each tile.
//
// Requests use `no-cors`, so the browser never lets us read the response — but
// the request only resolves if the host answered at all. "up" therefore means
// reachable (not necessarily healthy); "down" means DNS/connection/TLS failure
// or a timeout.
import { config } from '../config';

export type HealthState = 'unknown' | 'up' | 'down' | 'off';
export type Health = { state: HealthState; ms?: number; at?: number; pending?: boolean };

const TIMEOUT_MS = 6_000;
const INTERVAL_MS = 2 * 60_000;

export function healthLabel(h: Health) {
  switch (h.state) {
    case 'up': return `Reachable${h.ms != null ? ` · ${h.ms} ms` : ''}`;
    case 'down': return 'Unreachable';
    case 'off': return 'Status check off';
    default: return 'Checking…';
  }
}

class HealthMonitor extends EventTarget {
  #status = new Map<string, Health>();
  #started = false;
  #lastRun = 0;

  get(key: string): Health {
    return this.#status.get(key) ?? { state: 'unknown', pending: true };
  }

  get summary() {
    let up = 0, checked = 0, total = 0, pending = false;
    for (const key of config.tiles.keys()) {
      const h = this.get(key);
      if (h.state === 'off') continue;
      total++;
      if (h.state === 'up') up++;
      if (h.state !== 'unknown') checked++;
      if (h.pending) pending = true;
    }
    return { up, checked, total, pending };
  }

  async check(key: string) {
    const ref = config.tiles.get(key);
    if (!ref) return;
    const url = ref.tile.health ?? ref.tile.url;
    if (url === false) return this.#set(key, { state: 'off' });

    this.#set(key, { ...this.get(key), pending: true });
    const started = performance.now();
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
      this.#set(key, { state: 'up', ms: Math.round(performance.now() - started), at: Date.now() });
    } catch {
      this.#set(key, { state: 'down', at: Date.now() });
    }
  }

  checkAll() {
    this.#lastRun = Date.now();
    return Promise.all([...config.tiles.keys()].map(key => this.check(key)));
  }

  /** Check everything now, then every couple of minutes while the tab is visible. */
  start() {
    if (this.#started) return;
    this.#started = true;
    this.checkAll();
    setInterval(() => { if (!document.hidden) this.checkAll(); }, INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - this.#lastRun > INTERVAL_MS / 2) this.checkAll();
    });
    // tiles were added or edited in settings — but not for other changes, like the layout
    let checked = this.#targets();
    config.addEventListener('change', () => {
      const targets = this.#targets();
      if (targets === checked) return;
      checked = targets;
      this.checkAll();
    });
  }

  /** What would be checked: each tile's key and address. */
  #targets() {
    return [...config.tiles.values()].map(r => `${r.key} ${r.tile.health ?? r.tile.url}`).join('\n');
  }

  #set(key: string, value: Health) {
    this.#status.set(key, value);
    this.dispatchEvent(new Event('change'));
  }
}

export const health = new HealthMonitor();
