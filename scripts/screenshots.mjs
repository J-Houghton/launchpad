// scripts/screenshots.mjs
// Takes the screenshots the README and docs show (docs/images/*.webp), from the built page:
//   npm run build && npm run docs:shots
// It drives a real browser the way the tests do (tests/e2e), with the sample config that ships with the page and
// the old launch-page config the tests keep. Run it again whenever the page's look changes.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs', 'images');
const SITES = path.join(ROOT, 'test-results', 'sites', 'docs');
const SIZE = { width: 1280, height: 800 };
const STYLES = ['aurora', 'liquid', 'classic', 'blueprint', 'paper', 'neon', 'bold'];

const channel = process.env.LAUNCHPAD_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
fs.mkdirSync(OUT, { recursive: true });

/** A copy of the built page with this config beside it; its file:// address. */
function site(name, configText) {
  const dir = path.join(SITES, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(DIST, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'launchpad.config.js'), configText);
  return pathToFileURL(path.join(dir, 'index.html')).href;
}

const shipped = fs.readFileSync(path.join(DIST, 'launchpad.config.js'), 'utf8');
const home = site('home', shipped);
const launch = site('launch', fs.readFileSync(path.join(ROOT, 'tests', 'e2e', 'fixtures', 'v3.config.js'), 'utf8'));

/** A page showing `url` in this look, settled. */
async function open(url, look, viewport = SIZE) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(mine => {
    if (!localStorage.getItem('launchpad:look')) localStorage.setItem('launchpad:look', JSON.stringify(mine));
  }, { theme: 'light', style: 'aurora', background: 'still', ...look });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(3500); // the greeting types itself out, and the lenses are made a couple a frame
  return page;
}

/** Saves a PNG as WebP (the browser does the encoding: no image library needed). */
async function save(name, png) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const webp = await page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }, png.toString('base64'));
  await context.close();
  const file = path.join(OUT, `${name}.webp`);
  fs.writeFileSync(file, Buffer.from(webp, 'base64'));
  console.log(`${name}.webp  ${Math.round(fs.statSync(file).size / 1024)} kB`);
}

const settings = page => page.locator('dialog.settings:not(.setup)');
const done = page => page.context().close();

// ---- the home page, light and dark ----
for (const theme of ['light', 'dark']) {
  const page = await open(home, { theme });
  await save(`home-${theme}`, await page.screenshot());
  await done(page);
}

// ---- a launch page: a tile per environment, lined up in columns ----
{
  const page = await open(launch, {});
  await page.locator('.apps').scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -90));
  await page.waitForTimeout(600);
  await save('launch-page', await page.screenshot());
  await done(page);
}

// ---- the seven styles, as one sheet ----
{
  const thumbs = [];
  for (const style of STYLES) {
    const page = await open(home, { style, theme: style === 'neon' ? 'dark' : 'light' }, { width: 1200, height: 750 });
    thumbs.push({ style, png: (await page.screenshot()).toString('base64') });
    await done(page);
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 200 }, deviceScaleFactor: 1 });
  const sheet = await context.newPage();
  await sheet.setContent(`
    <body style="margin:0;padding:16px;background:#fff;display:grid;grid-template-columns:repeat(4,1fr);align-content:start;gap:16px;font:600 15px system-ui,sans-serif;color:#222">
      ${thumbs.map(t => `<figure style="margin:0"><img src="data:image/png;base64,${t.png}" style="display:block;width:100%;border-radius:10px;box-shadow:0 0 0 1px #0002"><figcaption style="padding:6px 2px 0;text-transform:capitalize">${t.style}</figcaption></figure>`).join('')}
    </body>`);
  await save('styles', await sheet.locator('body').screenshot());
  await context.close();
}

// ---- Settings: My view, and Edit page ----
{
  const page = await open(home, {});
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(1200);
  await settings(page).locator('.app-editor summary').first().click();
  await page.waitForTimeout(600);
  await save('settings-edit', await page.screenshot());
  await settings(page).locator('.app-editor summary').first().click();
  await settings(page).locator('.mode-switch [role="tab"]').first().click();
  await page.waitForTimeout(1000);
  await page.mouse.move(5, 5);
  await save('settings-my-view', await page.screenshot());
  await done(page);
}

// ---- arranging the page ----
{
  const page = await open(home, {});
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(1000);
  await settings(page).getByRole('tab', { name: 'Layout', exact: true }).click();
  await settings(page).getByRole('button', { name: 'Arrange on the page' }).click();
  await page.waitForTimeout(1500);
  await save('arrange', await page.screenshot());
  await done(page);
}

// ---- what floats in glass: the dock, a sticky heading, the corner buttons, and the lens on a tile ----
{
  const page = await open(home, {}, { width: 1280, height: 640 });
  for (let i = 0; i < 3; i++) {
    await page.locator('.env-tile').nth(i).click({ button: 'right' });
    await page.waitForTimeout(300);
    await page.locator('tile-menu .menu-item', { hasText: 'Pin' }).first().click();
    await page.waitForTimeout(600);
  }
  await page.evaluate(() => scrollTo(0, document.querySelector('.apps').getBoundingClientRect().top + scrollY - 70));
  await page.waitForTimeout(900);
  const tile = await page.locator('.env-tile').nth(5).boundingBox();
  await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.waitForTimeout(900);
  await save('glass-floating', await page.screenshot());
  await done(page);
}

// ---- the glass lens, picked up ----
{
  const page = await open(home, { theme: 'dark' });
  const lens = await page.locator('.lp-lens').boundingBox();
  const title = await page.locator('.hero-title').boundingBox();
  await page.mouse.move(lens.x + lens.width / 2, lens.y + lens.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + title.width * 0.55, title.y + title.height * 0.5, { steps: 12 });
  await page.waitForTimeout(900);
  await save('lens', await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 520 } }));
  await page.mouse.up();
  await done(page);
}

await browser.close();
