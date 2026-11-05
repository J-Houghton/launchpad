// Starfield — a background of stars streaming past, in the style's own colours. They drift toward the pointer.
//
// One of the example extensions that come with Launchpad. To use it, add "extensions/starfield.js" under
// Settings → Edit page → Page → Extensions (or to "extensions" in launchpad.config.js) and save; then pick
// Starfield as the background in Settings → My view.
//
// A background only draws: the page sizes the canvas, runs the frames, clears it before each one, and draws
// a single still frame instead when motion is turned down.
(() => {
  let stars = [];
  let w = 0;
  let h = 0;

  // a star somewhere in a cube in front of you: x and y from -1 to 1, z (its distance) from 0 to 1
  const star = (far = Math.random()) => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: far, tint: Math.random() < 0.12 });

  Launchpad.background('starfield', {
    name: 'Starfield',
    description: 'Stars streaming past, in the style\'s colours',

    setup(size) {
      w = size.width;
      h = size.height;
      const count = Math.round(Math.min(420, (w * h) / 3500));
      while (stars.length < count) stars.push(star());
      stars = stars.slice(0, count);
    },

    draw(g, frame) {
      // the vanishing point leans a little toward the pointer
      const cx = w / 2 + (frame.pointer ? (frame.pointer.x - w / 2) * 0.08 : 0);
      const cy = h / 2 + (frame.pointer ? (frame.pointer.y - h / 2) * 0.08 : 0);
      const spread = Math.max(w, h) * 0.5;

      for (const s of stars) {
        if (!frame.still) {
          s.z -= 0.0022 * frame.dt;
          if (s.z <= 0.03) Object.assign(s, star(1));
        }
        const x = cx + (s.x / s.z) * spread * 0.35;
        const y = cy + (s.y / s.z) * spread * 0.35;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) {
          if (!frame.still) Object.assign(s, star(1));
          continue;
        }
        const near = 1 - s.z;
        g.globalAlpha = Math.min(1, near * 1.3);
        g.fillStyle = s.tint ? frame.colors.accent2 : frame.colors.particle;
        g.beginPath();
        g.arc(x, y, 0.4 + near * 2.2, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
  });
})();
