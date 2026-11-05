// Countdown — a widget counting down to a date: a launch, a holiday, the end of a sprint.
//
// One of the example extensions that come with Launchpad. To use it, add "extensions/countdown.js" under
// Settings → Edit page → Page → Extensions (or to "extensions" in launchpad.config.js) and save; then add a
// Countdown widget under Widgets and pick its date.
(() => {
  const css = document.createElement('style');
  css.textContent = `
    .lp-countdown { display: grid; gap: 0.15rem; }
    .lp-countdown-big {
      font-family: var(--font-numeric);
      font-size: 2.75rem;
      font-weight: var(--numeric-weight);
      letter-spacing: var(--numeric-tracking);
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .lp-countdown-big small { margin-left: 0.4rem; font-size: var(--fs-sm); letter-spacing: 0; color: var(--subtle); }
    .lp-countdown-foot { font-size: var(--fs-sm); color: var(--muted); }
  `;
  document.head.append(css);

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  Launchpad.widget('countdown', {
    name: 'Countdown',
    description: 'Days, hours and minutes to a date — then how long ago it was.',
    fields: [
      { key: 'label', label: 'What it is', default: 'Launch day', placeholder: 'e.g. Launch day' },
      { key: 'when', label: 'When', type: 'datetime', hint: 'Your own time zone.' },
    ],

    render(el, options) {
      const box = document.createElement('div');
      box.className = 'lp-countdown';
      const big = document.createElement('div');
      big.className = 'lp-countdown-big';
      const foot = document.createElement('div');
      foot.className = 'lp-countdown-foot';
      box.append(big, foot);
      el.append(box);

      const when = options.when ? new Date(options.when) : null;
      if (!when || Number.isNaN(when.getTime())) {
        big.textContent = '—';
        foot.textContent = 'Pick a date in its settings.';
        return;
      }

      const tick = () => {
        const ms = when.getTime() - Date.now();
        const away = Math.abs(ms);
        const days = Math.floor(away / 86_400_000);
        const hours = Math.floor(away / 3_600_000) % 24;
        const minutes = Math.floor(away / 60_000) % 60;
        if (days > 0) {
          big.innerHTML = '';
          big.append(String(days), Object.assign(document.createElement('small'), { textContent: days === 1 ? 'day' : 'days' }));
        } else {
          big.textContent = `${hours}:${String(minutes).padStart(2, '0')}`;
        }
        const rest = days > 0 ? `${plural(hours, 'hour')}, ${plural(minutes, 'minute')}` : 'hours and minutes';
        foot.textContent = ms >= 0
          ? `${days > 0 ? `and ${rest} ` : ''}until ${options.label} · ${when.toLocaleDateString(undefined, { dateStyle: 'medium' })}`
          : `since ${options.label} · ${when.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
      };
      tick();
      const timer = setInterval(tick, 20_000);
      return () => clearInterval(timer);
    },
  });
})();
