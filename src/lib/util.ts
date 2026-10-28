// src/lib/util.ts
import { html, render } from 'lit';
import { Check, TriangleAlert, icon } from './icons';

/** "Billing Service" → "BS", "CRM" → "CRM", "Storefront" → "ST" */
export function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  // short names and acronyms fit whole; longer single words get two letters
  const word = words[0] ?? '';
  return (word.length <= 4 ? word : word.slice(0, 2)).toUpperCase();
}

/** "just now", "5m ago", "3h ago", "2d ago" */
export function ago(ts: number, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // the Clipboard API needs https/localhost; fall back for plain-http intranet hosting
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

let toastEl: HTMLElement | undefined;
let toastTimer = 0;

/** Small confirmation bubble at the bottom of the screen (a manual popover, so it sits in the top layer). */
export function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.popover = 'manual';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.dataset.kind = kind;
  render(html`${icon(kind === 'ok' ? Check : TriangleAlert)}<span>${message}</span>`, toastEl);
  if (!toastEl.matches(':popover-open')) toastEl.showPopover();
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.hidePopover(), kind === 'ok' ? 2200 : 4000);
}
