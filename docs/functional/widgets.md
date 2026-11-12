# Widgets

A widget is a section of the page that isn't a card: the greeting, the clock, the weather, and any you add. Each one is placed and sized like the rest of the page (see [Layout](layout.md)).

Set them up in Settings → Edit page → **Widgets**.

## Built in

| Widget | Settings |
| --- | --- |
| **Greeting** | its headline and subtitle, and whether the headline types itself out |
| **Clock** | one or more time zones. `"timeZone": "local"` follows whoever is looking |
| **Weather** | a place (search by name), and Celsius or Fahrenheit. The forecast comes from [Open-Meteo](https://open-meteo.com/) |
| **Pinned**, **Recent** | no settings: they fill as you pin and open tiles |

## Adding your own

**Add a widget** offers three kinds.

### Embed a page

Another site in a frame: a status page, a dashboard panel, a calendar.

```json
{ "id": "status", "type": "embed", "title": "Status", "url": "https://status.example.com", "height": 320 }
```

The frame is sandboxed and `height` pixels tall. Some sites refuse to be shown inside other pages and stay blank; the arrow in the widget's corner opens them in a tab instead.

### Show data from a URL

JSON fetched every few minutes and shown through a template.

```json
{ "id": "builds", "type": "data", "title": "Builds", "url": "https://ci.example.com/api/builds.json", "refresh": 5,
  "template": "<ul>{{#builds}}<li><a href=\"{{url}}\">{{name}}</a> <small>{{finished | ago}}</small></li>{{/builds}}</ul>" }
```

- `refresh` is in minutes; `0` fetches only when the page opens.
- A longer `template` can be a list of lines.
- Leave the template out to see the data as it comes, or use **Try it** in Settings.

Four come ready-made: a GitHub repository, the Hacker News front page, exchange rates, and a service's status page.

> **Try it in the [demo](https://j-houghton.github.io/launchpad/):** Settings → Edit page → Widgets → Add a widget → **A GitHub repository**, then **Try it** to see the data and the template side by side.

#### Templates

Templates are a small part of [Mustache](https://mustache.github.io/mustache.5.html):

| | |
| --- | --- |
| `{{name}}`, `{{owner.login}}`, `{{items.0.title}}` | a value |
| `{{#items}}…{{/items}}` | repeats for each item; inside, `{{name}}` is the item's and `{{.}}` is the item itself. `{{#.}}…{{/.}}` goes through data that's a list to begin with |
| `{{^items}}…{{/items}}` | shows when the list is empty, or the value is missing or false |
| `{{when \| ago}}` | formatted: `ago`, `date`, `time`, `number`, `upper`, `lower` |

Values are escaped. Only simple tags are kept, plus their class names for [custom CSS](custom-css.md): `b`, `i`, `a`, lists, `p`, `span`, `small`, `code`, `img`, tables. Links open in a new tab, and anything else is left out, so neither a template nor the data it shows can run scripts on the page.

#### Which addresses work

Opened from a file, the page can only read servers that let other sites read them (CORS). Most public APIs do; for your own, the server needs to send `Access-Control-Allow-Origin`.

### From an extension

Script files beside `index.html` can add new kinds of widget. The demo's search box, Notes and Glass lens are all extensions. See [Extensions](extensions.md).

## In the config

Added widgets live in `widgets.added`, and each one's `id` is its section in `layout`. Widgets you leave out of the layout go just before the cards.

When you open someone else's config in Settings, the page asks before keeping any widgets in it that show other sites.
