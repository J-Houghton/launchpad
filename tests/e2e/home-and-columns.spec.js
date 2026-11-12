// tests/e2e/home-and-columns.spec.js
// Home page vs launch page (the Columns switch), strict card editor, and the sideways tile gallery.
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, shots, sites, v3 } from './support.js';

const out = shots('home-and-columns');
const site = sites('home-and-columns');

test.afterEach(closeContexts);

const cfg = o => `window.LAUNCHPAD_CONFIG = ${JSON.stringify(o)};`;

const sixColumns = cfg({
  version: 4, site: { title: 'Wide', heading: 'Applications', footer: '' }, statusChecks: false, useColumns: true,
  columns: ['A', 'B', 'C', 'D', 'E', 'F'].map((l, i) => ({ id: l.toLowerCase(), label: l, color: ['#0b95da', '#da950b', '#8b5cf6', '#10b981', '#f97316', '#e61a5e'][i] })),
  groups: [], links: [],
  cards: ['One', 'Two'].map(n => ({ id: n.toLowerCase(), name: n, links: [], tiles: ['a', 'b', 'c', 'd', 'e', 'f'].map(c => ({ column: c, url: `https://${c}.${n.toLowerCase()}.example.com` })) })),
  widgets: { greeting: { enabled: false }, clock: { enabled: false, zones: [] }, weather: { enabled: false } },
});


test('home page or launch page (the Columns switch), the card editor, and the sideways tile gallery', async ({ browser: b }) => {
  const { log, ok, done } = checks();
  const fresh = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', ...opts });
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo/.test(m.text()) && log.push('[console] ' + m.text()));
    p.on('dialog', d => d.accept());
    return p;
  };
  const count = (p, sel) => p.locator(sel).count();
  const openSettings = async p => { await p.keyboard.press('Control+,'); await p.waitForTimeout(350); };
  const tab = (p, name) => p.getByRole('tab', { name, exact: true }).click();
  // columns live in a folding panel at the top of the Cards tab
  const columnsPanel = async p => {
    await tab(p, 'Cards');
    const d = p.locator('details.columns-panel');
    if (!(await d.evaluate(e => e.open))) await d.locator('summary').click();
  };
  const columnsSwitch = p => p.locator('details.columns-panel .fold-body > .switch-label .switch');
  const save = async p => { await p.locator('.settings-foot .btn-soft', { hasText: /^\s*Save\s*$/ }).click(); await p.waitForTimeout(700); };
  const scrollLeft = loc => loc.evaluate(e => Math.round(e.scrollLeft));

  // ---- 1. the sample: a home page, one card past four tiles ----
  let p = await fresh();
  await p.goto(site('sample', sample));
  await p.waitForTimeout(1500);
  ok(await count(p, '.app-card') === 4, `sample: 4 cards (got ${await count(p, '.app-card')})`);
  ok(await count(p, '.env-grid') === 0, 'sample: no columns');
  ok(await count(p, 'tile-gallery') === 1, `sample: only the 7-tile card is a gallery (got ${await count(p, 'tile-gallery')})`);
  const gallery = p.locator('tile-gallery').first();
  const track = gallery.locator('.gallery-track');
  ok(await gallery.evaluate(g => g.hasAttribute('data-more-end') && !g.hasAttribute('data-more-start')), 'gallery: more to the right only');
  const widths = await p.evaluate(() => {
    const w = sel => Math.round(document.querySelector(sel).getBoundingClientRect().width);
    return { gallery: w('tile-gallery .env-tile'), plain: w('.app-card:has(h3[id="card-making"]) .tile-grid .env-tile') };
  });
  const visible = await track.evaluate(t => [...t.children].filter(li => {
    const r = li.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return r.left >= tr.left - 1 && r.right <= tr.right + 1;
  }).length);
  ok(visible === 4, `gallery shows 4 tiles at a time (got ${visible})`);
  ok(Math.abs(widths.gallery - widths.plain) <= 1, `gallery tiles match a plain card's (${widths.gallery} vs ${widths.plain}px)`);
  await p.screenshot({ path: path.join(out, 'home-dark.png'), fullPage: true });
  await gallery.hover();
  await p.waitForTimeout(200);
  await gallery.locator('.gallery-btn.next').click();
  await p.waitForTimeout(900);
  const afterNext = await scrollLeft(track);
  ok(afterNext > 0, `next arrow scrolls (scrollLeft ${afterNext})`);
  ok(await gallery.evaluate(g => g.hasAttribute('data-more-start') && !g.hasAttribute('data-more-end')), 'at the end: more to the left only');
  const snapped = await track.evaluate(t => {
    const first = [...t.children].find(li => li.getBoundingClientRect().right > t.getBoundingClientRect().left + 8);
    return Math.round(first.getBoundingClientRect().left - t.getBoundingClientRect().left);
  });
  ok(Math.abs(snapped - 4) <= 2, `snaps to a tile edge (first visible tile at ${snapped}px)`);
  await p.locator('.app-card').first().screenshot({ path: path.join(out, 'gallery-end.png') });
  await gallery.locator('.gallery-btn.prev').click();
  await p.waitForTimeout(900);
  ok(await scrollLeft(track) === 0, 'prev arrow scrolls back to the start');
  // keyboard: tabbing to the last tile brings it into view
  await track.locator('.env-link').last().focus();
  await p.waitForTimeout(700);
  const lastInView = await track.evaluate(t => {
    const r = t.lastElementChild.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return r.right <= tr.right + 2;
  });
  ok(lastInView, 'focusing an off-screen tile scrolls it into view');

  // ---- 2. strict editor on a home page: tiles only; add, validate, reorder ----
  await openSettings(p);
  ok(await count(p, 'details.columns-panel') === 1 && await count(p, '[role=tab]:has-text("Environments")') === 0, 'columns are a panel in the Cards tab');
  await tab(p, 'Cards');
  const card = p.locator('details[data-card-editor="learning"]');
  await card.locator('summary').click();
  ok(await card.locator('.app-env-row').count() === 0, 'home page: no column rows in the card editor');
  await card.getByRole('button', { name: 'Add tile' }).click();
  const row = card.locator('.free-tile-row').last();
  await row.locator('[aria-label=Name]').fill('Chess openings');
  await save(p);
  const focused = await p.evaluate(() => document.activeElement?.getAttribute('data-field'));
  ok(focused === 'tile:learning:3:url', `validation points at the missing address (${focused})`);
  await row.locator('[aria-label=Address]').fill('https://chess.example.com');
  await row.locator('.drag-handle').focus();
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press('ArrowUp');
    // each step redraws the list and hands the focus back to the handle
    await p.waitForTimeout(80);
    await p.waitForFunction(() => document.activeElement?.matches('.drag-handle'));
  }
  ok(await card.locator('.free-tile-row').first().locator('[aria-label=Name]').inputValue() === 'Chess openings', 'keyboard reorder');
  await save(p);
  ok(await count(p, 'tile-gallery') === 1 && await count(p, '.app-card:has-text("Learning") .tile-grid > li') === 4, 'a 4-tile card stays a plain grid');

  // ---- 3. Columns on: strict column rows, home tiles kept as "Not in a column" ----
  await openSettings(p);
  await columnsPanel(p);
  ok(await count(p, '.preset-row') === 0, 'columns off: presets hidden');
  await columnsSwitch(p).click();
  await p.locator('.preset', { hasText: 'Dev · Test · Prod' }).first().click();
  await tab(p, 'Cards');
  await card.locator('summary').click();
  ok(await card.locator('.app-env-row').count() === 3, 'columns on: a row per column');
  ok(await card.getByRole('button', { name: 'Add tile' }).count() === 0, 'columns on: no "Add tile" (strict)');
  ok(await card.locator('.sub-editor', { hasText: 'Not in a column' }).locator('.free-tile-row').count() === 4, 'existing tiles listed as "Not in a column"');
  await card.locator('.app-env-row', { hasText: 'DEV' }).locator('input[type=url]').fill('https://dev.learning.example.com');
  await p.screenshot({ path: path.join(out, 'editor-columns-on.png') });
  await save(p);
  ok(await count(p, '.app-card:has-text("Learning") .env-grid') === 1, 'column tile shows in a column row');
  await openSettings(p);
  await columnsPanel(p);
  await columnsSwitch(p).click();
  await save(p);
  ok(await count(p, '.env-grid') === 0, 'columns off again: no column rows');
  const devTile = (await p.locator('.app-card:has-text("Learning") .env-tile', { hasText: 'dev.learning' }).textContent()).replace(/\s+/g, ' ').trim();
  ok(/^DEV/.test(devTile), `its column tile stays, tagged: "${devTile}"`);
  await openSettings(p);
  await tab(p, 'Cards');
  await card.locator('summary').click();
  ok(await card.locator('.tile-column-pill', { hasText: 'DEV' }).count() === 1, 'editor shows the kept column tile with its column badge');
  await p.screenshot({ path: path.join(out, 'editor-columns-off.png') });
  await p.context().close();

  // ---- 4. an old launch config: columns on, pins, and switching columns off keeps pins ----
  p = await fresh({ colorScheme: 'light' });
  const v3url = site('v3', v3);
  await p.goto(v3url);
  await p.evaluate(() => localStorage.setItem('launchpad:pins', JSON.stringify(['billing:prod', 'storefront:dev'])));
  await p.reload();
  await p.waitForTimeout(1200);
  ok(await count(p, '.env-grid') === 4, `v3: 4 cards with column rows (got ${await count(p, '.env-grid')})`);
  ok((await p.locator('#cards-title').textContent()).includes('Applications'), 'v3: heading "Applications"');
  ok(await count(p, 'tile-gallery') === 0, 'v3: 4 columns fit, no gallery');
  ok(await count(p, '[data-section="pinned"] .chip-item') === 2, 'v3: old pins resolve');
  await p.screenshot({ path: path.join(out, 'launch-light.png'), fullPage: true });
  await openSettings(p);
  await columnsPanel(p);
  await columnsSwitch(p).click();
  ok(/kept for when you turn this back on/.test(await p.getByRole('tabpanel').textContent()), 'columns off: says the columns are kept');
  await save(p);
  ok(await count(p, '.env-grid') === 0 && await count(p, 'tile-gallery') === 0, 'v3 with columns off: plain tiles (no card over 4)');
  ok(await count(p, '[data-section="pinned"] .chip-item') === 2, 'pins survive switching columns off');
  await p.context().close();

  // ---- 5. more than four columns: galleries that scroll together ----
  p = await fresh();
  await p.goto(site('six', sixColumns));
  await p.waitForTimeout(1200);
  const rows = p.locator('tile-gallery[data-sync="columns"]');
  ok(await rows.count() === 2, `6 columns: both rows are galleries (got ${await rows.count()})`);
  await rows.first().hover();
  await rows.first().locator('.gallery-btn.next').click();
  await p.waitForTimeout(1200);
  const [l1, l2] = [await scrollLeft(rows.nth(0).locator('.gallery-track')), await scrollLeft(rows.nth(1).locator('.gallery-track'))];
  ok(l1 > 0 && l1 === l2, `rows scroll together, so columns stay lined up (${l1} / ${l2})`);
  await p.screenshot({ path: path.join(out, 'six-columns.png') });
  await p.context().close();

  // ---- 6. setup guide: a launch page ----
  p = await fresh();
  await p.goto(site('starter'));
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Start the setup guide' }).click();
  await p.locator('[data-field="setup:title"]').fill('Team');
  await p.getByRole('button', { name: /Next/ }).click();
  ok(await p.locator('.preset-card', { hasText: 'Just links' }).locator('input').isChecked(), 'guide: "Just links" by default');
  await p.locator('.preset-card', { hasText: 'Apps in Dev · Test · Prod' }).click();
  await p.getByRole('button', { name: /Next/ }).click();
  await p.locator('[data-field="setup:0:name"]').fill('Billing');
  await p.locator('[data-field="setup:0:dev"]').fill('https://dev.billing.example.com');
  await p.locator('[data-field="setup:0:prod"]').fill('https://billing.example.com');
  await p.getByRole('button', { name: /Next/ }).click();
  await p.getByRole('button', { name: 'Keep in this browser' }).click();
  await p.waitForTimeout(900);
  ok(await count(p, '.env-grid .env-tile') === 2 && await count(p, '.env-empty') === 1, 'guide built a launch card with columns');
  ok((await p.locator('#cards-title').textContent()).includes('Applications'), 'guide: heading follows the layout');

  // ---- 7. phone: gallery shows ~1 tile with a peek; no sideways page scroll ----
  await p.context().close();
  p = await fresh({ viewport: { width: 390, height: 844 } });
  await p.goto(site('sample-phone', sample));
  await p.waitForTimeout(900);
  const phone = await p.evaluate(() => {
    const t = document.querySelector('tile-gallery .gallery-track');
    const tile = t.firstElementChild.getBoundingClientRect().width;
    return { ratio: +(t.clientWidth / tile).toFixed(2), page: document.documentElement.scrollWidth - innerWidth };
  });
  ok(phone.ratio > 1 && phone.ratio < 1.4, `phone: one tile plus a peek of the next (${phone.ratio} per view)`);
  ok(phone.page <= 0, `phone: no sideways page scroll (${phone.page}px)`);
  await p.locator('.app-card').first().screenshot({ path: path.join(out, 'phone-gallery.png') });
  await p.context().close();

  done();
});
