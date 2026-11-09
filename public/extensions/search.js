// Search box — search the web, or your own site, from the page. Press / to jump to it.
//
// One of the example extensions that come with Launchpad. To use it, add "extensions/search.js" under
// Settings → Edit page → Page → Extensions (or to "extensions" in launchpad.config.js) and save; then add a
// Search box widget under Widgets. It has no panel of its own ("bare"), so it also works in place of the
// greeting: hide the greeting under Layout and put the search box in its row.
(() => {
  const ENGINES = {
    duckduckgo: 'https://duckduckgo.com/?q=%s',
    google: 'https://www.google.com/search?q=%s',
    bing: 'https://www.bing.com/search?q=%s',
    wikipedia: 'https://en.wikipedia.org/w/index.php?search=%s',
  };

  const css = document.createElement('style');
  css.textContent = `
    .lp-search {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.4rem 0.4rem 1.1rem;
      border: var(--border-w) solid var(--glass-border);
      border-radius: var(--radius-full);
      background: var(--glass);
      -webkit-backdrop-filter: var(--glass-blur);
      backdrop-filter: var(--glass-blur);
      box-shadow: var(--shadow);
      transition: border-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
    }
    .lp-search:focus-within {
      border-color: var(--glass-border-hover);
      box-shadow: var(--shadow), 0 0 0 4px color-mix(in oklch, var(--accent) 15%, transparent);
    }
    /* in the styles drawn in liquid glass, the box is glass (Launchpad.glass), under a light tint */
    .lp-search[data-lens="glass"] {
      border-color: transparent;
      background: color-mix(in oklab, var(--panel) 25%, transparent);
      -webkit-backdrop-filter: var(--lens);
      backdrop-filter: var(--lens);
      box-shadow: 0 10px 24px -12px oklch(0 0 0 / 0.45), inset 0 0 0 1px var(--glass-border);
    }
    .lp-search[data-lens="glass"]:focus-within {
      background: color-mix(in oklab, var(--panel) 40%, transparent);
      box-shadow: 0 10px 24px -12px oklch(0 0 0 / 0.45), inset 0 0 0 1px var(--glass-border), 0 0 0 4px color-mix(in oklch, var(--accent) 15%, transparent);
    }
    .lp-search input {
      flex: 1;
      min-width: 0;
      padding: 0.55rem 0;
      border: 0;
      outline: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      font-size: 1.05rem;
    }
    .lp-search input::placeholder { color: var(--subtle); }
    .lp-search kbd {
      padding: 0.1rem 0.45rem;
      border-radius: 0.35rem;
      box-shadow: inset 0 0 0 1px var(--hairline);
      font: 0.75rem var(--font-mono);
      color: var(--subtle);
    }
    .lp-search button {
      padding: 0.6rem 1.1rem;
      border: 0;
      border-radius: var(--radius-full);
      background: var(--accent);
      color: var(--accent-fg);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
  `;
  document.head.append(css);

  Launchpad.widget('search', {
    name: 'Search box',
    description: 'Search the web, or your own site. Press / anywhere on the page to jump to it.',
    bare: true,
    fields: [
      {
        key: 'engine', label: 'Search with', type: 'select', default: 'duckduckgo',
        choices: [
          { value: 'duckduckgo', label: 'DuckDuckGo' }, { value: 'google', label: 'Google' }, { value: 'bing', label: 'Bing' },
          { value: 'wikipedia', label: 'Wikipedia' }, { value: 'custom', label: 'Your own address' },
        ],
      },
      {
        key: 'address', label: 'Your own address', type: 'url', placeholder: 'https://intranet.example.com/search?q=%s',
        hint: '%s is where the words go. Used when "Search with" is "Your own address".',
      },
      { key: 'placeholder', label: 'Placeholder', default: 'Search the web' },
      { key: 'newTab', label: 'Open results in a new tab', type: 'checkbox', default: true },
    ],

    render(el, options) {
      const pattern = options.engine === 'custom' ? String(options.address || '') : ENGINES[options.engine] || ENGINES.duckduckgo;
      const form = document.createElement('form');
      form.className = 'lp-search';
      form.setAttribute('role', 'search');
      form.innerHTML = '<input type="search" name="q" autocomplete="off"><kbd title="Press / to search">/</kbd><button type="submit">Search</button>';
      const input = form.querySelector('input');
      input.placeholder = options.placeholder;
      input.setAttribute('aria-label', options.placeholder || 'Search');

      form.addEventListener('submit', e => {
        e.preventDefault();
        const words = input.value.trim();
        if (!words) return input.focus();
        if (!/^https?:\/\//i.test(pattern) || !pattern.includes('%s')) {
          return Launchpad.toast('Give the search box an address with %s in it, in its settings');
        }
        const url = pattern.replace('%s', encodeURIComponent(words));
        if (options.newTab) window.open(url, '_blank', 'noopener');
        else location.href = url;
        input.select();
      });

      // "/" jumps to the box, unless you're already typing somewhere
      const onKey = e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault();
        input.focus();
      };
      addEventListener('keydown', onKey);

      el.append(form);
      // a search field is a control: in the glass styles, it's glass (with Launchpad 2.3 and later)
      const glass = window.Launchpad.glass?.(form, {
        lens: { bezelWidth: 16, displacementScale: 36, shade: 0.25, specularStrength: 1, blur: 1.2, blurStage: 'before' },
        rim: 1,
      });
      return () => {
        removeEventListener('keydown', onKey);
        glass?.destroy();
      };
    },
  });
})();
