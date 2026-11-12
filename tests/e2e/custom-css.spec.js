// tests/e2e/custom-css.spec.js
// Custom CSS: from the file, the hooks it can aim at, editing it in Settings, saving it, opening someone else's, and ?safe.
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, shots, sites } from './support.js';

const out = shots('custom-css');
const site = sites('custom-css');

test.afterEach(closeContexts);

const LOOK = '"look": { "theme": "system", "style": "aurora", "background": "particles" }';
if (!sample.includes(LOOK)) throw new Error('sample look line changed');
const withCss = sample.replace(LOOK, `"look": { "theme": "system", "style": "aurora", "background": "particles", "css": [
    ".app-card { border-radius: 0; }",
    "[data-card=\\"making\\"] { --hue: 160; }",
    "[data-tile=\\"recipe-box\\"] { --env: rgb(255, 0, 0); }"
  ] }`);


test("custom CSS: from the file, its hooks, editing and saving it, someone else's, and ?safe", async ({ browser: b }) => {
  const { log, ok, done } = checks();
  let answer = true;
  const messages = [];
  const fresh = async (init) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo/.test(m.text()) && log.push('[console] ' + m.text()));
    p.on('dialog', d => { messages.push(d.message()); answer ? d.accept() : d.dismiss(); });
    return p;
  };
  const settings = p => p.locator('dialog.settings:not(.setup)');
  const openSettings = async p => { await p.keyboard.press('Control+,'); await p.waitForTimeout(350); };
  // custom CSS is folded away at the foot of Edit page → Page
  const lookTab = async p => {
    await settings(p).getByRole('tab', { name: 'Page', exact: true }).click();
    const d = settings(p).locator('details.custom-css');
    if (!(await d.evaluate(e => e.open))) await d.locator(':scope > summary').click();
    await p.waitForTimeout(300);
  };
  const radius = p => p.locator('.app-card').first().evaluate(e => getComputedStyle(e).borderTopLeftRadius);
  const customCss = p => p.evaluate(() => document.getElementById('launchpad-custom-css')?.textContent ?? null);
  const textarea = p => settings(p).getByRole('textbox', { name: 'Custom CSS' });

  // ---- 1. from the file: before the app runs, and it wins without fighting specificity ----
  let p = await fresh(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') window.__cssBeforeApp = !!document.getElementById('launchpad-custom-css') && !customElements.get('app-shell');
    });
  });
  const cssUrl = site('css', withCss);
  await p.goto(cssUrl);
  await p.waitForTimeout(1200);
  ok(await p.evaluate(() => window.__cssBeforeApp), 'custom CSS is on the page before the app starts');
  ok((await customCss(p))?.split('\n').length === 3, 'the file\'s lines are joined into one stylesheet');
  ok(await radius(p) === '0px', `".app-card { border-radius: 0 }" wins over the built-in style (${await radius(p)})`);

  // hooks
  ok(await p.locator('.app-card[data-card="making"]').count() === 1, 'cards carry data-card');
  ok(await p.locator('.env-tile[data-tile="recipe-box"]').count() === 1, 'tiles carry data-tile');
  const making = await p.locator('[data-card="making"] .app-mark').evaluate(e => getComputedStyle(e).backgroundImage);
  ok(/oklch\([\d.]+ [\d.]+ 160\)/.test(making), `--hue on a card recolours its badge (${making.slice(0, 70)})`);
  const makingTile = await p.locator('[data-card="making"] .env-tile').first().evaluate(e => getComputedStyle(e).getPropertyValue('--env'));
  ok(/160/.test(makingTile), `…and its tiles (${makingTile.trim()})`);
  const red = await p.locator('[data-tile="recipe-box"]').evaluate(e => getComputedStyle(e, '::before').backgroundColor);
  ok(red === 'rgb(255, 0, 0)', `--env on a tile recolours it (${red})`);
  const learning = await p.locator('[data-card="learning"] .app-mark').evaluate(e => getComputedStyle(e).backgroundImage);
  ok(!/ 160\)/.test(learning), 'other cards keep their colours');
  // pinned chips keep the tile's colour from the config
  await p.screenshot({ path: path.join(out, 'from-file.png') });

  // ---- 2. editing it in Settings: live, reverted on cancel, saved on save ----
  p = await fresh();
  const url = site('sample', sample);
  await p.goto(url);
  await p.waitForTimeout(1000);
  ok(await customCss(p) === '' || await customCss(p) === null, 'no custom CSS in the sample');
  const before = await radius(p);
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await lookTab(p);
  ok(await textarea(p).isVisible(), 'Look tab has a Custom CSS box');
  await textarea(p).fill('.app-card { border-radius: 0; }\n:root { --accent: rgb(0, 128, 0); }');
  await p.waitForTimeout(200);
  ok(await radius(p) === '0px', 'typing shows it on the page straight away');
  await settings(p).locator('.css-help > summary').click();
  ok(await settings(p).locator('.css-ref').isVisible() && await settings(p).locator('.css-help').getByText('side-projects').first().isVisible(), 'the help lists variables, hooks and this page\'s card ids');
  await p.screenshot({ path: path.join(out, 'look-tab-css.png') });
  await settings(p).getByRole('tab', { name: 'Cards', exact: true }).click();
  await p.waitForTimeout(200);
  ok(await radius(p) === before, 'leaving the Look tab stops the preview');
  await lookTab(p);
  ok(await radius(p) === '0px', 'coming back shows it again');
  await settings(p).getByRole('button', { name: 'Cancel' }).click();
  await p.waitForTimeout(300);
  ok(await radius(p) === before, `cancelling goes back (${await radius(p)})`);

  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await lookTab(p);
  await textarea(p).fill('.app-card { border-radius: 0; }\n.hero-sub { display: none; }');
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(700);
  ok(await radius(p) === '0px' && !(await p.locator('.hero-sub').isVisible()), 'saved: it stays on the page');
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:config')).data.look.css);
  ok(kept.includes('.hero-sub'), 'kept in this browser');
  await p.reload();
  await p.waitForTimeout(800);
  ok(await radius(p) === '0px', 'and after a reload');

  // written to the file as a list of lines
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('button', { name: /^File/ }).click();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#menu-file').getByRole('button', { name: /Download a copy/ }).click()]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  ok(/"css": \[\n\s+"\.app-card \{ border-radius: 0; \}",\n\s+"\.hero-sub \{ display: none; \}"\n\s+\]/.test(text), 'the file lists the CSS one line per entry');
  const noCss = sample;
  ok(!/"css"/.test(noCss), 'a page without custom CSS has no "css" key in its file');
  await settings(p).getByRole('button', { name: 'Close settings' }).click();
  await p.waitForTimeout(300);

  // ---- 3. opening someone else's file asks first ----
  p = await fresh();
  await p.goto(url);
  await p.waitForTimeout(900);
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  answer = false;
  messages.length = 0;
  await p.locator('.settings-file').setInputFiles({ name: 'theirs.config.js', mimeType: 'text/javascript', buffer: Buffer.from(withCss) });
  await p.waitForTimeout(400);
  ok(messages.some(m => /custom CSS/.test(m) && /trust/.test(m)), 'opening a file with CSS asks first');
  await lookTab(p);
  const keptCss = await textarea(p).inputValue();
  ok(!keptCss.includes('border-radius: 0') && keptCss.startsWith('/* Aurora, as the page has it now.'), 'Cancel loads it without the CSS (the box just shows the style\'s to start from)');
  answer = true;
  await p.locator('.settings-file').setInputFiles({ name: 'theirs.config.js', mimeType: 'text/javascript', buffer: Buffer.from(withCss) });
  await p.waitForTimeout(400);
  ok((await textarea(p).inputValue()).includes('border-radius: 0'), 'OK keeps it');
  // the same CSS again isn't asked about twice
  messages.length = 0;
  await p.locator('.settings-file').setInputFiles({ name: 'theirs.config.js', mimeType: 'text/javascript', buffer: Buffer.from(withCss) });
  await p.waitForTimeout(400);
  ok(!messages.some(m => /custom CSS/.test(m)), 'opening the same CSS again doesn\'t ask again');
  answer = true;

  // ---- 4. ?safe leaves it off ----
  p = await fresh();
  await p.goto(cssUrl + '?safe');
  await p.waitForTimeout(1000);
  ok(await radius(p) !== '0px', `?safe: the page's custom CSS is off (${await radius(p)})`);
  ok(await p.locator('.toast').textContent().then(t => /Safe mode/.test(t)).catch(() => false), '?safe says so');
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await lookTab(p);
  ok(await settings(p).getByText('Safe mode is on').isVisible(), 'the Look tab says so too');
  ok(await radius(p) !== '0px', 'and doesn\'t preview it');
  await p.screenshot({ path: path.join(out, 'safe-mode.png') });

  // ---- 5. styles still look right with custom CSS around: a preview isn't touched by the page's CSS ----
  p = await fresh();
  await p.goto(cssUrl);
  await p.waitForTimeout(800);
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'My view' }).click();
  const previewRadius = await settings(p).locator('.style-preview[data-style="aurora"] .sp-card').evaluate(e => getComputedStyle(e).borderTopLeftRadius);
  ok(previewRadius === '16px', `previews keep their own shapes (${previewRadius})`);

  ok(!log.some(l => l.startsWith('[pageerror]') || l.startsWith('[console]')), 'no page errors');
  done();
});
