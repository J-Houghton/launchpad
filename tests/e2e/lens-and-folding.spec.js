// tests/e2e/lens-and-folding.spec.js
// The glass lens example extension (it rests in its widget, grows and zooms in when picked up, stays put as the
// page scrolls, and goes back), and groups of cards folding shut and open without the page jumping.
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { DIST, checks, closeContexts, sample, sites } from './support.js';

const site = sites('lens-and-folding');
const aurora = look => {
  if (!localStorage.getItem('launchpad:look')) localStorage.setItem('launchpad:look', JSON.stringify(look));
};
const LOOK = { style: 'aurora', theme: 'light', background: 'still' };

test.afterEach(closeContexts);

test('the glass lens: at rest, picked up, left on the page, and put back', async ({ browser }) => {
  const { log, ok, done } = checks();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(aurora, LOOK);
  const p = await ctx.newPage();
  p.on('pageerror', e => log.push('[pageerror] ' + e.message));
  // the config that ships with the page has the lens in it
  await p.goto(site('shipped', fs.readFileSync(path.join(DIST, 'launchpad.config.js'), 'utf8')));
  await p.waitForTimeout(3000);
  const lens = p.locator('.lp-lens');
  const state = () => lens.evaluate(el => ({
    mode: el.dataset.lens, position: el.style.position, transform: el.style.transform,
    zoom: Number(document.querySelector('.lens-holder [result="zoomed"]')?.getAttribute('scale') ?? 0),
    box: (r => [r.x, r.y].map(Math.round))(el.getBoundingClientRect()),
  }));

  ok(await p.evaluate(() => window.Launchpad.version === 2), 'extensions get version 2 of the API, with glass');
  await lens.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  const rest = await state();
  ok(rest.mode === 'glass' && rest.position === 'absolute' && rest.transform === 'scale(0.75)' && rest.zoom === 24, `at rest in its widget: smaller, zooming a little (${JSON.stringify(rest)})`);

  const box = await lens.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(600);
  const held = await state();
  ok(held.position === 'fixed' && /scale\(1\.3/.test(held.transform) && held.zoom > 40, `picked up: full size, zooming in further (${JSON.stringify(held)})`);
  const card = await p.locator('.app-card').first().boundingBox();
  await p.mouse.move(card.x + 260, card.y + card.height / 2, { steps: 14 });
  await p.waitForTimeout(500);
  await p.mouse.up();
  await p.waitForTimeout(900);
  const left = await state();
  ok(left.position === 'fixed' && left.transform === 'scale(0.75)' && left.zoom === 24, `let go: it stays where it was left, at rest again (${JSON.stringify(left)})`);

  await p.mouse.move(5, 500);
  await p.evaluate(() => scrollBy(0, 120));
  await p.waitForTimeout(300);
  ok(JSON.stringify((await state()).box) === JSON.stringify(left.box), 'the page scrolls under it');

  await lens.dblclick();
  await p.waitForTimeout(900);
  ok((await state()).position === 'absolute', 'a double click puts it back in its widget');
  done();
});

test('a group of cards folds shut and open, and what\'s below slides with it', async ({ browser }) => {
  const { log, ok, done } = checks();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(aurora, LOOK);
  const p = await ctx.newPage();
  p.on('pageerror', e => log.push('[pageerror] ' + e.message));
  // the sample's cards, in two groups
  const config = JSON.parse(sample.slice(sample.indexOf('{', sample.indexOf('LAUNCHPAD_CONFIG')), sample.lastIndexOf('}') + 1));
  config.groups = [{ id: 'a', name: 'First' }, { id: 'b', name: 'Second' }];
  config.cards.forEach((card, i) => { card.group = i < 2 ? 'a' : 'b'; });
  await p.goto(site('groups', `window.LAUNCHPAD_CONFIG = ${JSON.stringify(config)};`));
  await p.waitForTimeout(2500);

  // where the second group's heading is, and how wide the clock is, each frame for a second
  const watch = () => p.evaluate(() => new Promise(resolve => {
    const second = document.querySelectorAll('.group-head')[1];
    const clock = document.querySelector('clock-widget');
    const tops = [];
    const widths = new Set();
    const start = performance.now();
    const tick = now => {
      tops.push(Math.round(second.getBoundingClientRect().top + scrollY));
      widths.add(Math.round(clock.getBoundingClientRect().width));
      if (now - start < 1000) requestAnimationFrame(tick);
      else resolve({ tops, widths: [...widths] });
    };
    requestAnimationFrame(tick);
  }));
  const first = p.locator('.group-head').first();
  const steps = tops => new Set(tops).size;

  let watching = watch();
  await first.click();
  let seen = await watching;
  ok(await first.getAttribute('aria-expanded') === 'false' && seen.tops.at(-1) < seen.tops[0] - 100, `folding a group brings the next one up (${seen.tops[0]} → ${seen.tops.at(-1)})`);
  ok(steps(seen.tops) >= 8, `…sliding there, not jumping (${steps(seen.tops)} places on the way)`);
  ok(seen.widths.length === 1, `…and nothing changes width as the page gets shorter (${seen.widths})`);
  ok(await p.locator('.app-group[data-collapsed] .app-card').first().isHidden(), 'the folded cards are out of sight, and out of reach of the keyboard');

  watching = watch();
  await first.click();
  seen = await watching;
  ok(await first.getAttribute('aria-expanded') === 'true' && seen.tops.at(-1) > seen.tops[0] + 100 && steps(seen.tops) >= 8, `unfolding slides it back down (${seen.tops[0]} → ${seen.tops.at(-1)})`);
  done();
});
