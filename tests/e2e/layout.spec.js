// tests/e2e/layout.spec.js
// The 12-column layout: default placement, three sizes, Arrange mode, the Layout tab, and legacy configs.
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, samplePath, settled, shots, sites, v3 } from './support.js';

const out = shots('layout');
const site = sites('layout');

test.afterEach(closeContexts);

const v3NoWeather = v3.replace('"weather": { "enabled": true', '"weather": { "enabled": false');
const checked = sample.replace('"statusChecks": false', '"statusChecks": true');


test('the 12-column layout: placement, sizes, arranging, the Layout tab, and old configs', async ({ browser: b }) => {
  const { log, ok, done } = checks();
  const fresh = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', ...opts });
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo/.test(m.text()) && log.push('[console] ' + m.text()));
    p.on('dialog', d => d.accept());
    return p;
  };
  const box = (p, sel) => p.locator(sel).first().evaluate(e => {
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const sectionBox = (p, id) => box(p, `[data-section="${id}"]`);
  const cardBox = (p, name) => box(p, `.app-card:has(h3:text-is("${name}"))`);
  const openSettings = async p => { await p.keyboard.press('Control+,'); await p.waitForTimeout(350); };
  const tab = (p, name) => p.getByRole('tab', { name, exact: true }).click();
  const tools = (p, scope) => p.locator(`${scope} > .arrange-tools`);
  const width = async (p, scope, value) => { await tools(p, scope).locator('select').selectOption(value); await p.waitForTimeout(500); };

  // ---- 1. the default layout, on a wide screen ----
  let p = await fresh();
  const url = site('sample', sample);
  await p.goto(url);
  await p.waitForTimeout(1500);
  const [g, c, w, pin, rec, cards] = await Promise.all(['greeting', 'clock', 'weather', 'pinned', 'recent', 'cards'].map(id => sectionBox(p, id)));
  ok(c.y === w.y && Math.abs(c.w - w.w) <= 1 && g.w > c.w * 1.9, `wide: greeting beside clock and weather (${g.w} / ${c.w} / ${w.w})`);
  ok(pin.y === rec.y && Math.abs(pin.w / rec.w - 7 / 5) < 0.12, `wide: pinned 7/12 beside recent 5/12 (${pin.w} / ${rec.w})`);
  ok(cards.y > pin.y && cards.w > 1100, `wide: cards full width below (${cards.w}px)`);
  const [learning, reading] = [await cardBox(p, 'Learning'), await cardBox(p, 'Reading')];
  ok(learning.y === reading.y && Math.abs(learning.w - reading.w) <= 1 && learning.h === reading.h, `two cards share a row, same height (${learning.w}×${learning.h}, ${reading.w}×${reading.h})`);
  await p.screenshot({ path: path.join(out, 'wide.png'), fullPage: true });

  // ---- 2. medium and narrow ----
  await p.setViewportSize({ width: 820, height: 1000 });
  await p.waitForTimeout(400);
  const [gm, cm, wm] = await Promise.all(['greeting', 'clock', 'weather'].map(id => sectionBox(p, id)));
  const [lm, rm] = [await cardBox(p, 'Learning'), await cardBox(p, 'Reading')];
  ok(gm.y < cm.y && cm.y === wm.y && Math.abs(cm.w - wm.w) <= 1, 'medium: greeting full width, clock and weather half each');
  ok(rm.y > lm.y, 'medium: half-width cards stack');
  await p.screenshot({ path: path.join(out, 'medium.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(400);
  const [cn, wn, pn, rn] = await Promise.all(['clock', 'weather', 'pinned', 'recent'].map(id => sectionBox(p, id)));
  ok(cn.y === wn.y && pn.y < rn.y, 'narrow: clock and weather side by side, pinned and recent stacked');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(overflow <= 0, `narrow: no sideways scroll (${overflow}px)`);
  await p.screenshot({ path: path.join(out, 'narrow.png'), fullPage: true });
  await p.setViewportSize({ width: 1440, height: 1000 });

  // ---- 3. Arrange mode, from the Layout tab ----
  await openSettings(p);
  await tab(p, 'Layout');
  ok(await p.locator('.section-row').count() === 6, 'Layout tab lists the 6 sections');
  await p.screenshot({ path: path.join(out, 'layout-tab.png') });
  await p.getByRole('button', { name: 'Arrange on the page' }).click();
  await p.waitForTimeout(700);
  ok(await p.evaluate(() => document.documentElement.classList.contains('is-arranging')), 'arranging');
  ok(await p.locator('[data-section] > .arrange-tools').count() === 6 && await p.locator('.app-card > .arrange-tools').count() === 4, 'toolbars on 6 sections and 4 cards');
  ok(await p.locator('.env-link').first().evaluate(a => !!a.closest('[inert]')), 'tiles are inert while arranging');
  await openSettings(p);
  ok(!(await p.locator('settings-panel dialog').evaluate(d => d.open)), 'settings stay shut while arranging');
  await p.screenshot({ path: path.join(out, 'arrange.png'), fullPage: true });

  await width(p, '[data-section="clock"]', '6');
  const [g2, c2] = [await sectionBox(p, 'greeting'), await sectionBox(p, 'clock')];
  ok(Math.abs(c2.w / g2.w - 2) < 0.15, `clock ½ → greeting (Auto) shrinks to ¼ (${g2.w} / ${c2.w})`);
  ok(await p.locator('[data-section="greeting"] > .resize-handle').getAttribute('aria-valuenow') === '3', 'Auto: its handle reports what it works out to (3 of 12)');
  ok((await tools(p, '[data-section="clock"]').locator('select option').allTextContents()).join() === 'Auto,1,2,3,4,5,6,7,8,9,10,11,12', 'widths read Auto, 1–12');
  ok(await p.locator('.page > .grid-guides > span').count() === 12, 'arranging draws the 12 columns');
  // drag the weather's right edge in to 2 columns
  await settled(p);
  const edge = p.locator('[data-section="weather"] > .resize-handle');
  const eb = await edge.boundingBox();
  const colW = await p.locator('.page > .grid-guides > span').first().evaluate(e => e.getBoundingClientRect().width);
  await p.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await p.mouse.down();
  await p.mouse.move(eb.x + eb.width / 2 - (colW + 16), eb.y + eb.height / 2, { steps: 6 });
  ok(await p.locator('[data-section="weather"][data-resizing]').count() === 1, 'dragging marks the item');
  await p.mouse.up();
  await p.waitForTimeout(300);
  ok(await tools(p, '[data-section="weather"]').locator('select').inputValue() === '2', `dragging the edge one column in: 3 → ${await tools(p, '[data-section="weather"]').locator('select').inputValue()}`);
  await edge.focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(500);
  ok(await tools(p, '[data-section="weather"]').locator('select').inputValue() === '3', 'the arrow keys on the handle step the width');
  await tools(p, '[data-section="weather"]').getByRole('button', { name: 'Start a new row' }).click();
  await p.waitForTimeout(500);
  ok((await sectionBox(p, 'weather')).y > (await sectionBox(p, 'clock')).y, '"new row" moves weather down a row');
  await tools(p, '[data-section="recent"]').getByRole('button', { name: /^Hide/ }).click();
  await p.waitForTimeout(500);
  ok(await p.locator('[data-section="recent"]').count() === 0 && (await sectionBox(p, 'pinned')).w > 1100, 'hiding recent: pinned (Auto) takes the row');
  ok(await p.locator('.arrange-chip', { hasText: 'Recent' }).count() === 1, 'the bar offers hidden Recent back');

  // keyboard: Reading moves before Learning
  await p.locator('.app-card:has(h3:text-is("Reading")) > .arrange-tools .drag-handle').focus();
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(600);
  const order1 = await p.locator('.app-title').allTextContents();
  ok(order1.indexOf('Reading') < order1.indexOf('Learning'), `arrow key moves a card (${order1.join(', ')})`);
  // pointer: drag Side projects after Making
  const handle = p.locator('.app-card:has(h3:text-is("Side projects")) > .arrange-tools .drag-handle');
  const hb = await handle.boundingBox();
  const making = await cardBox(p, 'Making');
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.mouse.down();
  await p.mouse.move(hb.x + 20, hb.y + 40, { steps: 5 });
  await p.mouse.move(making.x + making.w * 0.75, making.y + making.h * 0.6, { steps: 12 });
  await p.waitForTimeout(150);
  const marker = await p.locator('[data-sort-axis="grid"] > .drop-after, [data-sort-axis="grid"] > .drop-before').count();
  await p.mouse.up();
  await p.waitForTimeout(600);
  const order2 = await p.locator('.app-title').allTextContents();
  ok(marker === 1 && order2.indexOf('Making') < order2.indexOf('Side projects'), `drag drops a card after another (${order2.join(', ')})`);

  await p.locator('.arrange-bar label', { hasText: 'Compact' }).click();
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.documentElement.dataset.density) === 'compact', 'density: compact');
  await p.screenshot({ path: path.join(out, 'arranged.png'), fullPage: true });

  // cancel puts everything back
  await p.locator('.arrange-bar').getByRole('button', { name: 'Cancel' }).click();
  await p.waitForTimeout(700);
  const back = await p.locator('.app-title').allTextContents();
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('is-arranging'))) && back.join() === 'Side projects,Making,Learning,Reading'
    && await p.locator('[data-section="recent"]').count() === 1 && await p.evaluate(() => document.documentElement.dataset.density) === 'comfortable',
    'Cancel restores the page');

  // save keeps it
  await openSettings(p);
  await tab(p, 'Layout');
  await p.getByRole('button', { name: 'Arrange on the page' }).click();
  await p.waitForTimeout(600);
  await width(p, '.app-card:has(h3:text-is("Making"))', '6');
  await tools(p, '.app-card:has(h3:text-is("Learning"))').getByRole('button', { name: 'Start a new row' }).click();
  await p.waitForTimeout(400);
  await p.locator('.arrange-bar').getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(800);
  await p.reload();
  await p.waitForTimeout(2200); // the cards' entrance (fade and spring) has settled
  const [mk, ln, rd] = [await cardBox(p, 'Making'), await cardBox(p, 'Learning'), await cardBox(p, 'Reading')];
  ok(mk.y === ln.y && ln.y === rd.y && Math.abs(mk.w - 2 * ln.w - 16) <= 2, `saved: Making ½ with Learning and Reading ¼ each, one row, after reload (${mk.w} / ${ln.w} / ${rd.w})`);
  await p.screenshot({ path: path.join(out, 'saved-row.png'), fullPage: true });

  // card width in the card editor, and Esc leaving arrange mode
  await openSettings(p);
  await tab(p, 'Cards');
  const editor = p.locator('details[data-card-editor="making"]');
  await editor.locator('summary').click();
  await editor.locator('[data-field="card:making:span"]').selectOption('');
  await p.locator('.settings-foot .btn-soft', { hasText: /^\s*Save\s*$/ }).click();
  await p.waitForTimeout(700);
  const [mk2, ln2] = [await cardBox(p, 'Making'), await cardBox(p, 'Learning')];
  ok(Math.abs(mk2.w - ln2.w) <= 1, `card editor: Making back to Auto shares the row equally (${mk2.w} / ${ln2.w})`);
  await p.context().close();

  // ---- 4. status checks don't re-run for layout changes ----
  p = await fresh();
  let pings = 0;
  p.on('request', r => { if (r.method() === 'HEAD' && /example\.com/.test(r.url())) pings++; });
  await p.goto(site('checked', checked));
  await p.waitForTimeout(1500);
  const first = pings;
  await openSettings(p);
  await tab(p, 'Layout');
  await p.getByRole('button', { name: 'Arrange on the page' }).click();
  await p.waitForTimeout(500);
  await width(p, '[data-section="clock"]', '4');
  await width(p, '[data-section="weather"]', '2');
  await p.waitForTimeout(800);
  ok(first > 0 && pings === first, `layout edits don't re-ping tiles (${first} at load, ${pings - first} after)`);
  await p.context().close();

  // ---- 5. older configs ----
  p = await fresh({ colorScheme: 'light' });
  await p.goto(site('v3', v3));
  await p.waitForTimeout(1200);
  const [g3, c3, w3] = await Promise.all(['greeting', 'clock', 'weather'].map(id => sectionBox(p, id)));
  ok(c3.y === w3.y && g3.y === c3.y, 'v3 config: default layout, weather shown');
  await p.screenshot({ path: path.join(out, 'v3-light.png'), fullPage: true });
  await p.goto(site('v3-noweather', v3NoWeather));
  await p.waitForTimeout(1000);
  ok(await p.locator('[data-section="weather"]').count() === 0, 'v3 with weather "enabled": false → hidden');
  // a page with no weather place yet: showing it offers to choose one
  await p.goto(site('starter'));
  await p.waitForTimeout(900);
  ok(await p.locator('[data-section="weather"]').count() === 0, 'starter: weather hidden until there\'s a place');
  await openSettings(p);
  await tab(p, 'Widgets');
  await p.locator('.settings-card', { hasText: 'Weather' }).locator('.switch').first().click();
  await p.locator('.settings-foot .btn-soft', { hasText: /^\s*Save\s*$/ }).click();
  await p.waitForTimeout(500);
  const focusedField = await p.evaluate(() => document.activeElement?.getAttribute('data-field'));
  ok(focusedField === 'weather:search', `settings won't show the weather without a place (${focusedField})`);
  await p.locator('settings-panel').getByRole('button', { name: 'Cancel' }).click();
  await p.waitForTimeout(300);
  await openSettings(p);
  await tab(p, 'Layout');
  await p.getByRole('button', { name: 'Arrange on the page' }).click();
  await p.waitForTimeout(500);
  await p.locator('.arrange-chip', { hasText: 'Weather' }).click();
  await p.waitForTimeout(500);
  ok(await p.locator('weather-widget').getByRole('button', { name: 'Choose a place' }).count() === 1, 'shown from Arrange, a weather with no place offers "Choose a place"');
  await p.locator('.arrange-bar').getByRole('button', { name: 'Cancel' }).click();
  await p.waitForTimeout(500);
  // Open file reads a saved config, comment header and all
  await openSettings(p);
  await p.locator('input.settings-file').setInputFiles(samplePath);
  await p.waitForTimeout(500);
  const toastText = await p.locator('.toast').last().textContent().catch(() => '');
  ok(/Loaded/.test(toastText ?? ''), `Open file loads a launchpad.config.js (${(toastText ?? '').trim()})`);
  await p.context().close();

  done();
});
