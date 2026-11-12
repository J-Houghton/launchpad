// tests/e2e/style-css.spec.js
// Custom CSS that starts from the page's style: commented out, read in light and dark, the page's colours (not
// anyone's own), nothing saved until edited, and anyone's own colours still winning over the page's CSS.
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, shots, sites } from './support.js';

const out = shots('style-css');
const site = sites('style-css');

test.afterEach(closeContexts);

const LOOK = '"look": { "theme": "system", "style": "aurora", "background": "particles" }';
if (!sample.includes(LOOK)) throw new Error('sample look changed');
const withLook = look => sample.replace(LOOK, `"look": ${JSON.stringify(look)}`);



test("custom CSS that starts from the page's style", async ({ browser: b }) => {
  const { log, ok, done } = checks();
  const fresh = async (mine = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    await ctx.addInitScript(m => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('launchpad:look', JSON.stringify(m));
      }
    }, mine);
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo/.test(m.text()) && log.push('[console] ' + m.text()));
    return p;
  };
  const settings = p => p.locator('dialog.settings:not(.setup)');
  const openCss = async p => {
    await p.keyboard.press('Control+,');
    await p.waitForTimeout(350);
    await settings(p).getByRole('tab', { name: 'Edit page' }).click();
    await settings(p).getByRole('tab', { name: 'Page', exact: true }).click();
    const fold = settings(p).locator('details.custom-css');
    if (await fold.getAttribute('open') === null) await fold.locator('> summary').click();
    await p.waitForTimeout(250);
    return settings(p).getByRole('textbox', { name: 'Custom CSS' });
  };
  const block = (text, selector) => text.split(selector)[1]?.split('}')[0] ?? '';
  const valueIn = (text, selector, name) => new RegExp(`/\\* ${name}: ([^;]+); \\*/`).exec(block(text, selector))?.[1];
  const accent = p => p.evaluate(() => {
    const i = document.createElement('i');
    document.body.append(i);
    i.style.color = 'var(--accent)';
    const c = getComputedStyle(i).color;
    i.remove();
    return c;
  });

  // ---- 1. an empty box starts with the style's CSS, every line commented out ----
  let p = await fresh();
  const home = site('home', sample);
  await p.goto(home);
  await p.waitForTimeout(1000);
  let box = await openCss(p);
  let text = await box.inputValue();
  ok(text.startsWith('/* Aurora, as the page has it now.'), 'an empty box starts with Aurora\'s CSS');
  const light = ':root.theme-light[data-style="aurora"] {', dark = ':root.theme-dark[data-style="aurora"] {', shapes = ':root[data-style="aurora"] {';
  ok(valueIn(text, light, '--accent') === '#7233bb' && valueIn(text, light, '--bg')?.startsWith('#'), `its colours in light, as hex (accent ${valueIn(text, light, '--accent')})`);
  const darkAccent = valueIn(text, dark, '--accent');
  ok(darkAccent && darkAccent !== '#7233bb', `and in dark, its own (${darkAccent})`);
  ok(/rgb\(255 255 255 \/ 0\.35\)/.test(valueIn(text, light, '--lens-tint') ?? '') && /\/ 0\.35\)/.test(valueIn(text, dark, '--lens-tint') ?? ''), 'the lens tint, see-through, in both');
  ok(valueIn(text, shapes, '--radius-lg') === '1.375rem' && valueIn(text, shapes, '--font-display') === 'var(--font-serif)', 'its corners and type, as written');
  ok(text.includes('/* [data-card="side-projects"] { --hue: 160; } */'), 'and one of the page\'s own cards');
  ok(!/^\s*--/m.test(text.replace(/\/\*[\s\S]*?\*\//g, '')), 'every line is commented out');
  ok(!(await settings(p).locator('.settings-dirty').isVisible()) && /For anything else/.test(await settings(p).locator('details.custom-css .fold-hint').textContent()), 'nothing to save until it\'s edited');
  ok(await settings(p).locator('.css-actions').count() === 0, 'no need to insert it again');
  await p.screenshot({ path: path.join(out, 'start.png') });

  // ---- 2. uncomment a line: it applies, and saves ----
  const before = await accent(p);
  await box.fill(text.replace('/* --accent: #7233bb; */', '--accent: #0a9396;'));
  await p.waitForTimeout(300);
  ok(/0\.6\d* 0\.1\d* 19\d|rgb\(10, 147, 150\)|#0a9396/.test(await accent(p)) || (await accent(p)) !== before, `the page behind shows it (${await accent(p)})`);
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(500);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:config')).data.look.css);
  ok(saved.includes('--accent: #0a9396;') && saved.includes('/* Aurora, as the page has it now.'), 'saved with the rest of it, still commented out');
  await p.reload();
  await p.waitForTimeout(900);
  ok(/rgb\(10, 147, 150\)|0a9396/.test(await accent(p)) || (await accent(p)) !== before, 'and after a reload');
  await p.evaluate(() => document.documentElement.classList.replace('theme-light', 'theme-dark'));
  await p.waitForTimeout(200);
  ok(!/rgb\(10, 147, 150\)/.test(await accent(p)), 'only in light: dark keeps its accent');
  await p.evaluate(() => document.documentElement.classList.replace('theme-dark', 'theme-light'));

  // ---- 3. with CSS already, it can be added; an emptied box stays empty ----
  box = await openCss(p);
  ok((await box.inputValue()).includes('--accent: #0a9396;'), 'the box shows the page\'s CSS');
  await settings(p).getByRole('button', { name: /Insert Aurora's CSS/ }).click();
  await p.waitForTimeout(250);
  const twice = await box.inputValue();
  ok(twice.split('/* Aurora, as the page has it now.').length === 3 && twice.indexOf('--accent: #0a9396;') < twice.lastIndexOf('/* Aurora'), '"Insert Aurora\'s CSS" adds it after what\'s there');
  await box.fill('');
  await p.waitForTimeout(250);
  ok(await box.inputValue() === '', 'emptied, the box stays empty');
  await settings(p).getByRole('button', { name: 'Cancel' }).click().catch(() => p.keyboard.press('Escape'));
  await p.context().close();

  // ---- 4. read right in dark too; anyone's own colours left out, the page's taken ----
  p = await fresh({ theme: 'dark', colors: { aurora: { light: { accent: '#ff0000' }, dark: { accent: '#ff0000' } } } });
  await p.goto(site('page-colours', withLook({ theme: 'system', style: 'aurora', background: 'particles', colors: { aurora: { hues: [200, 250, 25] } } })));
  await p.waitForTimeout(1000);
  text = await (await openCss(p)).inputValue();
  const lightAccent = valueIn(text, light, '--accent');
  ok(lightAccent !== '#ff0000' && valueIn(text, dark, '--accent') !== '#ff0000', 'your own colours aren\'t in it');
  const [r, g, bl] = [1, 3, 5].map(i => parseInt(lightAccent.slice(i, i + 2), 16));
  ok(g > r && bl > r, `the page's colours are: its Lagoon combo makes the accent teal (${lightAccent})`);
  ok(await p.evaluate(() => document.documentElement.classList.contains('theme-dark')), 'and the page stayed dark while it was read');
  await p.context().close();

  // ---- 5. other styles: Liquid's tint, Classic without one ----
  p = await fresh();
  await p.goto(site('liquid', withLook({ theme: 'system', style: 'liquid', background: 'particles' })));
  await p.waitForTimeout(1000);
  text = await (await openCss(p)).inputValue();
  ok(text.startsWith('/* Liquid,') && /rgb\(255 255 255 \/ 0\.28\)/.test(valueIn(text, ':root.theme-light[data-style="liquid"] {', '--lens-tint') ?? '') && valueIn(text, ':root[data-style="liquid"] {', '--radius-lg') === '2.5rem', 'Liquid: its own tint and rounder corners');
  await p.context().close();
  p = await fresh();
  await p.goto(site('classic', withLook({ theme: 'system', style: 'classic', background: 'particles' })));
  await p.waitForTimeout(1000);
  text = await (await openCss(p)).inputValue();
  ok(text.startsWith('/* Classic,') && !text.includes('--lens-tint') && valueIn(text, ':root.theme-light[data-style="classic"] {', '--accent') === valueIn(text, ':root.theme-light[data-style="classic"] {', '--ink'), 'Classic: no glass, and its accent is its text colour');
  await p.context().close();

  // ---- 6. anyone's own colours still win over the page's CSS, however the page loads ----
  for (const css of [true, false]) {
    p = await fresh({ colors: { aurora: { light: { accent: '#ff0000' } } } });
    await p.goto(site(`order-${css}`, withLook({ theme: 'light', style: 'aurora', background: 'particles', ...(css ? { css: [':root.theme-light[data-style="aurora"] { --accent: #00ff00; }'] } : {}) })));
    await p.waitForTimeout(900);
    if (!css) {
      // the page's CSS arrives later, through Settings
      box = await openCss(p);
      await box.fill(':root.theme-light[data-style="aurora"] { --accent: #00ff00; }');
      await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
      await p.waitForTimeout(500);
    }
    ok(/rgb\(255, 0, 0\)/.test(await accent(p)), `your own accent wins over the page's CSS (${css ? 'CSS from the file' : 'CSS added in Settings'})`);
    await p.context().close();
  }

  done();
});
