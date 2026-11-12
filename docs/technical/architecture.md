# Architecture

Launchpad is a [Lit](https://lit.dev/) 3 app written in TypeScript and built with [Vite](https://vite.dev/) into **one `index.html`** with everything inlined. It has no server and no router. The [demo](https://j-houghton.github.io/launchpad/) is that same file on GitHub Pages; view its source to see what a build looks like.

## Constraints that shape the code

- **It must run from `file://`.** Browsers won't load module scripts or fonts from separate files there, and `fetch()` can't read local files. So the build inlines JS, CSS and fonts, and the config is a plain script, not JSON.
- **Old configs must keep loading.** `normalize()` in `src/config.ts` accepts every earlier format and returns the current one (version 4).
- **Code only comes from files beside the page.** Extensions are never loaded from an address, and no config is ever read from the URL. The only URL switch is `?safe`, which turns things off.
- **No flash before the first paint.** The look is applied by an inline script before the app loads.

## How the page starts

1. **`index.html`** loads `launchpad.config.js` as a plain script, which sets `window.LAUNCHPAD_CONFIG`. In the source this is a `<!-- launchpad.config.js -->` marker that a Vite plugin swaps for the script tag.
2. **An inline script** in `index.html` applies the look: theme class, `data-style`, `data-background`, `data-motion`, `data-density`, custom CSS and custom colours. It mirrors `src/lib/look.ts`, `colors.ts` and `custom-css.ts`; keep them in step.
3. **`src/main.ts`** registers the fonts, imports the CSS and defines `<app-shell>`.
4. **`<app-shell>`** renders the header, the sections on the 12-column grid, and the footer. Extensions listed in the config are loaded as plain scripts.

## State

There's no framework store. State lives in a few `EventTarget` objects that dispatch `change`; components subscribe with `StoreController` (`src/lib/store-controller.ts`), which re-renders its host.

| Store | Holds | Kept in |
| --- | --- | --- |
| `config` (`src/config.ts`) | the page: cards, layout, widgets, look | `launchpad.config.js`, plus `localStorage` `launchpad:config` for edits not yet saved to the file |
| `prefs` (`src/lib/prefs.ts`) | pins, recents, hidden cards, folded groups | `launchpad:pins`, `launchpad:recents`, `launchpad:hidden`, `launchpad:collapsed` |
| `look` (`src/lib/look.ts`) | the viewer's own theme, style, background, colours, motion | `launchpad:look` |
| `health` (`src/lib/health.ts`) | each tile's reachability | memory |
| `arrange` (`src/lib/arrange.ts`) | arrange mode's working copy | memory; shown through `config.preview()` |

An extension widget's `ctx.store` uses `launchpad:widget:<id>:<key>`.

`config` distinguishes three things: `file` (what `launchpad.config.js` holds), `raw` (what's in effect, including this browser's edits) and a `preview` (arrange mode). `customized` and `fileChanged` tell Settings when the browser's copy and the file have drifted apart.

## Components

Every component renders into the **light DOM** (`createRenderRoot() { return this; }`), so the global stylesheet and custom CSS reach everything.

| File | Element | What it is |
| --- | --- | --- |
| `app-shell.ts` | `<app-shell>` | the page: header, grid of sections, footer |
| `components/site-header.ts`, `site-footer.ts` | `<site-header>`, `<site-footer>` | title, header links, theme button; footer and version |
| `components/hero-section.ts` | `<hero-section>` | the greeting |
| `components/clock-widget.ts`, `weather-widget.ts` | `<clock-widget>`, `<weather-widget>` | clock and weather |
| `components/quick-dock.ts` | `<quick-dock>` | the Pinned and Recent panels |
| `components/app-main.ts` | `<app-main>` | the cards, their groups and tiles |
| `components/tile-gallery.ts` | `<tile-gallery>` | a card's sideways-scrolling row of tiles |
| `components/tile-menu.ts` | `<tile-menu>` | one shared popover of quick actions (Popover API, CSS anchor positioning) |
| `components/added-widgets.ts` | `<embed-widget>`, `<data-widget>`, `<extension-widget>` | widgets added in Settings |
| `components/floating.ts` | `<pin-dock>`, `<page-actions>`, `<tile-lens>` | what floats over the page in the glass styles |
| `components/page-backdrop.ts` | `<page-backdrop>` | the backdrop, pointer glow, grain and background canvas |
| `components/arrange-ui.ts` | `<arrange-bar>` | arrange mode's toolbars, guides and bottom bar |
| `components/settings-panel.ts` | `<settings-panel>` | Settings: My view and Edit page |
| `components/setup-guide.ts` | `<setup-guide>` | the first-run guide |
| `components/color-picker.ts` | `<color-picker>` | the colour picker |

## Library

| File | What it does |
| --- | --- |
| `config.ts` | types, `normalize()` (validation and migration), the `config` store |
| `lib/config-file.ts` | reading and writing `launchpad.config.js` (dev server, File System Access API, or a download) |
| `lib/layout.ts` | placing items on the 12-column grid |
| `lib/arrange.ts`, `lib/sortable.ts` | arrange mode; drag and keyboard reordering |
| `lib/look.ts`, `colors.ts`, `combos.ts`, `style-css.ts`, `custom-css.ts` | the look: theme, style, colours, custom CSS |
| `lib/glass.ts`, `glass-controls.ts` | liquid glass; see [Liquid glass](liquid-glass.md) |
| `lib/extensions.ts` | `window.Launchpad`; see [Extension API](extension-api.md) |
| `lib/template.ts` | the Mustache subset for data widgets, and its sanitiser |
| `lib/csv.ts` | cards in and out of CSV |
| `lib/health.ts` | reachability checks (`HEAD`, `no-cors`, every two minutes) |
| `lib/examples.ts` | the example home page and launch page |
| `lib/prefs.ts`, `transition.ts`, `icons.ts`, `util.ts` | preferences, view transitions, Lucide icons, helpers |
| `backgrounds/particles.ts` | the built-in background, registered through the extension API |

## Styles

`src/index.css` declares the cascade layers and imports the rest:

```css
@layer tokens, base, components, utilities;
```

- **`styles/tokens.css`** holds every style's variables, light and dark. A style is built from three hues and six colours; the rest follow with `color-mix()` and relative colours.
- **`styles/looks.css`** holds what a style changes beyond variables: shapes, textures, type.
- **`styles/glass.css`** styles the liquid glass controls.
- **Custom CSS** goes in a `<style>` outside the layers, so it wins with plain selectors.

`data-*` attributes on cards, tiles, groups and sections are a public surface for custom CSS (see [Custom CSS](../functional/custom-css.md#hooks)); don't rename them.

## Safety boundaries

| Input | How it's contained |
| --- | --- |
| Extension files | only relative paths beside `index.html` (`isExtensionPath`); never a URL; off under `?safe` |
| Someone else's config, opened in Settings | the page asks before keeping its CSS, extensions, or widgets that show other sites |
| Data widget templates and data | values escaped; output sanitised to a short list of tags (`lib/template.ts`) |
| Embedded pages | a sandboxed `<iframe>` |
| The URL | no config is read from the query or hash |

## The build

`vite.config.ts` has three small plugins:

- **`configScript`** swaps the marker in `index.html` for `<script src="./launchpad.config.js">`.
- **`singleFile`** inlines the entry chunk and the CSS into `index.html` at build time. Fonts and other assets are inlined with `assetsInlineLimit`.
- **`saveConfigFile`** (dev server only) lets Settings write `public/launchpad.config.js` with a same-origin `PUT`.

`dist/` ends up with `index.html`, `launchpad.config.js`, `favicon.svg` and `extensions/`, the last three copied from `public/`.
