# Custom CSS

For anything the [styles](looks.md) don't cover, add your own CSS in Settings → Edit page → Page → **Custom CSS**. The page behind the settings window shows it as you type.

With no custom CSS yet, the box starts with the page's style as it is now: its colours in light and in dark, its corners and its type. Every line is commented out, so uncomment one and change it. Untouched, nothing is saved. Once there's CSS of your own, **Insert … CSS** adds the style's below it.

> **Try it in the [demo](https://j-houghton.github.io/launchpad/):** Settings → Edit page → Page → Custom CSS, uncomment the `--radius-lg` line and change its value. The cards behind Settings change as you type.

## In the config

Launchpad's own styles sit in cascade layers and yours come after them, so a plain selector is enough to win. In `launchpad.config.js` it's `look.css`, one line per entry:

```json
"look": {
  "theme": "system", "style": "paper", "background": "still",
  "css": [
    ":root { --accent: #0b7285; --radius-lg: 0.5rem; }",
    "[data-card=\"billing\"] { --hue: 160; }",
    ".hero-sub { display: none; }"
  ]
}
```

## Variables

Most changes are just a variable. Set them on `:root`, on `.theme-dark` for dark only, or on `:root[data-style="paper"]` for one style.

| Variables | |
| --- | --- |
| Colours | each style's six: `--bg`, `--panel`, `--ink` (text), `--accent`, `--accent-2`, `--accent-3`. These follow from them: `--muted`, `--glass` (cards and panels), `--glass-border`, `--tile`, `--hairline`, `--ring` (focus) |
| Shapes | `--radius-sm`, `--radius`, `--radius-lg`, `--radius-full`, `--border-w`, `--mark-radius` (card badges), `--shadow-sm`, `--shadow`, `--shadow-lg` |
| Type | `--font-heading`, `--font-label`, `--font-numeric`, `--font-display` (the greeting), `--title-size`, `--section-size`, `--heading-weight`. The bundled faces are `--font-sans` (Inter), `--font-serif` (Instrument Serif) and `--font-mono` |
| Backdrop | `--page-bg` (a pattern), `--blob-1` to `--blob-4` (the glow), `--particle`, `--grain-opacity` |
| Glass | `--lens-tint` (what liquid glass controls are tinted with, in Aurora, Liquid and Neon) |

## Hooks

These are kept stable from version to version:

| Hook | What it is |
| --- | --- |
| `[data-card="id"]` | a card; set its `--hue` (0–360) to recolour its badge and tiles |
| `[data-tile="id"]`, `[data-column="id"]` | a tile; its id comes from its name (e.g. `recipe-box`), or is its column's. Set its `--env` to recolour it |
| `[data-group="id"]` | a group of cards (`other` for cards without one) |
| `[data-section="…"]` | `greeting`, `clock`, `weather`, `pinned`, `recent`, `cards`, or an added widget's `id` |
| `:root[data-style]`, `.theme-dark`, `:root[data-density="compact"]`, `:root[data-motion="reduced"]` | the look in effect |
| `[data-lens="glass"]`, `[data-lens="frost"]` | a liquid glass control, drawn as a lens or, where the browser can't, frosted. A lens's `::before` draws its light, so leave that one be |

The examples shown in Settings use your own page's names: one of your cards and tiles, a section, and your style.

## Safety

- If your CSS ever hides the way back to Settings, open the page with `?safe` on the end of its address (`index.html?safe`). Custom CSS, colours and extensions stay off until you take `?safe` away again.
- When you open someone else's config file in Settings, the page asks before keeping any CSS in it. CSS can make a page look like something it isn't, and can load images and fonts from other sites.
