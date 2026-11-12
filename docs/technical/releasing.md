# Building and releasing

## Building

Node 22 or newer.

```sh
npm install
npm run dev        # dev server with live reload; Settings saves straight to public/launchpad.config.js
npm run build      # type-check, then build to dist/
npm run preview    # serve dist/ locally
```

`dist/` holds everything the page needs:

| File | |
| --- | --- |
| `index.html` | the whole app: JS, CSS and fonts inlined |
| `launchpad.config.js` | the sample config, copied from `public/` |
| `favicon.svg` | |
| `extensions/` | the five example extensions |

Open `dist/index.html` straight from disk; no server is needed. See [Architecture](architecture.md#the-build) for how the single file is put together.

The repository has no `package-lock.json` on purpose, so use `npm install`, not `npm ci`.

## What the workflow does

[`.github/workflows/build.yml`](../../.github/workflows/build.yml) runs on every push to `main` and every pull request.

| When | What happens |
| --- | --- |
| Pull request | type-check and build; the built page is attached to the run as a `launchpad` artifact |
| Push to `main` | the same, then **deploy to GitHub Pages** (the [demo](https://j-houghton.github.io/launchpad/)) and **publish a GitHub Release** with notes, the zipped page, and `index.html` on its own |

So merging to `main` is releasing. There's no separate release step.

A push that only touches Markdown, `docs/`, `scripts/` or the license doesn't build or release. Neither does a commit message containing `[skip ci]`.

To publish Pages from a fork, set **Settings → Pages → Source** to **GitHub Actions** once.

## Version numbers

Releases are numbered automatically:

- The first release uses the version in `package.json`.
- After that, each push to `main` bumps the patch: `2.3.0` → `2.3.1` → …
- For a bigger step, raise `package.json` by hand (say to `2.4.0`) and the next release starts there.

The version is shown in the page's footer. Local builds end in `-dev`.

## Before merging

1. `npm test` passes (see [Testing](testing.md)); CI doesn't run it.
2. If the page's look changed, retake the screenshots (below).
3. Nothing private is in `public/launchpad.config.js`. **It's published with the demo.**

## The demo

The demo is `dist/` as built from `main`: the page with the sample config, [`public/launchpad.config.js`](../../public/launchpad.config.js). To change what the demo shows, change that file.

> Anything in a published `launchpad.config.js` is public. Keep private addresses and internal hostnames in your own local copy.

## Screenshots for the docs

The pictures in the README and these docs are taken by [`scripts/screenshots.mjs`](../../scripts/screenshots.mjs), which drives the built page the same way the tests do and writes WebP files to `docs/images/`.

```sh
npm run build && npm run docs:shots
```

| Image | Shows |
| --- | --- |
| `home-light.webp`, `home-dark.webp` | the sample home page |
| `launch-page.webp` | a launch page, from the tests' version 3 config |
| `styles.webp` | the seven styles on one sheet |
| `settings-my-view.webp`, `settings-edit.webp` | Settings |
| `arrange.webp` | arranging the page |
| `glass-floating.webp` | the dock, a sticky heading, the corner buttons and the tile lens |
| `lens.webp` | the Glass lens, picked up |

The clock and the greeting follow the time of day, so they change from one run to the next.

## The glass package

Liquid glass comes from [liquid-glass-filter](https://github.com/J-Houghton/LiquidGLass-UI), pinned to a tag in `package.json`:

```json
"liquid-glass-filter": "github:J-Houghton/LiquidGLass-UI#v2.2.0"
```

To take a newer version, change the tag and install it by name, so npm doesn't keep the copy it already has:

```sh
npm install "liquid-glass-filter@github:J-Houghton/LiquidGLass-UI#v2.3.0"
```
