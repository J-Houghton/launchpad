// Notes — a scratchpad widget, saved as you type and kept in this browser.
//
// One of the example extensions that come with Launchpad. To use it, add "extensions/notes.js" under
// Settings → Edit page → Page → Extensions (or to "extensions" in launchpad.config.js) and save; then add a
// Notes widget under Widgets. Each Notes widget keeps its own text.
//
// Extensions are plain scripts that talk to the page through window.Launchpad — see the README.
(() => {
  // a little CSS of its own, built from the page's variables so it suits every style
  const css = document.createElement('style');
  css.textContent = `
    .lp-notes {
      display: block;
      width: 100%;
      margin-top: 0.35rem;
      padding: 0.6rem 0.75rem;
      resize: vertical;
      border: var(--border-w) solid var(--hairline);
      border-radius: var(--radius-sm);
      background: var(--tile);
      color: var(--ink);
      font: inherit;
      font-size: var(--fs-sm);
      line-height: 1.6;
    }
    .lp-notes:focus { outline: 2px solid var(--ring); outline-offset: 1px; }
    .lp-notes-saved { display: block; margin-top: 0.3rem; font-size: var(--fs-xs); color: var(--subtle); min-height: 1.2em; }
  `;
  document.head.append(css);

  Launchpad.widget('notes', {
    name: 'Notes',
    description: 'A scratchpad, saved as you type. It stays in this browser, so each person has their own.',
    fields: [
      { key: 'placeholder', label: 'Placeholder', default: 'Jot something down…' },
      { key: 'lines', label: 'Height, in lines', type: 'number', default: 6 },
    ],

    render(el, options, ctx) {
      const area = document.createElement('textarea');
      area.className = 'lp-notes';
      area.placeholder = options.placeholder;
      area.rows = Math.min(30, Math.max(2, Number(options.lines) || 6));
      area.spellcheck = true;
      area.value = ctx.store.get('text', '');
      area.setAttribute('aria-label', ctx.title);

      const saved = document.createElement('small');
      saved.className = 'lp-notes-saved';
      saved.setAttribute('aria-live', 'polite');

      let timer = 0;
      const save = () => {
        ctx.store.set('text', area.value);
        saved.textContent = 'Saved';
      };
      area.addEventListener('input', () => {
        saved.textContent = '';
        clearTimeout(timer);
        timer = setTimeout(save, 400);
      });

      el.append(area, saved);
      // called when the widget goes, or is drawn again with new settings
      return () => {
        clearTimeout(timer);
        ctx.store.set('text', area.value);
      };
    },
  });
})();
