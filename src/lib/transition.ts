// src/lib/transition.ts
import { StoreController } from './store-controller';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** A valid view-transition-name for an environment key. */
export const vtName = (prefix: string, key: string) => `${prefix}-${key.replace(/[^\w-]/g, '-')}`;

/**
 * Runs a store change inside a View Transition (when supported), so anything
 * with a view-transition-name glides to its new spot instead of jumping.
 * Pass `morph` to make an existing element visually turn into the new one.
 */
export function transition(update: () => void, morph?: { from: HTMLElement | null | undefined; name: string }) {
  if (!('startViewTransition' in document) || reduceMotion.matches) return update();
  const from = morph?.from;
  if (from) from.style.viewTransitionName = morph.name;
  document.startViewTransition(async () => {
    if (from) from.style.viewTransitionName = '';
    update();
    await StoreController.settled();
  });
}
