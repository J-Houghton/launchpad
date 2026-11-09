// Glass lens — a lens of liquid glass to pick up and drag about the page. It bends and magnifies whatever
// is under it, grows and zooms in further as you lift it, and stretches as it's flung about.
//
// One of the example extensions that come with Launchpad. To use it, add "extensions/lens.js" under
// Settings → Edit page → Page → Extensions (or to "extensions" in launchpad.config.js) and save; then add a
// Glass lens widget under Widgets. The lens rests in its widget until you pick it up, and stays where you
// leave it (in this browser) until you put it back.
//
// The glass comes from Launchpad.glass(), which draws it the way the page's own panels are drawn. Chrome and
// Edge draw the lens; other browsers show it as frosted glass. See the README.
(() => {
  if (!window.Launchpad?.glass) return; // a page from before Launchpad.glass

  /** The lens at full size, as it is while held; at rest it's REST of that. */
  const WIDTH = 200;
  const HEIGHT = 136;
  const REST = 0.75;
  /** How far it zooms (the package's magnify, px) at rest and while held, for each Zoom setting. */
  const ZOOM = { none: [0, 0], some: [24, 48], more: [44, 84] };
  const STEP = 16;

  const css = document.createElement('style');
  css.textContent = `
    .lp-lens-well {
      position: relative;
      display: grid;
      place-items: center;
      height: ${Math.round(HEIGHT * REST) + 28}px;
      margin-top: 0.35rem;
      overflow: hidden;
      border: var(--border-w) dashed var(--hairline);
      border-radius: var(--radius-sm);
      background:
        repeating-linear-gradient(90deg, color-mix(in oklab, var(--ink) 10%, transparent) 0 1px, transparent 1px 14px),
        repeating-linear-gradient(0deg, color-mix(in oklab, var(--ink) 10%, transparent) 0 1px, transparent 1px 14px);
    }
    .lp-lens-word {
      font-size: 1.6rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--accent);
      user-select: none;
    }
    .lp-lens-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem 0.75rem;
      margin-top: 0.5rem;
      font-size: var(--fs-xs);
      color: var(--muted);
    }
    .lp-lens-foot button {
      padding: 0.25rem 0.7rem;
      border: var(--border-w) solid var(--hairline);
      border-radius: var(--radius-full);
      background: var(--tile);
      color: var(--ink);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .lp-lens {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 40;
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      border-radius: ${HEIGHT / 2}px;
      /* clear, not the panels' tint: it's a lens */
      background: transparent;
      --lift: 0;
      box-shadow:
        calc(4px * var(--lift)) calc(4px + 12px * var(--lift)) calc(9px + 15px * var(--lift)) rgb(0 0 0 / calc(0.16 + 0.06 * var(--lift))),
        inset calc(2px * var(--lift)) calc(2px + 6px * var(--lift)) 24px rgb(0 0 0 / calc(0.14 + 0.08 * var(--lift))),
        inset calc(-2px * var(--lift)) calc(-2px - 6px * var(--lift)) 24px rgb(255 255 255 / calc(0.14 + 0.08 * var(--lift))),
        inset 0 0 0 1px rgb(255 255 255 / 0.12);
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .lp-lens.held { cursor: grabbing; }
    .lp-lens[hidden], :root.is-arranging .lp-lens:not(.out) { display: none; }
    .lp-lens:focus-visible { outline: 2px solid var(--ring); outline-offset: 4px; }
    /* where the browser can't draw the lens */
    .lp-lens[data-lens="frost"] {
      -webkit-backdrop-filter: blur(3px) saturate(1.6) brightness(1.06);
      backdrop-filter: blur(3px) saturate(1.6) brightness(1.06);
      background: rgb(255 255 255 / 0.08);
    }
  `;
  document.head.append(css);

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const calm = () => document.documentElement.dataset.motion === 'reduced';

  Launchpad.widget('lens', {
    name: 'Glass lens',
    description: 'A lens of liquid glass to pick up and drag about the page. It bends and magnifies whatever is under it.',
    fields: [
      {
        key: 'zoom', label: 'Zoom', type: 'select', default: 'some',
        choices: [{ value: 'none', label: 'None' }, { value: 'some', label: 'A little' }, { value: 'more', label: 'More' }],
      },
    ],

    render(el, options, ctx) {
      const [restZoom, heldZoom] = ZOOM[options.zoom] ?? ZOOM.some;

      const well = document.createElement('div');
      well.className = 'lp-lens-well';
      const word = document.createElement('span');
      word.className = 'lp-lens-word';
      word.setAttribute('aria-hidden', 'true');
      word.textContent = 'Liquid glass';
      well.append(word);

      const foot = document.createElement('div');
      foot.className = 'lp-lens-foot';
      const note = document.createElement('span');
      note.textContent = 'Pick the lens up and drag it anywhere on the page.';
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Put it back';
      foot.append(note, back);
      el.append(well, foot);

      // the lens floats over the page, so it bends whatever it's over, not just this widget
      const lens = document.createElement('div');
      lens.className = 'lp-lens';
      lens.tabIndex = 0;
      lens.setAttribute('role', 'img');
      lens.setAttribute('aria-roledescription', 'draggable lens');
      lens.setAttribute('aria-label', `${ctx.title}: drag it about the page, or move it with the arrow keys. Escape puts it back.`);
      lens.style.transform = `scale(${REST})`;
      document.body.append(lens);

      // where it is: null while it rests in the widget, else its top-left in the window, in px
      let spot = null;
      let held = null;
      let homing = 0;
      let zoom = restZoom;

      const glass = Launchpad.glass(lens, {
        lens: {
          bezelWidth: 26, displacementScale: 40, shade: 0.08, specularStrength: 1.1, blur: 0, magnify: restZoom,
        },
        motion: {
          // held, it grows to its full size (from REST), with a little bounce, and doesn't dim
          press: { scale: 1 / REST, dim: 1, spring: { duration: 0.4, bounce: 0.35 } },
          // flung about, it stretches along the way it moves; it doesn't lean
          drag: { maxStretch: 0.22, maxSkew: 0, fullSpeed: 3000 },
          onFrame: frame => lift((frame.lift - 1) / (1 / REST - 1)),
        },
      });

      /** 0 at rest .. 1 held (more in the bounce): the shadow deepens and the zoom grows. */
      function lift(t) {
        lens.style.setProperty('--lift', clamp(t, 0, 1.2).toFixed(3));
        const next = restZoom + (heldZoom - restZoom) * clamp(t, 0, 1.2);
        if (Math.abs(next - zoom) < 0.5 && t !== 0) return;
        zoom = next;
        glass.update({ magnify: Math.max(0, zoom) });
      }

      /** Where it rests: over the middle of the well, in the window. */
      function home() {
        const r = well.getBoundingClientRect();
        return { x: r.left + r.width / 2 - WIDTH / 2, y: r.top + r.height / 2 - HEIGHT / 2 };
      }

      /** At rest it scrolls along with the page; out on the page it stays put in the window as the page moves under it. */
      function draw() {
        if (spot) {
          lens.style.position = 'fixed';
          lens.style.translate = `${spot.x}px ${spot.y}px`;
        } else {
          const h = home();
          lens.style.position = 'absolute';
          lens.style.translate = `${h.x + scrollX}px ${h.y + scrollY}px`;
        }
        // resting in a widget that isn't shown (or is being arranged), it isn't either
        lens.hidden = !spot && !well.offsetWidth;
        lens.classList.toggle('out', !!spot);
        back.hidden = !spot;
      }

      /** Somewhere in the window, its middle always on screen. */
      function place(x, y) {
        spot = { x: clamp(x, -WIDTH / 2, innerWidth - WIDTH / 2), y: clamp(y, -HEIGHT / 2, innerHeight - HEIGHT / 2) };
        draw();
      }

      function save() {
        ctx.store.set('spot', spot && { x: spot.x / innerWidth, y: spot.y / innerHeight });
      }

      /** Back to the widget: it glides there (unless motion is turned down), then rests in it again. */
      function putBack() {
        cancelAnimationFrame(homing);
        if (!spot) return;
        if (calm()) {
          spot = null;
          draw();
          save();
          return;
        }
        const from = { ...spot };
        const t0 = performance.now();
        const step = now => {
          const t = Math.min(1, (now - t0) / 450);
          // ease out with a little overshoot, as a spring would
          const k = 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
          const to = home();
          spot = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
          draw();
          if (t < 1) homing = requestAnimationFrame(step);
          else {
            spot = null;
            draw();
            save();
          }
        };
        homing = requestAnimationFrame(step);
      }

      lens.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); // no text selection while it's dragged
        cancelAnimationFrame(homing);
        const r = spot ?? home();
        held = { id: e.pointerId, dx: e.clientX - r.x, dy: e.clientY - r.y };
        place(r.x, r.y);
        lens.setPointerCapture(e.pointerId);
        lens.classList.add('held');
        if (calm()) {
          // no motion: just held at full size, zoomed in
          lens.style.transform = 'none';
          lift(1);
        }
      });
      lens.addEventListener('pointermove', e => {
        if (held?.id === e.pointerId) place(e.clientX - held.dx, e.clientY - held.dy);
      });
      const letGo = e => {
        if (held?.id !== e.pointerId) return;
        held = null;
        lens.classList.remove('held');
        if (calm()) {
          lens.style.transform = `scale(${REST})`;
          lift(0);
        }
        save();
      };
      lens.addEventListener('pointerup', letGo);
      lens.addEventListener('pointercancel', letGo);
      lens.addEventListener('dblclick', putBack);
      back.addEventListener('click', putBack);

      lens.addEventListener('keydown', e => {
        const by = e.shiftKey ? STEP * 4 : STEP;
        const move = { ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowUp: [0, -by], ArrowDown: [0, by] }[e.key];
        if (move) {
          e.preventDefault();
          const r = spot ?? home();
          place(r.x + move[0], r.y + move[1]);
          save();
        } else if (e.key === 'Escape' && spot) {
          e.preventDefault();
          putBack();
        }
      });

      // where it was left last time, if anywhere
      const saved = ctx.store.get('spot', null);
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) place(saved.x * innerWidth, saved.y * innerHeight);

      // keep it with the widget (as the page's layout changes) and in the window (as it's resized)
      const relayout = () => (spot ? place(spot.x, spot.y) : draw());
      const watch = new ResizeObserver(relayout);
      watch.observe(document.body);
      watch.observe(well);
      addEventListener('resize', relayout);
      draw();

      return () => {
        cancelAnimationFrame(homing);
        watch.disconnect();
        removeEventListener('resize', relayout);
        glass.destroy();
        lens.remove();
      };
    },
  });
})();
