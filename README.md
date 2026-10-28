# Launchpad - [Demo](https://j-houghton.github.io/launchpad/)
A single-page launchpad for your apps and their environments — every app in a row, with a tile per environment (DEV, TEST, PROD…), pins, recent history, reachability dots, a clock and weather.

It builds to **one self-contained `index.html`** that runs straight from disk — no server needed — and reads its content from a **`launchpad.config.js`** file sitting next to it. Set it up once, share the config file with your team.

## Features

- **Apps × environments** — define your own environments (columns) and colors, or start from a preset; group apps into collapsible sections.
- **Quick access** — pin environments, see recently opened ones, right-click any tile for open / copy URL / copy host.
- **Status dots** — optional reachability checks every couple of minutes, switchable for the whole page, per app or per environment.
- **In-page settings** — edit everything in the browser (gear at the bottom of the page, or <kbd>Ctrl</kbd>+<kbd>,</kbd>), drag to reorder, import/export apps as CSV, and save straight back to `launchpad.config.js`.
- **My view** — personal choices (theme, palette, hidden apps, pins) stay in your browser and never change the page for anyone else.
- **First-run guide** — an empty page walks you through naming it, picking environments and adding apps.
- Light / dark themes, two palettes, and a few modern touches (view transitions, anchor-positioned menus, scroll-driven effects).

## Quick start

**Use a ready-made build:** open the latest run under **Actions**, download the **launchpad** artifact, unzip it and open `index.html`.

**Or build it yourself** (Node 22 or newer):

```sh
npm install
npm run build      # → dist/index.html, dist/launchpad.config.js, dist/favicon.svg
```

Open `dist/index.html` in your browser. To work on the code, `npm run dev` starts a dev server with live reload.

## Configuring

Everything lives in `launchpad.config.js` next to `index.html` (the source copy is `public/launchpad.config.js`). Change it and reload the page — no rebuild needed.

- **In the page:** open Settings → **Edit page**, make your changes, then **Save to file**. In Chrome and Edge you pick the file once and later saves go straight to it; other browsers download a new copy to put next to `index.html`. **Save** alone keeps changes in this browser only.
- **By hand:** it's plain JSON after `window.LAUNCHPAD_CONFIG =` — keep it valid JSON. The bundled sample shows every option:

| Key | What it sets |
| --- | --- |
| `site` | `title`, `footer`, and an optional `logo` (a path like `"./logo.svg"`, or an SVG uploaded in Settings) |
| `statusChecks` | `true` / `false` — reachability dots for the whole page |
| `environments` | the columns: `id`, `label`, `color`, and `caution: true` for a "handle with care" hatch |
| `groups` | named sections: `id`, `name` |
| `links` | header links: `label`, `url` |
| `apps` | `id`, `name`, `description`, `badge`, `group`, `links`, `health: false` to skip its checks, and `envs` — one `{ env, url, name? }` per environment it has |
| `widgets` | `greeting`, `clock` (`zones`; `"timeZone": "local"` follows the viewer), `weather` (`place`, `latitude`, `longitude`, `units`) |

Rebuilding replaces `dist/launchpad.config.js` with the one from `public/`, so copy your edited config back there first (or keep your live config outside `dist`).

**CSV import** (Settings → Applications): a `name` column (required), optional `description`, `group` and `badge`, one column per environment headed by its label (e.g. `DEV`), and `link:Docs`-style columns for links. Unknown environments and groups are created for you; **Download a template** gives you a starting point.

## Status checks

Each check is a lightweight `no-cors` request, so a green dot means *the host answered*, not that the app is healthy. When the page is opened straight from a file, Chrome and Edge ask permission to reach your local network for these checks — turn them off in Settings → Edit page → Environments to avoid that. Pages served over `https` can't check plain-`http` hosts.

## Deploying

`.github/workflows/build.yml` type-checks and builds every push and pull request, attaches the built page as a downloadable artifact, and publishes `main` to GitHub Pages. To enable Pages, set **Settings → Pages → Source** to **GitHub Actions** once.

> Anything in a published `launchpad.config.js` is public. Keep internal hostnames in your own local copy.

## Privacy

Everything runs in your browser. The only outside requests are the weather (and place search) from [Open-Meteo](https://open-meteo.com/), plus the status checks to your own environment addresses. Personal settings are kept in the browser's local storage.

## Built with

[Lit](https://lit.dev/) and [Vite](https://vite.dev/), with [Lucide](https://lucide.dev/) icons and the [Inter](https://rsms.me/inter/) and [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) typefaces (SIL Open Font License 1.1), bundled into the build.

## License

[MIT](LICENSE)
