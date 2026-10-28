// src/lib/theme.ts
// The initial theme + palette are applied by an inline script in index.html (no flash);
// this module handles switching and following the OS setting.
export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'system';
export type Palette = 'classic' | 'aurora';

const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const canTransition = () => 'startViewTransition' in document && !reduceMotion.matches;

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage blocked */ }
}

export const currentTheme = (): Theme => (root.classList.contains('theme-dark') ? 'dark' : 'light');
export const themeMode = (): ThemeMode => (read('theme') as Theme | null) ?? 'system';
export const currentPalette = (): Palette => (root.dataset.palette === 'classic' ? 'classic' : 'aurora');

function apply(theme: Theme) {
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-light', theme === 'light');
}

// follow the OS until the user picks a theme explicitly
systemDark.addEventListener('change', e => {
  if (themeMode() === 'system') apply(e.matches ? 'dark' : 'light');
});

/** Switch theme with a circular reveal that grows out of `origin`. */
export async function toggleTheme(origin: { x: number; y: number }) {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  write('theme', next);

  if (!canTransition()) return apply(next);

  root.classList.add('vt-theme');
  const vt = document.startViewTransition(() => apply(next));
  try {
    await vt.ready;
    const { x, y } = origin;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(.2, .7, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
    await vt.finished;
  } catch {
    // transition skipped — the theme still switched
  } finally {
    root.classList.remove('vt-theme');
  }
}

/** Pick light/dark explicitly, or go back to following the OS. */
export function setThemeMode(mode: ThemeMode) {
  write('theme', mode === 'system' ? null : mode);
  const theme = mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode;
  if (theme === currentTheme()) return;
  if (canTransition()) document.startViewTransition(() => apply(theme));
  else apply(theme);
}

export function setPalette(palette: Palette) {
  write('palette', palette);
  if (palette === currentPalette()) return;
  const update = () => { root.dataset.palette = palette; };
  if (canTransition()) document.startViewTransition(update);
  else update();
}
