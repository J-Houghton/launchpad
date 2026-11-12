# Extension API

An extension is a plain script file beside `index.html` that calls `window.Launchpad`. It can add kinds of widget and backgrounds, and put liquid glass on what it draws. For turning extensions on, and what keeps them safe, see [Extensions](../functional/extensions.md).

The five examples in [`public/extensions/`](../../public/extensions/) are the best reference, and three of them are running in the [demo](https://j-houghton.github.io/launchpad/): the search box, Notes and the Glass lens.

## A first widget

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
    return () => {};                   // optional: tidy up timers and listeners
  },
});
```

Save it as `extensions/hello.js`, list it under Settings → Edit page → Page → Extensions, and add a "Hello" under Widgets.

Extensions are plain scripts, not modules, so they also load from `file://`. They're loaded in the order listed.

## `Launchpad.widget(type, definition)`

Adds a kind of widget. `type` is lowercase letters, digits and dashes.

| Key | |
| --- | --- |
| `name` | shown under **Add a widget** |
| `description` | optional, shown beside it |
| `fields` | optional: the widget's settings |
| `bare` | optional: `true` leaves out the title bar and panel (the search box does this) |
| `render(el, options, ctx)` | draws the widget into `el`. Called when it appears and when its settings change. May return a function that tidies up |

**Fields** are `{ key, label, type?, default?, choices? }`. Types are `text` (the default), `textarea`, `number`, `url`, `date`, `datetime`, `checkbox` and `select` (with `choices`).

**`ctx`** has:

| | |
| --- | --- |
| `ctx.id`, `ctx.title` | the widget's id and title |
| `ctx.store.get(key, fallback)`, `ctx.store.set(key, value)` | storage in this browser, for that widget alone |
| `ctx.toast(message)` | shows a short message |

## `Launchpad.background(id, definition)`

Adds a background, offered in My view → Background. The page sizes the canvas, runs the frames and clears the canvas before each one. When motion is turned down, it draws a single still frame.

| Key | |
| --- | --- |
| `name`, `description` | shown in My view |
| `setup({ width, height })` | optional. Runs at the start and whenever the page is resized |
| `draw(context, frame)` | draws one frame on a 2D canvas context |

`frame` has `width`, `height`, `time`, `dt` (1 at 60 frames a second), `pointer` (`{ x, y }` or `null`), `colors` (`particle`, `accent`, `accent2`, `accent3`, `ink`, `muted`, `bg`) and `still`.

The built-in particles are registered the same way: see [`src/backgrounds/particles.ts`](../../src/backgrounds/particles.ts).

## `Launchpad.glass(element, options)`

Puts liquid glass on an element your extension drew. It's drawn and lit like the page's own controls: Chrome and Edge draw the lens, other browsers show frosted glass. Keep it for controls, like the search box's field, not a widget's whole panel (see [Liquid glass](liquid-glass.md)).

| Option | |
| --- | --- |
| `lens` | [liquid-glass-filter](https://github.com/J-Houghton/LiquidGLass-UI)'s parameters, such as `{ bezelWidth: 26, displacementScale: 40, magnify: 24 }` |
| `rim` | how wide the lit edge is, in CSS px. 2 by default; the page's own controls use 1 |
| `motion` | `true` makes it squish when pressed, rise a little under the pointer and stretch when dragged across. Or pass the package's motion settings (`press`, `drag`, `hover`, and `onFrame` to follow along). Less motion turns it off |
| `light` | `false` lights it from one side instead of from the page and the pointer |
| `always` | `true` makes it glass in every style. By default it's glass only in Aurora, Liquid and Neon, and the element keeps its own look in the rest |

It returns `{ update(lens), mode, destroy() }`. `mode` is `"glass"` or `"frost"`. Call `destroy()` when your widget tidies up.

```js
render(el) {
  const field = el.appendChild(document.createElement('input'));
  const glass = Launchpad.glass(field, { rim: 1 });
  return () => glass.destroy();
}
```

[`lens.js`](../../public/extensions/lens.js) uses all of it. `glass` is new in version 2 of the API.

## `Launchpad.toast(message)`

Shows a short message, the way the page's own toasts appear.

## `Launchpad.version`

The API's version, currently `2`. Check it before using something newer:

```js
if (Launchpad.version >= 2) Launchpad.glass(el);
```

## Styling

Style your widgets with the page's CSS variables (`--accent`, `--panel`, `--ink`, `--radius` and the rest; see [Custom CSS](../functional/custom-css.md#variables)), and they'll suit every style, light and dark. The examples show how.

## Rules the page enforces

- Only relative paths beside `index.html` are loaded. An address, or a path with `..`, is ignored.
- `?safe` in the page's address leaves every extension out.
- Opening someone else's config in Settings asks before keeping the extensions it lists.
- Settings → Edit page → Page → Extensions shows what each file added, or why it didn't load.
