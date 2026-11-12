# Status checks and privacy

## Status checks

With status checks on, each tile gets a dot that's refreshed every couple of minutes.

- **A green dot means the host answered**, not that the app is healthy. Each check is a lightweight `no-cors` request, so the page never sees the response, only whether one came.
- "Unreachable" means the name didn't resolve, the connection failed or it timed out (six seconds).

Turn them off for the whole page (Settings → Edit page → Page → **Status checks**, or `"statusChecks": false`), for one card, or for one tile (`"health": false` on either).

Two things to know:

- Opened straight from a file, Chrome and Edge ask permission to reach your local network for these checks. Turn the checks off to avoid the prompt.
- A page served over `https` can't check plain-`http` hosts.

The [demo](https://j-houghton.github.io/launchpad/) has them off, since its tiles point at example addresses.

## Privacy

Everything runs in your browser. There's no server, no account and no analytics.

**What leaves your browser**, out of the box:

- the weather forecast and place search, from [Open-Meteo](https://open-meteo.com/);
- the status checks, to your own tiles' addresses, if they're on.

**What you add:**

- an embedded page or a data widget reaches the address you give it;
- the search box sends what you type to the engine you chose, and only when you search.

**What's kept in your browser** (local storage): your My view choices, pins and recent tiles, edits you haven't saved to the file, and anything typed into Notes.

> Anything in a **published** `launchpad.config.js` is public. Keep private addresses and internal hostnames in your own local copy.
