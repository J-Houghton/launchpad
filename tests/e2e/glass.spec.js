// tests/e2e/glass.spec.js
// Liquid glass as Apple's guidelines have it (dev server, so the test can read each lens): glass only on the
// controls that float over the page (the header's links and theme button, the gallery arrows, menus, toasts and
// the arranging toolbar), never the cards and widgets; the header as a floating toolbar with a scroll edge; fine
// rims; concentric corners and sentence-case labels; buttons that squish (not with less motion) and content that
// doesn't; menus growing out of their button; the page moving at full rate; frost where the lens can't be drawn.
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, shots } from './support.js';

const out = shots('glass');

test.afterEach(closeContexts);

const url = 'http://localhost:5179/';

test('liquid glass: on the controls and what floats over the page, never the content', async ({ browser: b }) => {
  const { log, ok, done } = checks();
  const fresh = async (look, opts = {}, before) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, ...opts });
    await ctx.route('**/launchpad.config.js', r => r.fulfill({ body: sample, contentType: 'text/javascript' }));
    if (before) await ctx.route(url, async r => {
      const res = await r.fetch();
      r.fulfill({ response: res, body: (await res.text()).replace('<html ', `<html data-liquid-glass-support="${before}" `) });
    });
    await ctx.addInitScript(([look]) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.clear();
        localStorage.setItem('launchpad:look', JSON.stringify(look));
      }
    }, [look]);
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo|WebSocket|Vite server/.test(m.text()) && log.push('[console] ' + m.text()));
    await p.goto(url);
    await p.waitForTimeout(2200);
    return p;
  };
  // every lens on the page: its element, its corners against the element's, and how it's drawn
  const lenses = p => p.evaluate(async () => {
    const { glasses } = await import('/src/lib/glass.ts');
    return [...glasses].filter(g => g.handle && !g.element.closest('dialog')).map(g => {
      // its laid-out size, not as it's drawn (a hidden gallery arrow is drawn smaller)
      const [w, h] = [g.element.offsetWidth, g.element.offsetHeight];
      const css = parseFloat(getComputedStyle(g.element).borderTopLeftRadius) || 0;
      return {
        kind: g.element.classList[0] || g.element.tagName.toLowerCase(), mode: g.element.dataset.lens, w,
        css: Math.min(css, w / 2, h / 2), lens: g.handle.params.radius,
      };
    });
  });
  const settings = p => p.locator('dialog.settings:not(.setup)');
  const myView = async p => {
    await p.keyboard.press('Control+,');
    await p.waitForTimeout(350);
    await settings(p).getByRole('tab', { name: 'My view' }).click();
    await p.waitForTimeout(200);
  };
  const pickStyle = async (p, name) => {
    await settings(p).locator('label.style-card').filter({ has: p.locator('.style-name', { hasText: new RegExp(`^\\s*${name}\\b`) }) }).click();
    await p.waitForTimeout(900);
  };
  // press on an element for a moment: its transform while held
  const press = async (p, selector) => {
    const box = await p.locator(selector).first().boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(200);
    const during = await p.locator(selector).first().evaluate(e => e.style.transform);
    await p.mouse.up();
    await p.mouse.move(5, 500);
    await p.waitForTimeout(900);
    return during;
  };
  const CONTENT = ['app-card', 'widget', 'panel', 'topbar-inner'];

  // ---- 1. Liquid: glass on the controls, not on the content ----
  let p = await fresh({ style: 'liquid', theme: 'light' });
  let l = await lenses(p);
  const kinds = l.map(x => x.kind).sort().join(' ');
  ok(kinds === 'eyebrow gallery-btn gallery-btn h2 icon-btn page-action quick-links tile-menu',
    `glass on the header's links and theme button, the greeting, the cards' heading, the gallery arrows, the Settings button and the tile menu (${kinds})`);
  ok(!l.some(x => CONTENT.includes(x.kind)), 'none on the cards, widgets, Pinned and Recent, or a bar behind the header');
  ok(l.every(x => x.mode === 'glass'), 'drawn as lenses in Edge');
  // (the tile menu has no size until it's opened)
  const off = l.filter(x => x.kind !== 'tile-menu' && Math.abs(x.lens - x.css) > 0.6);
  ok(!off.length, `each lens has its control's corners (${off.map(x => `${x.kind} ${x.lens}≠${x.css}`).join(', ') || 'all match'})`);
  const card = await p.locator('.app-card').first().evaluate(e => ({ bg: getComputedStyle(e).backgroundColor, bf: getComputedStyle(e).backdropFilter }));
  ok(!/url\(/.test(card.bf) && /blur/.test(card.bf), `a card is the style's frosted panel, not a lens (${card.bf})`);
  const filters = await p.evaluate(() => [...document.querySelectorAll('.lens-holder filter')].map(f => f.id));
  ok(filters.length === 2 * l.length, `a lens and a light filter each, held outside the controls (${filters.length})`);
  const lean = await p.evaluate(async () => {
    const { glasses } = await import('/src/lib/glass.ts');
    const all = [...glasses].filter(g => g.handle && g.element.offsetWidth);
    return {
      steps: [...new Set(all.map(g => [...g.handle.filterElement.children].length))],
      biggestMap: Math.max(...all.map(g => g.handle.debug.mapWidth * g.handle.debug.mapHeight)),
      rims: [...new Set(all.map(g => g.setup.rimPx))],
    };
  });
  ok(lean.steps.every(n => n <= 4), `each lens's filter is four steps at most (${lean.steps})`);
  ok(lean.biggestMap <= 12000 * 1.05, `the controls' maps are small (${lean.biggestMap} pixels at most)`);
  ok(lean.rims.length === 1 && lean.rims[0] === 1, `their rims are fine: 1 px (${lean.rims})`);
  await p.screenshot({ path: path.join(out, 'liquid-light.png') });

  // ---- 2. the page moves at full rate: nothing is held still for the glass ----
  const moving = await p.evaluate(() => ({
    calm: document.documentElement.hasAttribute('data-calm'),
    blob: getComputedStyle(document.querySelector('.blob')).animationPlayState,
    logo: getComputedStyle(document.querySelector('.brand-mark')).animationPlayState,
  }));
  ok(!moving.calm && moving.blob === 'running' && moving.logo === 'running', `the glow drifts and the logo turns (${JSON.stringify(moving)})`);
  const draws = await p.evaluate(() => new Promise(done => {
    const canvas = document.querySelector('page-backdrop canvas');
    const g = canvas.getContext('2d');
    let n = 0;
    let frames = 0;
    let counting = true;
    const clear = g.clearRect.bind(g);
    g.clearRect = (...a) => { n++; return clear(...a); };
    const tick = () => { frames++; if (counting) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => { counting = false; g.clearRect = clear; done({ n, frames }); }, 2000);
  }));
  // (against the frames there were: a busy machine draws fewer of both)
  ok(draws.n >= draws.frames * 0.9, `the particles move every frame (${draws.n} draws in ${draws.frames} frames)`);

  // ---- 3. the header: a floating toolbar ----
  const bar = await p.locator('.topbar-inner').evaluate(e => ({ bg: getComputedStyle(e).backgroundColor, bf: getComputedStyle(e).backdropFilter }));
  ok(/rgba\(0, 0, 0, 0\)/.test(bar.bg) && bar.bf === 'none', `no bar behind it (${bar.bg}, ${bar.bf})`);
  ok(/rgba\(0, 0, 0, 0\)|transparent/.test(await p.locator('.quick-links a').first().evaluate(e => getComputedStyle(e).backgroundColor)), 'the links sit together in one capsule, not as pills of their own');
  await p.locator('.quick-links a').nth(1).hover();
  await p.waitForTimeout(900);
  const [drop, link] = [await p.locator('.quick-links-highlight').boundingBox(), await p.locator('.quick-links a').nth(1).boundingBox()];
  ok(Math.abs(drop.x - link.x) < 2 && Math.abs(drop.width - link.width) < 2, 'a highlight slides onto the hovered link');
  ok(!(await p.locator('.quick-links-highlight').getAttribute('data-lens')), '…and isn\'t glass itself (no glass on glass)');
  const edge = async () => p.evaluate(() => Number(getComputedStyle(document.querySelector('.topbar'), '::before').opacity));
  const atTop = await edge();
  await p.evaluate(() => scrollTo(0, 400));
  await p.waitForTimeout(500);
  const scrolled = await edge();
  ok(atTop < 0.05 && scrolled > 0.95, `a scroll edge under it once the page scrolls (${atTop.toFixed(2)} → ${scrolled.toFixed(2)})`);
  await p.screenshot({ path: path.join(out, 'liquid-scrolled.png'), clip: { x: 0, y: 0, width: 1440, height: 220 } });
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(300);

  // ---- 3b. what floats: a sticky heading, the corner's buttons, the dock, and a lens on the hovered tile ----
  const shade = await p.evaluate(async () => {
    const { glasses } = await import('/src/lib/glass.ts');
    return [...glasses].find(g => g.element.matches('.quick-links')).handle.params.shade;
  });
  ok(shade < 0.1, `in the light theme the glass is barely shaded (${shade})`);
  ok(await p.locator('.pin-dock').getAttribute('data-shown') === null, 'no dock with nothing pinned');
  ok(await p.locator('.page-action').first().getAttribute('data-away') !== null, 'no "back to the top" at the top');
  await p.evaluate(() => { const { key } = { key: document.querySelector('.env-tile .env-link') }; });
  await p.locator('.env-tile').first().click({ button: 'right' });
  await p.waitForTimeout(300);
  await p.locator('tile-menu .menu-item', { hasText: 'Pin' }).first().click();
  await p.waitForTimeout(600);
  ok(await p.locator('.pin-dock').getAttribute('data-shown') === null, 'a pin, but its panel is in sight: still no dock');
  await p.setViewportSize({ width: 1440, height: 520 });
  await p.evaluate(() => scrollTo(0, 700));
  await p.waitForTimeout(900);
  ok(await p.locator('.pin-dock').getAttribute('data-shown') !== null && await p.locator('.pin-dock').getAttribute('data-lens') === 'glass' && await p.locator('.dock-link').count() === 1,
    'scrolled past the Pinned panel: the dock comes up with the pin, in glass');
  ok(await p.locator('.page-action').first().getAttribute('data-away') === null, '…and "back to the top" appears');
  const headTop = (await p.locator('.section-head').boundingBox()).y;
  ok(Math.abs(headTop - 76) < 2, `the cards' heading stays under the header (${headTop.toFixed(0)} px down)`);
  // a tile that's in sight, clear of the header and the dock
  const inSight = await p.evaluate(() => [...document.querySelectorAll('.env-tile')].findIndex(t => { const r = t.getBoundingClientRect(); return r.top > 130 && r.bottom < innerHeight - 90 && r.left > 0; }));
  const hovered = p.locator('.env-tile').nth(inSight);
  const hb = await hovered.boundingBox();
  await p.mouse.move(hb.x + 40, hb.y + hb.height / 2);
  await p.waitForTimeout(900);
  const onTile = async () => {
    const [lens, tile] = [await p.locator('.tile-lens').boundingBox(), await hovered.boundingBox()];
    return Math.abs(lens.x + 4 - tile.x) < 1.5 && Math.abs(lens.y + 4 - tile.y) < 1.5 && Math.abs(lens.width - 8 - tile.width) < 1.5;
  };
  ok(await p.locator('.tile-lens').getAttribute('data-on') !== null && await onTile(), 'a lens sits on the tile under the pointer');
  await p.evaluate(() => scrollBy(0, -40));
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  ok(await onTile(), '…and stays on it as the page scrolls');
  await p.mouse.move(5, 300);
  await p.waitForTimeout(500);
  ok(await p.locator('.tile-lens').getAttribute('data-on') === null, '…and goes when the pointer leaves the tiles');
  await p.locator('.page-action').first().click();
  await p.waitForTimeout(900);
  ok(await p.evaluate(() => scrollY) === 0, '"back to the top" goes there');
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.locator('.chip-x').first().click();
  await p.waitForTimeout(600);

  // ---- 4. controls squish when pressed; the content doesn't ----
  ok(!(await press(p, '.app-card .app-heading')), 'pressing a card doesn\'t squish it');
  ok(!(await press(p, 'clock-widget')), '…nor a widget');
  const arrow = p.locator('.gallery-btn.next').first();
  await arrow.scrollIntoViewIfNeeded();
  ok(/scale/.test(await press(p, '.gallery-btn.next')), 'pressing a gallery arrow does');

  // ---- 5. a tile's menu grows out of its button; a toast is glass ----
  await p.evaluate(() => scrollTo(0, 0));
  const more = p.locator('.env-more').first();
  await more.scrollIntoViewIfNeeded();
  await more.hover();
  await more.click();
  await p.waitForTimeout(60);
  const growing = await p.locator('tile-menu .tile-menu').evaluate(e => e.getAnimations().some(a => /scale/.test(JSON.stringify(a.effect?.getKeyframes?.() ?? []))));
  ok(growing, 'a tile\'s menu grows out of its ⋯ button');
  await p.waitForTimeout(600);
  ok(await p.locator('tile-menu .tile-menu').getAttribute('data-lens') === 'glass', '…and is glass');
  await p.keyboard.press('Escape');
  await p.evaluate(() => Launchpad.toast('Hello'));
  await p.waitForTimeout(500);
  ok(await p.locator('.toast').getAttribute('data-lens') === 'glass', 'a toast is glass');

  // ---- 6. less motion: no squish ----
  await myView(p);
  await settings(p).getByRole('radiogroup', { name: 'Motion' }).locator('label', { hasText: 'Reduced' }).click();
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await arrow.scrollIntoViewIfNeeded();
  ok(!(await press(p, '.gallery-btn.next')), 'with less motion, the gallery arrow doesn\'t squish');
  await myView(p);
  await settings(p).getByRole('radiogroup', { name: 'Motion' }).locator('label', { hasText: 'System' }).click();
  await p.waitForTimeout(300);

  // ---- 7. arranging: the toolbar is glass; the cards still aren't ----
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('tab', { name: 'Layout', exact: true }).click();
  await settings(p).getByRole('button', { name: 'Arrange on the page' }).click();
  await p.waitForTimeout(1200);
  await p.locator('.arrange-bar[data-lens]').waitFor();
  ok(await p.locator('.arrange-bar').getAttribute('data-lens') === 'glass', 'arranging: the toolbar is glass');
  ok(await p.locator('.layout-item [data-lens]').count() === 0, '…and nothing inside a section is, while it can be lifted and moved (glass can\'t see the page from in there)');
  ok(await p.locator('.page-action').count() === 0, '…and the corner buttons step aside');
  ok(!(await lenses(p)).some(x => CONTENT.includes(x.kind)), '…and the cards still aren\'t');
  await p.locator('.arrange-bar').getByRole('button', { name: 'Cancel' }).click();
  await p.waitForTimeout(600);

  // ---- 8. other styles: no glass at all, the header as it was; back again ----
  await myView(p);
  await pickStyle(p, 'Classic');
  l = await lenses(p);
  ok(!l.length && await p.evaluate(() => document.querySelectorAll('[data-lens], .lens-holder filter').length) === 0, 'Classic: no glass anywhere, Settings included, and nothing left behind');
  const classicBar = await p.locator('.topbar-inner').evaluate(e => getComputedStyle(e).backgroundColor);
  ok(!/rgba\(0, 0, 0, 0\)/.test(classicBar), `Classic's header keeps its bar (${classicBar})`);
  await pickStyle(p, 'Aurora');
  await p.waitForTimeout(800);
  // (and the toast, which keeps its glass once it's been shown)
  l = (await lenses(p)).filter(x => !['toast', 'tile-lens', 'pin-dock'].includes(x.kind));
  ok(l.map(x => x.kind).sort().join(' ') === kinds, `Aurora: the same controls in glass again (${l.map(x => x.kind).sort().join(' ')})`);
  const tile = await p.locator('.env-tile').first().evaluate(e => parseFloat(getComputedStyle(e).borderTopLeftRadius));
  ok(tile === 10, `a card's tiles are rounded to match it (Aurora: 22 px card, 22 px in, so the smallest corner: ${tile} px)`);
  const label = await p.locator('.widget-label').first().evaluate(e => getComputedStyle(e).textTransform);
  ok(label === 'none', `section labels in sentence case (${label})`);
  await pickStyle(p, 'Liquid');
  await p.waitForTimeout(800);
  const liquidTile = await p.locator('.env-tile').first().evaluate(e => parseFloat(getComputedStyle(e).borderTopLeftRadius));
  ok(liquidTile === 18, `Liquid's: a 40 px card, so 18 px tiles (${liquidTile})`);

  // ---- 9. the panel colour still counts ----
  await settings(p).locator('.swatch', { hasText: 'Panels' }).locator('.swatch-chip').click();
  await p.locator('#color-panel .cp-hex').fill('#ffd6ec');
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape');
  const tinted = await p.locator('.app-card').first().evaluate(e => getComputedStyle(e).backgroundColor);
  ok(/oklab|rgb/.test(tinted) && tinted !== card.bg, `a picked panel colour tints the cards (${tinted})`);
  await p.keyboard.press('Escape');
  await p.context().close();

  // ---- 10. where the lens can't be drawn: frosted controls ----
  p = await fresh({ style: 'liquid', theme: 'light' }, {}, 'off');
  l = await lenses(p);
  const frost = await p.locator('.quick-links').evaluate(e => ({ mode: e.dataset.lens, bf: getComputedStyle(e).backdropFilter }));
  ok(frost.mode === 'frost' && /blur/.test(frost.bf), `no lens: the controls are frosted (${frost.mode}, ${frost.bf})`);
  await p.screenshot({ path: path.join(out, 'liquid-frost.png') });
  await p.context().close();

  // ---- 11. My view lists Liquid, with its combos ----
  p = await fresh({ style: 'liquid', theme: 'light' });
  await myView(p);
  ok(await settings(p).locator('label.style-card').count() === 7, 'seven styles in My view');
  ok(await settings(p).locator('label.combo').count() === 5, 'Liquid has five combos');
  await p.context().close();

  done();
});
