// src/lib/prefs.ts
// "My view": pinned + recently opened environments and hidden apps, saved in this browser.
export type Recent = { key: string; at: number };

const PINS = 'launchpad:pins';
const RECENTS = 'launchpad:recents';
const HIDDEN = 'launchpad:hidden';
const COLLAPSED = 'launchpad:collapsed';
const MAX_RECENTS = 6;

function load<T>(storageKey: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function save(storageKey: string, value: unknown) {
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* storage blocked */ }
}

class Prefs extends EventTarget {
  pins: string[] = [];
  recents: Recent[] = [];
  /** App ids hidden from this browser's view of the page. */
  hidden: string[] = [];
  /** Group ids folded shut in this browser. */
  collapsed: string[] = [];

  constructor() {
    super();
    this.#load();
    // keep several open tabs in sync
    addEventListener('storage', e => {
      if (e.key === PINS || e.key === RECENTS || e.key === HIDDEN || e.key === COLLAPSED) { this.#load(); this.#emit(); }
    });
  }

  isPinned(key: string) { return this.pins.includes(key); }

  togglePin(key: string) {
    this.pins = this.isPinned(key) ? this.pins.filter(k => k !== key) : [...this.pins, key];
    save(PINS, this.pins);
    this.#emit();
  }

  clearPins() {
    this.pins = [];
    save(PINS, this.pins);
    this.#emit();
  }

  recordOpen(key: string) {
    this.recents = [{ key, at: Date.now() }, ...this.recents.filter(r => r.key !== key)].slice(0, MAX_RECENTS);
    save(RECENTS, this.recents);
    this.#emit();
  }

  clearRecents() {
    this.recents = [];
    save(RECENTS, this.recents);
    this.#emit();
  }

  isHidden(appId: string) { return this.hidden.includes(appId); }

  setHidden(appId: string, hidden: boolean) {
    this.hidden = hidden ? [...new Set([...this.hidden, appId])] : this.hidden.filter(id => id !== appId);
    save(HIDDEN, this.hidden);
    this.#emit();
  }

  isCollapsed(groupId: string) { return this.collapsed.includes(groupId); }

  toggleCollapsed(groupId: string) {
    this.collapsed = this.isCollapsed(groupId) ? this.collapsed.filter(id => id !== groupId) : [...this.collapsed, groupId];
    save(COLLAPSED, this.collapsed);
    this.#emit();
  }

  // entries for apps/environments/groups that no longer exist are skipped when rendering
  #load() {
    this.pins = load<string>(PINS).filter(k => typeof k === 'string');
    this.recents = load<Recent>(RECENTS).filter(r => typeof r?.key === 'string');
    this.hidden = load<string>(HIDDEN).filter(k => typeof k === 'string');
    this.collapsed = load<string>(COLLAPSED).filter(k => typeof k === 'string');
  }

  #emit() { this.dispatchEvent(new Event('change')); }
}

export const prefs = new Prefs();
