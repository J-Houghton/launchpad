// tests/e2e/looks.spec.js
// Looks and examples: palettes, backgrounds, motion and density (yours and the page's), and the examples.
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, shots, sites, v3 } from './support.js';

const out = shots('looks');
const site = sites('looks');

test.afterEach(closeContexts);

const oceanDark = sample.replace('"look": { "theme": "system", "style": "aurora", "background": "particles" }',
  '"look": { "theme": "dark", "style": "neon", "background": "still" }');


test("looks: styles, backgrounds, motion and density (yours and the page's), and the examples", async ({ browser: b }) => {
  const { log, ok, done } = checks();
  const fresh = async (opts = {}, init) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', ...opts });
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo/.test(m.text()) && log.push('[console] ' + m.text()));
    p.on('dialog', d => d.accept());
    return p;
  };
  const root = p => p.evaluate(() => ({
    palette: document.documentElement.dataset.style, background: document.documentElement.dataset.background,
    motion: document.documentElement.dataset.motion, density: document.documentElement.dataset.density,
    dark: document.documentElement.classList.contains('theme-dark'),
  }));
  const mine = p => p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:look') ?? 'null'));
  const settings = p => p.locator('dialog.settings:not(.setup)');
  const openSettings = async p => { await p.keyboard.press('Control+,'); await p.waitForTimeout(350); };
  const myView = async p => { await settings(p).getByRole('tab', { name: 'My view' }).click(); await p.waitForTimeout(150); };
  const editTab = async (p, name) => {
    await settings(p).getByRole('tab', { name: 'Edit page' }).click();
    await settings(p).getByRole('tab', { name, exact: true }).click();
    await p.waitForTimeout(250);
  };
  const choose = async (p, group, label) => {
    await settings(p).getByRole('radiogroup', { name: group }).locator('label', { hasText: label }).click();
    await p.waitForTimeout(350);
  };
  const palette = async (p, name) => { await styleCard(p, name).click(); await p.waitForTimeout(400); };
  const styleCard = (p, name) => settings(p).locator('label.style-card').filter({ has: p.locator('.style-name', { hasText: new RegExp(`^\\s*${name}\\b`) }) });
  const shown = (p, sel) => p.locator(sel).first().evaluate(e => getComputedStyle(e).display !== 'none');
  const close = async p => { await settings(p).getByRole('button', { name: 'Close settings' }).click(); await p.waitForTimeout(300); };

  // ---- 1. the sample's own look, and an old config ----
  let p = await fresh();
  const url = site('sample', sample);
  await p.goto(url);
  await p.waitForTimeout(1200);
  let r = await root(p);
  ok(r.palette === 'aurora' && r.background === 'particles' && r.motion === 'full' && r.density === 'comfortable' && !r.dark,
    `sample: aurora, particles, full motion, comfortable, light (${JSON.stringify(r)})`);
  ok(await shown(p, '.backdrop canvas') && await shown(p, '.backdrop-art'), 'particles: canvas and glow showing');

  const oldUrl = site('v3', v3);
  await p.goto(oldUrl);
  await p.waitForTimeout(1000);
  r = await root(p);
  ok(r.palette === 'aurora' && r.background === 'particles', `v3 config: default look (${r.palette}/${r.background})`);
  ok(await p.locator('.app-card').count() > 0, 'v3 config: cards render');

  // ---- 2. choices kept by older versions ----
  p = await fresh({}, () => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('palette', 'classic'); localStorage.setItem('theme', 'dark'); sessionStorage.setItem('seeded', '1'); } });
  await p.goto(url);
  await p.waitForTimeout(1000);
  r = await root(p);
  ok(r.palette === 'classic' && r.dark, `legacy classic + dark choices carried over (${r.palette}, dark=${r.dark})`);
  await openSettings(p);
  await myView(p);
  ok(await settings(p).locator('.look-note').isVisible(), 'legacy choices count as your own look');
  await close(p);

  p = await fresh({}, () => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('palette', 'aurora'); sessionStorage.setItem('seeded', '1'); } });
  await p.goto(url);
  await p.waitForTimeout(900);
  await openSettings(p);
  await myView(p);
  ok(!(await settings(p).locator('.look-note').count()), 'a legacy "aurora" (the old default) is not counted as your own');
  await close(p);

  // ---- 3. My view: palette, background, motion, density ----
  p = await fresh();
  await p.goto(url);
  await p.waitForTimeout(1000);
  await openSettings(p);
  await myView(p);
  const previews = await settings(p).locator('.style-preview').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor));
  ok(new Set(previews).size === 7, `seven style previews, each different (${new Set(previews).size})`);
  const shapes = await settings(p).locator('.sp-card').evaluateAll(els => els.map(e => {
    const c = getComputedStyle(e), t = getComputedStyle(e.querySelector('.sp-title'));
    return [c.borderTopLeftRadius, c.borderTopWidth, c.boxShadow.slice(0, 40), t.fontFamily.split(',')[0], t.fontWeight].join(' / ');
  }));
  ok(new Set(shapes).size >= 5, `styles differ in corners, borders, shadows and type, not just colour (${new Set(shapes).size} distinct)`);
  log.push(...shapes.map(x => '      ' + x));
  ok(await styleCard(p, 'Aurora').locator('.style-tag').count() === 1, 'the page\'s palette is tagged "Page"');
  ok(!(await settings(p).getByRole('radiogroup', { name: 'Density' }).count()), 'My view has no density of its own (it\'s the page\'s, under Layout)');
  await p.screenshot({ path: path.join(out, 'my-view-light.png') });

  await palette(p, 'Blueprint');
  r = await root(p);
  ok(r.palette === 'blueprint', 'My view → Blueprint applies at once');
  ok((await mine(p))?.style === 'blueprint', 'and is kept in this browser');
  const heading = await p.locator('.app-title').first().evaluate(e => getComputedStyle(e).fontFamily);
  ok(/mono|Cascadia|Consolas/i.test(heading), `Blueprint: card names in a monospaced face (${heading.split(',')[0]})`);
  ok(await settings(p).locator('.look-note').isVisible(), 'note: you\'ve picked your own look');
  await choose(p, 'Background', 'Plain');
  ok(!(await shown(p, '.backdrop canvas')) && !(await shown(p, '.backdrop-art')), 'Plain: no glow, no particles');
  await choose(p, 'Background', 'Still');
  ok(!(await shown(p, '.backdrop canvas')) && await shown(p, '.backdrop-art'), 'Still: backdrop without particles');
  await choose(p, 'Motion', 'Reduced');
  ok((await root(p)).motion === 'reduced', 'Motion → Reduced');
  await choose(p, 'Theme', 'Dark');
  ok((await root(p)).dark, 'Theme → Dark');
  await p.screenshot({ path: path.join(out, 'my-view-blueprint-dark.png') });
  await close(p);
  await p.screenshot({ path: path.join(out, 'page-blueprint-dark-still.png') });

  // survives a reload, applied before the app starts
  await p.goto(url);
  const early = await p.evaluate(() => ({ palette: document.documentElement.dataset.style, density: document.documentElement.dataset.density, motion: document.documentElement.dataset.motion }));
  await p.waitForTimeout(800);
  r = await root(p);
  ok(r.palette === 'blueprint' && r.background === 'still' && r.motion === 'reduced' && r.dark,
    `reload keeps your look (${JSON.stringify(r)})`);
  ok(early.palette === 'blueprint' && early.motion === 'reduced', `…and it's on the page before the app runs (${JSON.stringify(early)})`);

  // back to the page's look; motion stays
  await openSettings(p);
  await myView(p);
  await settings(p).locator('.look-note').getByRole('button', { name: /Use the page's/ }).click();
  await p.waitForTimeout(400);
  r = await root(p);
  ok(r.palette === 'aurora' && r.background === 'particles' && r.density === 'comfortable' && !r.dark && r.motion === 'reduced',
    `"Use the page's look" resets all but motion (${JSON.stringify(r)})`);
  ok(JSON.stringify(await mine(p)) === '{"motion":"reduced"}', `stored: ${JSON.stringify(await mine(p))}`);
  // picking what the page has follows the page
  await palette(p, 'Paper');
  await palette(p, 'Aurora');
  ok(!(await mine(p)).style && !(await settings(p).locator('.look-note').count()), 'picking the page\'s palette follows the page again');
  await choose(p, 'Motion', 'System');
  await close(p);

  // the OS asks for less motion; Full overrides it
  p = await fresh({ reducedMotion: 'reduce' });
  await p.goto(url);
  await p.waitForTimeout(800);
  ok((await root(p)).motion === 'reduced', 'system reduced motion is followed');
    await openSettings(p);
  await myView(p);
  await choose(p, 'Motion', 'Full');
  ok((await root(p)).motion === 'full', 'Motion → Full overrides the system');
  await close(p);

  // ---- 4. the page's own look: made from yours, with "Make it everyone's" ----
  p = await fresh();
  await p.goto(url);
  await p.waitForTimeout(1000);
  await openSettings(p);
  await editTab(p, 'Page');
  const lookCard = settings(p).locator('.settings-card', { hasText: 'Everyone sees this' });
  ok(/Aurora · System theme · Particles background/.test(await lookCard.textContent()), 'the Page tab says what the page\'s look is');
  ok(!(await settings(p).locator('.style-card').count()), 'and has no second style picker');
  await myView(p);
  await palette(p, 'Paper');
  await choose(p, 'Background', 'Plain');
  await settings(p).locator('.look-note').getByRole('button', { name: /Make it everyone/ }).click();
  await p.waitForTimeout(400);
  ok(await settings(p).getByRole('tab', { name: 'Page', exact: true }).getAttribute('aria-selected') === 'true'
    && await settings(p).locator('.settings-dirty').isVisible(), 'Make it everyone\'s: over to Edit page → Page, with a change to save');
  ok(/Paper · System theme · Plain background/.test(await lookCard.textContent()), 'the Page tab shows the new look');
  await p.screenshot({ path: path.join(out, 'make-it-everyones.png') });
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(700);
  r = await root(p);
  ok(r.palette === 'paper' && r.background === 'plain', `saved: the page is Paper and plain (${r.palette}/${r.background})`);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:config')).data.look);
  ok(saved.style === 'paper' && saved.background === 'plain', 'saved into the page\'s look');
  ok(JSON.stringify(await mine(p)) === '{}', `your picks match the page's now, so they just follow it (${JSON.stringify(await mine(p))})`);
  await p.goto(url);
  const early2 = await p.evaluate(() => document.documentElement.dataset.style);
  ok(early2 === 'paper', `reload: the browser copy's look applies before the app runs (${early2})`);
  await p.waitForTimeout(800);
  await openSettings(p);
  await myView(p);
  ok(await styleCard(p, 'Paper').locator('.style-tag').count() === 1, 'My view tags Paper as the page\'s');
  // your own pick still wins
  await palette(p, 'Neon');
  await close(p);
  ok((await root(p)).palette === 'neon', 'your own pick wins over the page\'s');
  await p.screenshot({ path: path.join(out, 'page-neon.png') });

  // a config file that sets a look
  p = await fresh();
  const neonUrl = site('neon-dark', oceanDark);
  await p.goto(neonUrl);
  await p.waitForTimeout(900);
  r = await root(p);
  ok(r.palette === 'neon' && r.dark && r.background === 'still', `config look: neon, dark, still (${JSON.stringify(r)})`);
  await p.screenshot({ path: path.join(out, 'config-neon-dark.png') });

  // ---- 5. examples ----
  p = await fresh();
  await p.goto(url);
  await p.waitForTimeout(1000);
  await openSettings(p);
  const fileButton = settings(p).getByRole('button', { name: /^File/ });
  await fileButton.click();
  await p.waitForTimeout(300);
  const menu = p.locator('#menu-file');
  ok(await menu.isVisible() && await menu.getByRole('button', { name: /Launch page/ }).isVisible(), 'the File menu lists the examples');
  // once it has finished growing out of its button (it overshoots a little on the way)
  await menu.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  const [mb, tb] = [await menu.boundingBox(), await fileButton.boundingBox()];
  ok(mb.y + mb.height <= tb.y + 2, `menu sits above its button (${Math.round(mb.y + mb.height)} ≤ ${Math.round(tb.y)})`);
  await p.screenshot({ path: path.join(out, 'examples-menu.png') });
  await menu.getByRole('button', { name: /Launch page/ }).click();
  await p.waitForTimeout(400);
  ok(await settings(p).locator('.settings-dirty').isVisible(), 'loading an example leaves unsaved changes to review');
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(900);
  r = await root(p);
  ok(r.palette === 'blueprint' && r.density === 'compact' && r.background === 'particles', `launch example's look (${JSON.stringify(r)})`);
  ok(await p.locator('.env-grid').count() >= 5, `launch example: column rows (${await p.locator('.env-grid').count()})`);
  ok(await p.locator('.group-title, .group-head, [data-group]').count() >= 2 || await p.getByText('Customer apps').isVisible(), 'launch example: groups');
  ok(!(await p.locator('[data-section="weather"]').count()), 'launch example: weather hidden');
  const headline = await p.locator('.hero-title .type-live').textContent();
  ok(headline.trim() === 'Ship it', `launch example's greeting replaces the one being typed ("${headline.trim()}")`);
  await p.screenshot({ path: path.join(out, 'launch-example.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(overflow <= 0, `launch example on a phone: no sideways scroll (${overflow}px)`);
  await p.screenshot({ path: path.join(out, 'launch-example-phone.png'), fullPage: true });
  await p.setViewportSize({ width: 1440, height: 1000 });
  // and back to the file
  await openSettings(p);
  await settings(p).getByRole('button', { name: /^File/ }).click();
  await p.locator('#menu-file').getByRole('button', { name: /Use the file's version/ }).click();
  await p.waitForTimeout(600);
  ok((await root(p)).palette === 'aurora' && await p.locator('.env-grid').count() === 0, 'File → "Use the file\'s version" goes back to the sample');
  await close(p);

  // the setup guide, on an empty page
  p = await fresh();
  const emptyUrl = site('empty', null);
  await p.goto(emptyUrl);
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Start the setup guide' }).click();
  await p.waitForTimeout(400);
  const guide = p.locator('dialog.setup');
  ok(await guide.locator('.example-card').count() === 2, 'setup guide offers both examples');
  await p.screenshot({ path: path.join(out, 'setup-examples.png') });
  await guide.locator('.example-card', { hasText: 'Home page' }).click();
  ok(await guide.waitFor({ state: 'hidden', timeout: 3000 }).then(() => true, () => false), 'guide closes');
  await p.waitForTimeout(400);
  ok(await p.locator('.app-card').count() === 4, `home example on the page (${await p.locator('.app-card').count()} cards)`);

  // ---- 6. every palette, light and dark ----
  for (const scheme of ['light', 'dark']) {
    p = await fresh({ colorScheme: scheme, viewport: { width: 1280, height: 860 } });
    await p.goto(url);
    await p.waitForTimeout(900);
    for (const id of ['aurora', 'classic', 'blueprint', 'paper', 'neon', 'bold']) {
      await p.evaluate(v => localStorage.setItem('launchpad:look', JSON.stringify({ style: v })), id);
      await p.reload();
      await p.waitForTimeout(700);
      const badge = await p.locator('.app-mark').first().evaluate(e => getComputedStyle(e).backgroundImage);
      if (scheme === 'light') log.push(`      ${id} badge: ${badge.slice(0, 90)}`);
      await p.screenshot({ path: path.join(out, `palette-${id}-${scheme}.png`) });
    }
  }

  ok(!log.some(l => l.startsWith('[pageerror]') || l.startsWith('[console]')), 'no page errors');
  done();
});
