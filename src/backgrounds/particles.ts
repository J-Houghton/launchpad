// src/backgrounds/particles.ts
// The built-in background: a constellation of drifting particles, joined by faint lines when they're close.
// The pointer pushes nearby ones aside and reaches out to them. It's added through the same API as an
// extension's background (lib/extensions.ts), so it doubles as the worked example for writing one.
import { registry } from '../lib/extensions.js';

type Particle = { x: number; y: number; vx: number; vy: number; r: number };

const LINK_DIST = 130;     // px — particles closer than this get joined by a line
const POINTER_DIST = 240;  // px — particles closer than this to the pointer reach for it
const REPEL_DIST = 140;    // px — particles closer than this drift away from the pointer

let parts: Particle[] = [];
let w = 0;
let h = 0;

function spawn(): Particle {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.12 + Math.random() * 0.22;
  return {
    x: Math.random() * w, y: Math.random() * h,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: 0.8 + Math.random() * 1.6,
  };
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, alpha: number) {
  g.globalAlpha = alpha;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

registry.addBackground('particles', {
  name: 'Particles',
  description: 'The style\'s backdrop, with particles that drift and follow the pointer',

  setup({ width, height }) {
    // stretch the constellation to the new size, rather than leaving particles stranded
    // where the old edges were (they'd bunch up against the sides as they wrap back in)
    if (w && h) {
      for (const p of parts) {
        p.x *= width / w;
        p.y *= height / h;
      }
    }
    w = width;
    h = height;
    const target = Math.round(Math.min(110, (w * h) / 14_000));
    while (parts.length < target) parts.push(spawn());
    parts = parts.slice(0, target);
  },

  draw(g, { dt, pointer, colors, still }) {
    const px = pointer?.x ?? -1e4, py = pointer?.y ?? -1e4;
    if (!still) {
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // drift away from the pointer, so it clears a little space as it moves
        const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
        if (d < REPEL_DIST && d > 0.5) {
          const push = (1 - d / REPEL_DIST) * 1.8 * dt;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
        }
        // wrap around the edges
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
    }

    g.strokeStyle = g.fillStyle = colors.particle;
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      g.lineWidth = 1;
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK_DIST) line(g, a.x, a.y, b.x, b.y, (1 - d / LINK_DIST) * 0.2);
      }
      const dp = Math.hypot(a.x - px, a.y - py);
      if (dp < POINTER_DIST) {
        g.lineWidth = 1.25;
        line(g, a.x, a.y, px, py, (1 - dp / POINTER_DIST) * 0.6);
      }
    }

    // dots near the pointer glow brighter and a little bigger
    for (const p of parts) {
      const near = Math.max(0, 1 - Math.hypot(p.x - px, p.y - py) / POINTER_DIST);
      g.globalAlpha = 0.5 + near * 0.45;
      g.beginPath();
      g.arc(p.x, p.y, p.r * (1 + near * 0.8), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  },
});
