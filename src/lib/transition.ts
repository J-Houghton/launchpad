// src/lib/transition.ts
import { StoreController } from './store-controller';

/** Whether to keep things still — your setting in My view, or your system's (lib/look.ts sets it). */
export const reducedMotion = () => document.documentElement.dataset.motion === 'reduced';

/** A valid view-transition-name for an environment key. */
export const vtName = (prefix: string, key: string) => `${prefix}-${key.replace(/[^\w-]/g, '-')}`;

/**
 * Runs a store change inside a View Transition (when supported), so anything
 * with a view-transition-name glides to its new spot instead of jumping.
 * Pass `morph` to make an existing element visually turn into the new one.
 */
export function transition(update: () => void, morph?: { from: HTMLElement | null | undefined; name: string }) {
  if (!('startViewTransition' in document) || reducedMotion()) return update();
  const from = morph?.from;
  if (from) from.style.viewTransitionName = morph.name;
  quietly(document.startViewTransition(async () => {
    if (from) from.style.viewTransitionName = '';
    update();
    await StoreController.settled();
  }));
}

/** A transition cut short by a newer one still makes its change; it just doesn't animate. Nothing to report. */
export const quietly = (vt: ViewTransition) => { vt.ready.catch(() => {}); };
