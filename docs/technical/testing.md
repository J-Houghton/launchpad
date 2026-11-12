# Testing

The tests in [`tests/e2e`](../../tests/e2e) drive a real browser against the **built page**, opened from disk the way it's really used: clicking through Settings, dragging, scrolling, and checking what the page did. They use the [Playwright](https://playwright.dev/) test runner.

What they exercise is what you can do by hand in the [demo](https://j-houghton.github.io/launchpad/); each file is one walk through a feature.

## Running them

```sh
npm test                       # builds the page, then runs every test (about 4 minutes)
npm run test:quick             # runs them against the build already in dist/
npx playwright test layout     # one file
npx playwright test --headed   # watch it happen
```

One-time setup:

- **Windows:** nothing; the tests use Edge, which is already there.
- **Elsewhere:** `npx playwright install chromium`.
- **Firefox tests:** `npx playwright install firefox`.

Set `LAUNCHPAD_BROWSER` to `msedge`, `chrome` or `chromium` to choose the browser. Liquid glass is only drawn by Chromium browsers, so the main run needs one.

## What's covered

| File | Walks through |
| --- | --- |
| `home-and-columns.spec.js` | home page or launch page, the card editor, the sideways tile gallery |
| `layout.spec.js` | the 12-column grid: placement, sizes, arranging, the Layout tab, old configs |
| `looks.spec.js` | styles, backgrounds, motion and density, yours and the page's; the examples |
| `colours.spec.js` | colours per style and theme, the page's own, `?safe` |
| `custom-css.spec.js` | custom CSS from the file, its hooks, editing and saving, someone else's, `?safe` |
| `style-css.spec.js` | custom CSS that starts from the page's style |
| `widgets.spec.js` | added widgets: embeds and data |
| `extensions.spec.js` | loading, the examples, the ready-made data widgets, safe mode, what's refused |
| `glass.spec.js` | liquid glass on the controls and what floats, never on the content |
| `settings-glass.spec.js` | Settings in glass: dragging a selection, switches, the footer, the card search |
| `lens-and-folding.spec.js` | the Glass lens extension; a group of cards folding |
| `choices.firefox.spec.js` | in Firefox, Settings' rows of choices can be chosen |

## How they're written

**Each test gets its own copy of the page.** `sites(suite)` in [`support.js`](../../tests/e2e/support.js) copies `dist/index.html` and the example extensions into a throwaway folder with the config the test wants, and returns its `file://` address. Fixtures in `tests/e2e/fixtures` include a version 3 config, because old configs must keep loading.

**Checks are soft.** `checks()` returns `ok(condition, what)`, which records a failure and carries on, so one run shows everything that's wrong. `done()` fails the test if the page threw or logged an error.

```js
const { log, ok, done } = checks();
const page = await context.newPage();
page.on('pageerror', e => log.push('[pageerror] ' + e.message));
await page.goto(site('sample', sample));

ok(await page.locator('.env-tile').count() > 0, 'the tiles are there');
done();
```

**Wait for the page, not the clock, where you can.** `settled(page)` waits for a view transition to finish; while one runs, the page is a picture of itself and a drag begun too soon is lost. A lens appears a frame or two after its element, so wait for `[data-lens]` before checking it.

**`glass.spec.js` runs against the dev server.** It imports the source modules to inspect each lens, so the run starts Vite on port 5179, or reuses one that's already there.

## Good to know

- **Two files run at a time.** The checks time animations, and a busy machine throws them off. A very busy one can still make a test fail; run that file again on its own.
- **What's left behind** goes in `test-results/` (ignored by git): screenshots taken along the way, and the throwaway copies of the page.
- **They aren't run in CI yet.** The workflow type-checks and builds; run `npm test` before merging.
- Some fixed pauses remain where an animation has no event to wait for.

## Adding a test

1. Add a `*.spec.js` in `tests/e2e`, or extend the file that walks through that feature.
2. Start from `sample` (a home page with four cards) and change only what the test needs.
3. Name each check for what a person would see: "the dock comes up once Pinned has scrolled away".
4. For anything that only matters in Firefox, name the file `*.firefox.spec.js`.
