# Launchpad - [Demo](https://j-houghton.github.io/launchpad/)
A single-page home for your links, set up one of two ways:

- **A personal home page**: your projects, sites and bookmarks, sorted into cards by category.
- **A launch page**: each card is an app, with a tile for each of its environments (DEV, TEST, PROD…) lined up in columns from card to card.

Either way you can pin the tiles you use most and see what you opened recently. Optional reachability dots, a clock and the weather sit alongside, and you can add widgets of your own: another site in a frame, live data from any JSON address, or one from an extension.

It builds to **one self-contained `index.html`** that runs straight from disk, with no server needed. The page reads its content from a **`launchpad.config.js`** file sitting next to it. Set it up once, then share the config file with your team.

## Features

- **Cards and tiles**: each card is a row on the page, holding tiles. A tile can have a short tag such as `WEB` or `REPO`. A card with more than four tiles shows them in one row that scrolls sideways, with arrows and faded edges where there's more to see.
- **Columns**: turn them on for a launch page. Define your own columns and colors, or start from a preset; each card then gets one tile per column. Turning columns off keeps them, and their tiles show as ordinary tiles tagged with the column's name.
- **Layout**: the page is a 12-column grid, as in Oracle APEX or Bootstrap. Each section (greeting, clock, weather, pinned, recent, cards) and each card has a width from 1 to 12 columns, or Auto. Each one either starts a new row or shares one, so two small cards can sit side by side. Arrange it right on the page, where the columns show faintly: drag things around, drag an edge to resize, hide sections. Or use Settings → Edit page → Layout. A compact density fits more on screen.
- **Groups**: sort cards into collapsible sections.
- **Quick access**: pin tiles and see recently opened ones. Right-click any tile to open it, copy its URL or copy its host.
- **Widgets**: besides the greeting, clock and weather, add your own in Settings → Edit page → Widgets.
  - **Embed a page**: a status page, a dashboard panel or a calendar, in a sandboxed frame.
  - **Show data from a URL**: JSON fetched every few minutes and shown through a simple template. Four come ready-made: a GitHub repository, the Hacker News front page, exchange rates, and a service's status page.
  - **From an extension**: script files beside `index.html` can add new kinds of widget and background. Four examples come with Launchpad: Notes, Countdown, a Search box and a Starfield background.

  Each is a section of its own, to place and size like the rest.
- **Status dots**: optional reachability checks every couple of minutes. Switch them off for the whole page, a single card or a single tile.
- **In-page settings**: edit everything in the browser (the gear at the bottom of the page, or <kbd>Ctrl</kbd>+<kbd>,</kbd>). Drag to reorder, import and export cards as CSV, and save straight back to `launchpad.config.js`.
- **Styles**: six looks, each light or dark, that change shapes, type and texture as well as colour.
  - **Aurora**: a frosted-glass glow.
  - **Classic**: crisp panels with striped margins.
  - **Blueprint**: grid paper, square corners and monospaced type.
  - **Paper**: a printed look, with serif headings and inked outlines.
  - **Neon**: a glowing grid at night.
  - **Bold**: chunky borders and hard shadows.

  Behind the page there can be drifting particles, the style's backdrop alone, or a plain colour. Pick a look in Settings → My view; **Make it everyone's** turns yours into the page's own.
- **My view**: personal choices stay in your browser and never change the page for anyone else. These are your look, less motion, hidden cards and pins.
- **First-run guide**: an empty page walks you through naming it and choosing "just links" or a set of columns. Then you add a few cards or paste them from a spreadsheet. Or start from an example: a home page, or a team's launch page. Settings → Edit page → **File** loads the examples any time, to look around.
- A few modern touches: view transitions, anchor-positioned menus and scroll-driven effects. All of them calm down when your device asks for less motion, or when you choose it in My view.

## Quick start

**Use a ready-made build:** download `launchpad-vX.Y.Z.zip` from the latest **Release**, unzip it and open `index.html`. Already set up? Just replace your `index.html` with the one attached to the release. Your `launchpad.config.js` keeps working, including configs written for older versions. To try the example extensions as well, copy the `extensions` folder from the zip next to it.

**Or build it yourself** (Node 22 or newer):

```sh
npm install
npm run build      # → dist/index.html, dist/launchpad.config.js, dist/favicon.svg, dist/extensions/
```

Open `dist/index.html` in your browser. To work on the code, `npm run dev` starts a dev server with live reload.

## Configuring

Everything lives in `launchpad.config.js` next to `index.html`. The source copy is `public/launchpad.config.js`. Change it and reload the page; no rebuild is needed.

- **In the page:** open Settings → **Edit page**, make your changes, then **Save to file**. Its four tabs are **Cards** (with the columns, if you use them), **Layout**, **Widgets** and **Page** (title, logo, header links, status checks and custom CSS). The **File** menu opens or downloads a config, or loads an example. In Chrome and Edge you pick the file once, and later saves go straight to it. Other browsers download a new copy for you to put next to `index.html`. **Save** on its own keeps changes in this browser only.
- **By hand:** the file is plain JSON after `window.LAUNCHPAD_CONFIG =`, so keep it valid JSON. The bundled sample is a personal home page, with two of the example extensions turned on (a search box and notes):

| Key | What it sets |
| --- | --- |
| `site` | `title`, `heading` (shown above the cards, e.g. `"Projects"`; `""` hides it), `footer`, and an optional `logo` (a path like `"./logo.svg"`, or an SVG uploaded in Settings) |
| `statusChecks` | `true` / `false`: reachability dots for the whole page |
| `useColumns` | `true` / `false`: line tiles up in `columns` (a launch page) |
| `columns` | the columns: `id`, `label`, `color`, and `caution: true` for a "handle with care" hatch |
| `groups` | named sections: `id`, `name` |
| `links` | header links: `label`, `url` |
| `cards` | `id`, `name`, `description`, `badge`, `group`, `links` (buttons under the name), `health: false` to skip its checks, `span` and `newRow` (see Layout below), and `tiles` (below) |
| `widgets` | `greeting`; `clock` (`zones`; `"timeZone": "local"` follows the viewer); `weather` (`place`, `latitude`, `longitude`, `units`); `added`, your own widgets (see Widgets below) |
| `layout` | `density` (`"comfortable"` or `"compact"`) and `sections`: each section once, in page order, as `{ "id", "span", "newRow", "hidden" }` |
| `look` | the page's look: `theme` (`"system"`, `"light"` or `"dark"`), `style` (`"aurora"`, `"classic"`, `"blueprint"`, `"paper"`, `"neon"` or `"bold"`) and `background` (`"particles"`, `"still"` or `"plain"`). Anyone's own choices in My view come first. Plus `css`, the page's custom CSS (see below). |
| `extensions` | extension files to load, as paths beside `index.html`, e.g. `"extensions/notes.js"` (see Extensions below) |

On a home page, a tile is `{ "name": "Recipe box", "url": "https://…", "label": "WEB" }`. `label` is the small tag and is optional; so are `color` and `id`. Give an `id` if you want pins to survive renaming the tile.

On a launch page, a tile names its column instead:

```json
"useColumns": true,
"columns": [
  { "id": "dev", "label": "DEV", "color": "#0b95da" },
  { "id": "prod", "label": "PROD", "color": "#e61a5e", "caution": true }
],
"cards": [
  {
    "id": "billing", "name": "Billing", "links": [{ "label": "Docs", "url": "https://docs.example.com/billing" }],
    "tiles": [
      { "column": "dev", "url": "https://dev.billing.example.com", "name": "Latest build" },
      { "column": "prod", "url": "https://billing.example.com", "name": "Live" }
    ]
  }
]
```

Any tile can also take `"health": false`, which skips its reachability check. Configs from older versions (with `apps`, `envs` and `environments`) still load, and are saved in this format.

### Layout

Sections and cards sit on a 12-column grid and follow the same rules as Oracle APEX regions:

- `"span": 1`–`12` sets an item's width in columns. Leave it out (**Auto**) and the item shares what's left of its row equally with the other Auto items.
- Each item starts a new row unless it has `"newRow": false`, which puts it beside the item before when there's room.
- On medium screens, anything a third wide or less goes half width and the rest full width. On phones, only quarter-width items, like the clock and weather, stay side by side.

The default puts the greeting beside the clock and weather, and pinned beside recent:

```json
"layout": {
  "density": "comfortable",
  "sections": [
    { "id": "greeting" },
    { "id": "clock", "span": 3, "newRow": false },
    { "id": "weather", "span": 3, "newRow": false },
    { "id": "pinned" },
    { "id": "recent", "span": 5, "newRow": false },
    { "id": "cards" }
  ]
}
```

Add `"hidden": true` to hide a section; every section except the cards can be hidden. To put two cards side by side, give the second one `"newRow": false`.

### Widgets

Added widgets live in `widgets.added`, and each one's `id` is its section in `layout`. Widgets you leave out of the layout go just before the cards.

```json
"added": [
  { "id": "status", "type": "embed", "title": "Status", "url": "https://status.example.com", "height": 320 },
  { "id": "builds", "type": "data", "title": "Builds", "url": "https://ci.example.com/api/builds.json", "refresh": 5,
    "template": "<ul>{{#builds}}<li><a href=\"{{url}}\">{{name}}</a> <small>{{finished | ago}}</small></li>{{/builds}}</ul>" }
]
```

- **`embed`** shows `url` in a frame `height` pixels tall. Some sites refuse to be shown inside other pages and stay blank; the arrow in the widget's corner opens them in a tab instead.
- **`data`** fetches `url` every `refresh` minutes (`0`: only when the page opens) and fills in `template`. A longer template can be a list of lines, as custom CSS is. Leave the template out to see the data as it comes, or use **Try it** in Settings.

Templates are a small part of [Mustache](https://mustache.github.io/mustache.5.html):

| | |
| --- | --- |
| `{{name}}`, `{{owner.login}}`, `{{items.0.title}}` | a value |
| `{{#items}}…{{/items}}` | repeats for each item; inside, `{{name}}` is the item's and `{{.}}` is the item itself. `{{#.}}…{{/.}}` goes through data that's a list to begin with |
| `{{^items}}…{{/items}}` | shows when the list is empty, or the value is missing or false |
| `{{when \| ago}}` | formatted: `ago`, `date`, `time`, `number`, `upper`, `lower` |

Values are escaped. Only simple tags are kept, plus their class names for custom CSS: `b`, `i`, `a`, lists, `p`, `span`, `small`, `code`, `img`, tables. Links open in a new tab, and anything else is left out, so neither a template nor the data it shows can run scripts on the page.

Opened from a file, the page can only read servers that let other sites read them (CORS). Most public APIs do; for your own, the server needs to send `Access-Control-Allow-Origin`. When you open someone else's config in Settings, the page asks before keeping any widgets it adds that show other sites.

### Custom CSS

For anything the styles don't cover, add your own CSS in Settings → Edit page → Page → **Custom CSS**. The page behind the settings window shows it as you type. Launchpad's own styles sit in cascade layers and yours come after them, so a plain selector is enough to win. In `launchpad.config.js` it's `look.css`, one line per entry:

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

Most changes are just a variable. Set them on `:root`, on `.theme-dark` for dark only, or on `:root[data-style="paper"]` for one style.

| Variables | |
| --- | --- |
| Colours | `--accent`, `--accent-2`, `--accent-3`, `--ink` (text), `--muted`, `--bg`, `--glass` (cards and panels), `--glass-border`, `--tile`, `--hairline`, `--ring` (focus) |
| Shapes | `--radius-sm`, `--radius`, `--radius-lg`, `--radius-full`, `--border-w`, `--mark-radius` (card badges), `--shadow-sm`, `--shadow`, `--shadow-lg` |
| Type | `--font-heading`, `--font-label`, `--font-numeric`, `--font-display` (the greeting), `--title-size`, `--section-size`, `--heading-weight`. The bundled faces are `--font-sans` (Inter), `--font-serif` (Instrument Serif) and `--font-mono`. |
| Backdrop | `--page-bg` (a pattern), `--blob-1` to `--blob-4` (the glow), `--particle`, `--grain-opacity` |

These hooks are kept stable from version to version:

| Hook | What it is |
| --- | --- |
| `[data-card="id"]` | a card; set its `--hue` (0–360) to recolour its badge and tiles |
| `[data-tile="id"]`, `[data-column="id"]` | a tile; its id comes from its name (e.g. `recipe-box`), or is its column's. Set its `--env` to recolour it |
| `[data-group="id"]` | a group of cards (`other` for cards without one) |
| `[data-section="…"]` | `greeting`, `clock`, `weather`, `pinned`, `recent`, `cards`, or an added widget's `id` |
| `:root[data-style]`, `.theme-dark`, `:root[data-density="compact"]`, `:root[data-motion="reduced"]` | the look in effect |

If your CSS ever hides the way back to Settings, open the page with `?safe` on the end of its address (`index.html?safe`). Custom CSS stays off until you take `?safe` away again.

When you open someone else's config file in Settings, the page asks before keeping any CSS in it. CSS can make a page look like something it isn't, and can load images and fonts from other sites.

Rebuilding replaces `dist/launchpad.config.js` with the one from `public/`. Copy your edited config back there first, or keep your live config outside `dist`.

**CSV import** (Settings → Edit page → Cards → Spreadsheet → Import from CSV) accepts either layout. Unknown columns and groups are created for you, and **Download a template** gives you a starting point.

- **One row per link:** `category`, `name` and `url` columns, plus optional `tag`, `description` and `group`. Rows with the same category share a card. A `column` value puts that row's tile in one of the page's columns.
- **One row per card**, for a launch page: a `name` column, plus optional `description`, `group` and `badge`. Add one more per page column, headed by its label (e.g. `DEV`), and `link:Docs`-style columns for link buttons.

### Extensions

Extensions are plain script files beside `index.html` that add kinds of widget and backgrounds. List them under Settings → Edit page → Page → **Extensions**, or in `"extensions"` in `launchpad.config.js`. Their widgets then appear under **Add a widget**, and their backgrounds in My view.

Four examples come in the `extensions` folder, and Settings can add each one with a click:

| File | Adds |
| --- | --- |
| `extensions/notes.js` | a **Notes** widget: a scratchpad saved as you type, in this browser |
| `extensions/countdown.js` | a **Countdown** widget: days, hours and minutes to a date |
| `extensions/search.js` | a **Search box** for the web, Wikipedia or your own site. It has no panel of its own, so it can stand in for the greeting. Press <kbd>/</kbd> to jump to it |
| `extensions/starfield.js` | a **Starfield** background, in the style's own colours |

An extension runs with full access to the page, so:

- They're only ever loaded from files beside `index.html`. An address, or a path that climbs out with `..`, is ignored. No config can make the page fetch code from elsewhere, and there's nowhere to paste code into.
- When you open someone else's config in Settings, the page asks before keeping any extensions it lists.
- `?safe` on the end of the page's address leaves them all out.

Writing one takes a few lines. Each file calls `window.Launchpad`:

```js
// extensions/hello.js
Launchpad.widget('hello', {
  name: 'Hello',                       // shown under "Add a widget"
  description: 'Says hello to someone.',
  fields: [                            // its settings, under Widgets
    { key: 'who', label: 'Who to greet', default: 'world' },
  ],
  render(el, options, ctx) {           // when it appears, and when its settings change
    el.textContent = `Hello, ${options.who}!`;
    // ctx.id, ctx.title, ctx.store.get(key, fallback) / ctx.store.set(key, value), ctx.toast(message)
    return () => {};                   // optional: tidy up timers and listeners
  },
});
```

- **`Launchpad.widget(type, { name, description?, fields?, bare?, render })`** adds a kind of widget.
  - `type` is lowercase letters, digits and dashes.
  - Field types are `text` (the default), `textarea`, `number`, `url`, `date`, `datetime`, `checkbox` and `select` (with `choices`).
  - `bare: true` leaves out the title bar and panel.
  - `ctx.store` keeps things in this browser, for that widget alone.
- **`Launchpad.background(id, { name, description?, setup?, draw })`** adds a background. The page sizes the canvas, runs the frames and clears it before each one. When motion is turned down, it draws a single still frame instead.
  - `setup({ width, height })` runs at the start and whenever the page is resized.
  - `draw(context, frame)` draws one frame. `frame` has `width`, `height`, `time`, `dt` (1 at 60 frames a second), `pointer` (`{ x, y }` or `null`), `colors` (`particle`, `accent`, `accent2`, `accent3`, `ink`, `muted`, `bg`) and `still`.
  - The built-in particles are registered the same way: see `src/backgrounds/particles.ts`.
- **`Launchpad.toast(message)`** shows a short message.

Style your widgets with the page's CSS variables (see Custom CSS above), and they'll suit every style. The examples show how. Settings → Edit page → Page → Extensions shows what each file added, or why it didn't load.

## Status checks

Each check is a lightweight `no-cors` request, so a green dot means *the host answered*, not that the app is healthy. When the page is opened straight from a file, Chrome and Edge ask permission to reach your local network for these checks. To avoid that, turn the checks off in Settings → Edit page → Page. Pages served over `https` can't check plain-`http` hosts.

## Deploying

`.github/workflows/build.yml` type-checks and builds every push and pull request, and attaches the built page as a downloadable artifact. For every push to `main`, it also:

- publishes the page to GitHub Pages (set **Settings → Pages → Source** to **GitHub Actions** once), and
- creates a **GitHub Release** with release notes, the zipped page, and `index.html` on its own.

Releases are numbered automatically. The first uses the version in `package.json`; after that, each push to `main` bumps the patch (`1.0.0` → `1.0.1` → …). For a bigger step, raise `package.json` by hand (say to `1.1.0`). Changes to Markdown files or the license alone don't make a release, and neither does a commit message containing `[skip ci]`. The version is shown in the page footer; local builds end in `-dev`.

> Anything in a published `launchpad.config.js` is public. Keep private addresses and internal hostnames in your own local copy.

## Privacy

Everything runs in your browser. Out of the box, the only outside requests are the weather and place search from [Open-Meteo](https://open-meteo.com/), plus the status checks to your own tile addresses. Widgets you add reach the addresses you give them, and the search box sends what you type to the engine you chose only when you search. Personal settings, and anything typed into Notes, are kept in the browser's local storage.

## Built with

[Lit](https://lit.dev/) and [Vite](https://vite.dev/), with [Lucide](https://lucide.dev/) icons and the [Inter](https://rsms.me/inter/) and [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) typefaces (SIL Open Font License 1.1), bundled into the build.

## License

[MIT](LICENSE)
