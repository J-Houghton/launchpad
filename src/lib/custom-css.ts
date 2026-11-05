// src/lib/custom-css.ts
// The page's custom CSS (look.css in the config; Settings → Edit page → Look). It goes in a <style> of
// its own outside the app's cascade layers, so it wins over the built-in styles however plain its
// selectors are. index.html puts it on the page before the first paint; this keeps it up to date.
//
// Opening the page with ?safe in its address leaves it off, in case it hides the way back to Settings.
import { config } from '../config.js';

export const safeMode = new URLSearchParams(location.search).has('safe');

const ID = 'launchpad-custom-css';
const style = document.getElementById(ID) ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: ID }));

/** CSS being edited in Settings, shown in place of the page's own. */
let editing: string | undefined;

function apply() {
  const css = safeMode ? '' : editing ?? config.look.css;
  // textContent, never markup: nothing in it can close the <style> early
  if (style.textContent !== css) style.textContent = css;
}

config.addEventListener('change', apply);
apply();

/** Show `css` while it's being edited; nothing goes back to the page's own. */
export function previewCss(css?: string) {
  editing = css;
  apply();
}
