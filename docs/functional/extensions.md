# Extensions

Extensions are plain script files beside `index.html` that add new kinds of widget and background. This page is about using them; to write one, see the [Extension API](../technical/extension-api.md).

## The examples

Five come in the `extensions` folder. The demo has three of them turned on: the search box, Notes and the Glass lens.

| File | Adds |
| --- | --- |
| [`extensions/search.js`](../../public/extensions/search.js) | a **Search box** for the web, Wikipedia or your own site. It has no panel of its own, so it can stand in for the greeting. Press <kbd>/</kbd> to jump to it |
| [`extensions/notes.js`](../../public/extensions/notes.js) | a **Notes** widget: a scratchpad saved as you type, in this browser |
| [`extensions/lens.js`](../../public/extensions/lens.js) | a **Glass lens** widget: a lens of liquid glass to pick up and drag about the page. It bends and magnifies whatever is under it, and stays where you leave it |
| [`extensions/countdown.js`](../../public/extensions/countdown.js) | a **Countdown** widget: days, hours and minutes to a date |
| [`extensions/starfield.js`](../../public/extensions/starfield.js) | a **Starfield** background, in the style's own colours |

![The glass lens, dragged over the greeting](../images/lens.webp)

## Turning one on

1. Put the file beside `index.html`. The release zip already has the `extensions` folder.
2. List it in Settings → Edit page → Page → **Extensions**. The five examples can each be added with a click. In the config it's `"extensions": ["extensions/notes.js"]`.
3. Its widgets then appear under Edit page → Widgets → **Add a widget**, and its backgrounds under My view → **Background**.

The Extensions list shows what each file added, or why it didn't load.

> **Try it in the [demo](https://j-houghton.github.io/launchpad/):** Settings → Edit page → Page → Extensions, add **Starfield** and **Countdown**. Then pick Starfield under My view → Background, and add a Countdown under Widgets.

## What keeps them safe

An extension runs with full access to the page, so Launchpad is strict about where one can come from:

- They're only ever loaded from **files beside `index.html`**. An address, or a path that climbs out with `..`, is ignored. No config can make the page fetch code from elsewhere, and there's nowhere to paste code into.
- When you open **someone else's config** in Settings, the page asks before keeping any extensions it lists.
- **`?safe`** on the end of the page's address leaves them all out.

Only add extension files you've read or trust, as you would any script.
