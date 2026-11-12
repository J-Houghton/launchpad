# Launchpad docs

Everything here can be tried in the **[live demo](https://j-houghton.github.io/launchpad/)**. It's the page as it ships, with the sample config, and whatever you change there stays in your own browser. The guides below have **Try it** notes saying where to click.

## Using Launchpad

What the page does and how to set it up.

| Guide | What's in it |
| --- | --- |
| [A tour of the demo](functional/tour.md) | Five minutes around the page: tiles, pins, the header, Settings |
| [Editing and saving](functional/editing.md) | My view or Edit page, saving to the file, the first-run guide, sharing a config |
| [The config file](functional/config.md) | Every key in `launchpad.config.js`, tiles and columns, CSV import |
| [Layout](functional/layout.md) | The 12-column grid, arranging on the page, density, groups |
| [Widgets](functional/widgets.md) | Greeting, clock and weather; embedding a page; showing data through a template |
| [Styles, colours and liquid glass](functional/looks.md) | The seven styles, colour combos, what's drawn in glass, accessibility |
| [Custom CSS](functional/custom-css.md) | Variables and stable hooks for restyling the page |
| [Extensions](functional/extensions.md) | The five examples, turning them on, and what keeps them safe |
| [Status checks and privacy](functional/status-and-privacy.md) | What the dots mean, and what leaves your browser |

## Working on Launchpad

How it's built, for anyone changing the code or writing an extension.

| Page | What's in it |
| --- | --- |
| [Architecture](technical/architecture.md) | How the page starts, where state lives, a map of the source |
| [Liquid glass](technical/liquid-glass.md) | How the glass is drawn, and the pitfalls that turn it into a dark slab |
| [Extension API](technical/extension-api.md) | `Launchpad.widget`, `background`, `glass` and `toast` in full |
| [Testing](technical/testing.md) | The browser tests: running them, how they're written |
| [Building and releasing](technical/releasing.md) | The single-file build, the release workflow, retaking these screenshots |

## About the screenshots

The pictures in these docs come from [`scripts/screenshots.mjs`](../scripts/screenshots.mjs), which drives the built page in a real browser. Retake them after a change to the page's look:

```sh
npm run build && npm run docs:shots
```
