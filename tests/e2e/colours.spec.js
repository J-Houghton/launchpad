// tests/e2e/colours.spec.js
// Colours (My view: per style, per theme; the page's via "Make it everyone's"; ?safe) and the hints that use this page's names.
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, DIST, sample, shots, sites } from './support.js';

const out = shots('colours');
const site = sites('colours');

test.afterEach(closeContexts);

const TEAL = '#0a9396';


test("colours: per style and theme, the page's, ?safe, and the hints that use them", async ({ browser: b }) => {
  const { log, ok, done } = checks();
  const fresh = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', acceptDownloads: true, ...opts });
    await ctx.route('https://data.example.test/**', r => r.fulfill({
      contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        full_name: 'acme/rocket', owner: { login: 'acme', id: 7 }, pushed_at: new Date(Date.now() - 7200_000).toISOString(),
        releases: [{ name: 'v1.2', published_at: new Date().toISOString() }, { name: 'v1.1', published_at: new Date().toISOString() }],
      }),
    }));
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo/.test(m.text()) && log.push('[console] ' + m.text()));
    p.on('dialog', d => d.accept());
    return p;
  };
  const settings = p => p.locator('dialog.settings:not(.setup)');
  const openSettings = async p => { await p.keyboard.press('Control+,'); await p.waitForTimeout(350); };
  const myView = async p => { await settings(p).getByRole('tab', { name: 'My view' }).click(); await p.waitForTimeout(200); };
  const editTab = async (p, name) => {
    await settings(p).getByRole('tab', { name: 'Edit page' }).click();
    await settings(p).getByRole('tab', { name, exact: true }).click();
    await p.waitForTimeout(250);
  };
  const styleCard = (p, name) => settings(p).locator('label.style-card').filter({ has: p.locator('.style-name', { hasText: new RegExp(`^\\s*${name}\\b`) }) });
  const pickStyle = async (p, name) => { await styleCard(p, name).click(); await p.waitForTimeout(450); };
  const theme = async (p, label) => {
    await settings(p).getByRole('radiogroup', { name: 'Theme' }).locator('label', { hasText: label }).click();
    await p.waitForTimeout(450);
  };
  const SLOTS = { Background: 'bg', Panels: 'panel', Text: 'ink', Accent: 'accent', 'Second accent': 'accent-2', Highlight: 'accent-3' };
  const swatch = (p, name) => settings(p).locator('.swatch').filter({ has: p.locator('.swatch-name', { hasText: new RegExp(`^${name}$`) }) });
  const swatchValue = async (p, name) => (await swatch(p, name).locator('.swatch-chip').getAttribute('aria-label')).split(': ')[1];
  const picker = (p, name) => p.locator(`#color-${SLOTS[name]}`);
  const openPicker = async (p, name) => { await swatch(p, name).locator('.swatch-chip').click(); await p.waitForTimeout(250); };
  const closePicker = async p => { await p.keyboard.press('Escape'); await p.waitForTimeout(150); };
  // picks a colour by typing its code into the picker
  const setSwatch = async (p, name, hex) => {
    await openPicker(p, name);
    await picker(p, name).locator('.cp-hex').fill(hex);
    await p.waitForTimeout(200);
    await closePicker(p);
  };
  const combo = (p, name) => settings(p).locator('label.combo').filter({ has: p.locator('.combo-name', { hasText: new RegExp(`^\\s*${name}\\b`) }) });
  const pickCombo = async (p, name) => { await combo(p, name).click(); await p.waitForTimeout(350); };
  const checkedCombo = p => settings(p).locator('label.combo:has(input:checked) .combo-name').evaluate(e => e.textContent.replace('Original', '').trim());
  const mine = p => p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:look') ?? 'null'));
  // a variable as it stands somewhere on the page, worked out to a colour
  const colorOf = (p, name, selector = 'body') => p.evaluate(([name, selector]) => {
    const i = document.createElement('i');
    document.querySelector(selector).append(i);
    i.style.color = `var(${name})`;
    const c = getComputedStyle(i).color;
    i.remove();
    return c;
  }, [name, selector]);
  const hueOf = c => Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)/.exec(c)?.[1]);
  const varOf = (p, name, selector = ':root') => p.evaluate(([n, s]) => getComputedStyle(document.querySelector(s)).getPropertyValue(n).trim(), [name, selector]);
  const fineTuneHead = p => settings(p).locator('.colors-sub .field-hint').textContent().then(t => t.trim());

  // ---- 1. combos to start from, then six colours to fine-tune, drawn in the style ----
  let p = await fresh();
  const home = site('sample', sample);
  await p.goto(home);
  await p.waitForTimeout(1000);
  await openSettings(p);
  await myView(p);
  ok(/Just for you\./.test(await settings(p).locator('.settings-hint').first().textContent()), 'My view starts by saying it\'s just for you, in this browser');
  ok(await settings(p).locator('label.combo').count() === 6, 'Aurora offers six combos');
  ok(await checkedCombo(p) === 'Aurora', 'its own is chosen to begin with, marked Original');
  ok(await settings(p).locator('.swatch').count() === 6, 'six colours to fine-tune');
  ok((await settings(p).locator('.swatch-name').allTextContents()).join() === 'Background,Panels,Text,Accent,Second accent,Highlight', 'named Background, Panels, Text, Accent, Second accent, Highlight');
  ok(await fineTuneHead(p) === 'Aurora, light', 'fine-tuning is headed with the style and theme it\'s for');
  ok(await settings(p).locator('input[type=color]').count() === 0, 'no browser colour inputs');
  const auroraAccent = await swatchValue(p, 'Accent');
  const [r, g, bl] = [1, 3, 5].map(i => parseInt(auroraAccent.slice(i, i + 2), 16));
  ok(/^#[0-9a-f]{6}$/.test(auroraAccent) && r > g && bl > g, `Aurora's accent shows as its purple (${auroraAccent})`);
  const chip = () => settings(p).locator('.swatch-chip').first().evaluate(e => ({ radius: getComputedStyle(e).borderTopLeftRadius, border: getComputedStyle(e).borderTopWidth }));
  ok((await chip()).radius === '16px', 'Aurora draws them with its round corners');
  const lagoonPreview = await settings(p).locator('label.combo').nth(1).locator('.combo-preview').evaluate(e => getComputedStyle(e).getPropertyValue('--hue-1').trim());
  ok(lagoonPreview === '200', 'each combo\'s preview is drawn with its own hues');
  await p.screenshot({ path: path.join(out, 'colors-aurora.png') });

  // ---- 2. a combo: one click, light and dark, and the whole style follows ----
  const blobBefore = hueOf(await colorOf(p, '--blob-1'));
  await pickCombo(p, 'Lagoon');
  ok(await checkedCombo(p) === 'Lagoon', 'Lagoon is chosen');
  ok(JSON.stringify((await mine(p))?.colors?.aurora) === '{"hues":[200,250,25]}', 'kept in this browser as Aurora\'s hues');
  const accentHue = hueOf(await colorOf(p, '--accent'));
  ok(accentHue === 200 && hueOf(await colorOf(p, '--accent-2')) === 250, `the accents take the combo's hues (${accentHue})`);
  ok(hueOf(await colorOf(p, '--bg')) === 205 && hueOf(await colorOf(p, '--ink')) === 200, 'Aurora\'s tinted background and text follow');
  const blobAfter = hueOf(await colorOf(p, '--blob-1'));
  ok(Math.abs(blobBefore - 300) < 3 && blobAfter === 200, `and its glow (hue ${blobBefore} → ${blobAfter})`);
  ok(hueOf(await p.locator('.app-mark').first().evaluate(e => getComputedStyle(e).backgroundImage.match(/oklch\([^)]+\)/)[0])) > 150, 'and the cards\' colours start from it');
  ok(await settings(p).locator('.look-note', { hasText: 'This look is yours, in this browser' }).isVisible(), 'My view says the look is yours, in this browser');
  await p.screenshot({ path: path.join(out, 'colors-lagoon.png') });
  await theme(p, 'Dark');
  ok(hueOf(await colorOf(p, '--accent')) === 200 && await checkedCombo(p) === 'Lagoon', 'the same combo in dark');
  await p.screenshot({ path: path.join(out, 'colors-lagoon-dark.png') });
  await theme(p, 'Light');

  // ---- 3. fine-tuning, in the page's own picker ----
  await openPicker(p, 'Accent');
  const pop = picker(p, 'Accent');
  ok(await pop.isVisible() && await pop.locator('color-picker .cp-area').isVisible(), 'a swatch opens a picker beside it');
  const [pb, sb] = [await pop.boundingBox(), await swatch(p, 'Accent').locator('.swatch-chip').boundingBox()];
  ok(Math.abs(pb.y - (sb.y + sb.height)) < 20 || Math.abs(pb.y + pb.height - sb.y) < 20, 'right by its swatch');
  ok(await pop.locator('.cp-area').evaluate(e => getComputedStyle(e).borderTopLeftRadius) === '10px', 'drawn in the style: Aurora\'s rounded corners');
  await p.screenshot({ path: path.join(out, 'picker.png') });
  // drag in the square: top right is full strength and brightness
  const area = await pop.locator('.cp-area').boundingBox();
  await p.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await p.mouse.down();
  await p.mouse.move(area.x + area.width - 1, area.y + 1, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(200);
  const dragged = await varOf(p, '--accent');
  ok(/^#[0-9a-f]{6}$/.test(dragged) && (await mine(p)).colors.aurora.light.accent === dragged, `dragging picks a colour, applied at once (${dragged})`);
  ok((await mine(p)).colors.aurora.hues?.[0] === 200, 'on top of the combo, which stays');
  // the hue strip, by keyboard
  await pop.locator('.cp-hue').focus();
  const before = await varOf(p, '--accent');
  for (let i = 0; i < 20; i++) await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(200);
  ok(await varOf(p, '--accent') !== before, 'the hue strip works from the keyboard');
  // the square, by keyboard
  await pop.locator('.cp-thumb').focus();
  const beforeKeys = await varOf(p, '--accent');
  await p.keyboard.press('Shift+ArrowDown');
  await p.waitForTimeout(200);
  ok(await varOf(p, '--accent') !== beforeKeys, 'and so does the square');
  await pop.locator('.cp-hex').fill('0a9396');
  await p.waitForTimeout(200);
  ok(await varOf(p, '--accent') === TEAL, 'a hex code can be typed, with or without its #');
  ok(await pop.locator('.color-menu-reset').isVisible(), 'and there\'s a way back to the combo\'s');
  await closePicker(p);
  ok(await swatch(p, 'Accent').getAttribute('data-mine') !== null && await swatch(p, 'Accent').locator('.swatch-reset').count() === 1, 'the swatch is marked as fine-tuned');
  const blobTeal = hueOf(await colorOf(p, '--blob-1'));
  ok(blobTeal > 170 && blobTeal < 215, `the glow follows a fine-tuned accent too (${blobTeal})`);
  await setSwatch(p, 'Accent', '#1d3557');
  ok(/oklch\(0\.99 0 0\)/.test(await colorOf(p, '--accent-fg')), 'words on the accent stay readable: light on a dark one');
  await setSwatch(p, 'Accent', '#ffd166');
  ok(/oklch\(0\.15 0 0\)/.test(await colorOf(p, '--accent-fg')), '…and dark on a light one');
  await setSwatch(p, 'Accent', TEAL);
  await setSwatch(p, 'Panels', '#fff8e7');
  ok(await varOf(p, '--panel') === '#fff8e7' && /0\.56\)$/.test(await colorOf(p, '--glass')), 'a panel colour keeps Aurora\'s frosted see-through-ness');
  ok(await settings(p).locator('label.combo').first().locator('.combo-preview').evaluate(e => getComputedStyle(e).getPropertyValue('--accent').trim()) !== TEAL,
    'the combo previews still show the combos, not your fine-tuning');
  await p.screenshot({ path: path.join(out, 'colors-picked.png') });

  // ---- 4. each style keeps its own ----
  await pickStyle(p, 'Paper');
  ok(await swatchValue(p, 'Accent') !== TEAL && await varOf(p, '--accent') !== TEAL, 'Paper still has its own accent');
  ok(await fineTuneHead(p) === 'Paper, light' && await checkedCombo(p) === 'Red ink', 'and its own combos');
  ok(await varOf(p, '--accent', '.style-preview[data-style="aurora"]') === TEAL, 'Aurora\'s preview card shows your Aurora colours');
  ok((await chip()).radius === '2px', 'Paper draws the swatches square, as it does everything');
  await pickCombo(p, 'Blue ink');
  ok(hueOf(await colorOf(p, '--accent')) === 255 && hueOf(await colorOf(p, '--bg')) === 85, 'Blue ink: the ink changes, the cream paper stays');
  await p.screenshot({ path: path.join(out, 'colors-paper.png') });
  await pickStyle(p, 'Bold');
  ok((await chip()).border === '2px', 'Bold draws them with its chunky borders');
  await p.screenshot({ path: path.join(out, 'colors-bold.png') });
  await pickStyle(p, 'Aurora');
  ok(await varOf(p, '--accent') === TEAL && await checkedCombo(p) === 'Lagoon', 'back on Aurora: Lagoon, with your accent');
  const kept = (await mine(p)).colors;
  ok(kept.aurora.light.accent === TEAL && kept.paper.hues[0] === 255, 'both kept, apart');

  // ---- 5. light and dark have their own fine-tuning ----
  await theme(p, 'Dark');
  ok(await fineTuneHead(p) === 'Aurora, dark' && await varOf(p, '--accent') !== TEAL, 'in dark, Lagoon without light\'s fine-tuning');
  await setSwatch(p, 'Background', '#0b1d26');
  await p.screenshot({ path: path.join(out, 'colors-dark.png') });
  await theme(p, 'Light');
  ok(await varOf(p, '--bg') !== '#0b1d26' && await varOf(p, '--accent') === TEAL, 'light is untouched by dark\'s');

  // ---- 6. before the first paint, on the next visit ----
  await p.reload();
  await p.waitForTimeout(900);
  ok(await varOf(p, '--accent') === TEAL && await varOf(p, '--hue-1') === '200', 'still there after a reload');
  const noModule = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').replace(/<script type="module"[\s\S]*?<\/script>/, '');
  const look = await mine(p);
  const p2 = await fresh();
  await p2.addInitScript(l => localStorage.setItem('launchpad:look', l), JSON.stringify(look));
  await p2.goto(site('inline-only', sample, noModule));
  await p2.waitForTimeout(200);
  ok(await p2.evaluate(() => !!document.getElementById('launchpad-colors') && !customElements.get('app-shell')), 'the inline script puts them on before the app has even started');
  ok(await p2.evaluate(() => /--hue-1: 200;/.test(document.getElementById('launchpad-colors').textContent) && /--accent: #0a9396;/.test(document.getElementById('launchpad-colors').textContent)), 'combo and fine-tuning both');
  await p2.context().close();

  // ---- 7. putting them back ----
  await openSettings(p);
  await myView(p);
  await swatch(p, 'Panels').locator('.swatch-reset').click();
  await p.waitForTimeout(250);
  ok(!(await mine(p)).colors.aurora.light.panel, 'the corner button puts one colour back to the combo\'s');
  await setSwatch(p, 'Text', await swatchValue(p, 'Background'));
  ok(await settings(p).locator('.look-note', { hasText: 'hard to read' }).isVisible(), 'text the same as the background: a warning');
  await pickCombo(p, 'Sunset');
  ok(JSON.stringify((await mine(p)).colors.aurora) === '{"hues":[40,355,85]}', 'another combo starts afresh: fine-tuning in light and dark goes');
  await pickCombo(p, 'Aurora');
  ok(!(await mine(p)).colors?.aurora && await checkedCombo(p) === 'Aurora', 'the Original combo is the style as it comes');
  ok((await mine(p)).colors?.paper?.hues?.[0] === 255, '…and leaves Paper\'s alone');
  await settings(p).locator('.look-note').getByRole('button', { name: /Use the page/ }).click();
  await p.waitForTimeout(400);
  ok(!(await mine(p)).colors, '"Use the page\'s" puts every colour back');

  // ---- 8. ?safe leaves them out ----
  await setSwatch(p, 'Text', '#eeeeee');
  const safe = await fresh();
  await safe.addInitScript(l => localStorage.setItem('launchpad:look', l), JSON.stringify(await mine(p)));
  await safe.goto(home + '?safe');
  await safe.waitForTimeout(900);
  ok(await safe.evaluate(() => !document.getElementById('launchpad-colors')) && await varOf(safe, '--ink') !== '#eeeeee', '?safe: the page is in the style\'s own colours');
  ok(/colours/.test(await safe.locator('.toast, [role=status]').first().textContent().catch(() => '')), '…and says so');
  await safe.context().close();
  await settings(p).locator('.look-note').getByRole('button', { name: /Use the page/ }).click();
  await p.waitForTimeout(300);

  // ---- 9. making them everyone's ----
  await pickCombo(p, 'Lagoon');
  await setSwatch(p, 'Accent', TEAL);
  await settings(p).locator('.look-note').getByRole('button', { name: /Make it everyone/ }).click();
  await p.waitForTimeout(300);
  const lookCard = settings(p).locator('.settings-card', { hasText: 'Look' });
  await p.waitForTimeout(600);
  const [cardBox, bodyBox] = [await settings(p).locator('.look-card').boundingBox(), await settings(p).locator('.settings-body').boundingBox()];
  ok(cardBox.y >= bodyBox.y - 1 && cardBox.y + cardBox.height <= bodyBox.y + bodyBox.height + 1, 'it scrolls to the page\'s Look, in view');
  ok(/own colours/.test(await lookCard.textContent()), 'the page\'s look now says it has its own colours');
  ok(/Changed, but not saved yet\. Save to file puts it in launchpad\.config\.js/.test((await lookCard.textContent()).replace(/\s+/g, ' ')), 'and says it isn\'t saved yet, and what each save does');
  await p.screenshot({ path: path.join(out, 'make-everyones.png') });
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(500);
  const pageLook = await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:config')).data.look);
  ok(JSON.stringify(pageLook.colors?.aurora) === '{"hues":[200,250,25],"light":{"accent":"#0a9396"}}', 'saved into the page\'s look: the combo and the fine-tuning');
  ok(!(await mine(p))?.colors && await varOf(p, '--accent') === TEAL, 'yours now just follow the page\'s, which is the same');
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('tab', { name: 'Page', exact: true }).click();
  ok(!(await settings(p).locator('.settings-card', { hasText: 'Look' }).textContent()).includes('not saved yet'), 'once saved, the note goes');
  await myView(p);
  await pickCombo(p, 'Aurora');
  ok(JSON.stringify((await mine(p)).colors?.aurora) === '{"hues":[300,345,70]}' && await varOf(p, '--accent') !== TEAL,
    'the page has a combo: choosing the Original is kept as yours, and leaves out the page\'s fine-tuning');
  await settings(p).locator('.look-note').getByRole('button', { name: /Use the page/ }).click();
  await p.waitForTimeout(300);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('button', { name: /^File/ }).click();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#menu-file').getByRole('button', { name: /Download a copy/ }).click()]);
  const fileText = fs.readFileSync(await dl.path(), 'utf8');
  ok(/"colors": \{\s*"aurora": \{\s*"hues": \[\s*200,\s*250,\s*25\s*\],\s*"light": \{ "accent": "#0a9396" \}/.test(fileText), 'and written to the file');

  // ---- 10. the custom CSS help uses this page's names ----
  await editTab(p, 'Page');
  await settings(p).locator('details.custom-css > summary').click();
  await p.waitForTimeout(250);
  const hint = await settings(p).locator('details.custom-css .fold-body > .field-hint').first().textContent();
  ok(/your “Side projects” card is \[data-card="side-projects"\]/.test(hint.replace(/\s+/g, ' ')), 'the hint names one of your cards');
  ok((await settings(p).locator('details.custom-css textarea').inputValue()).includes('[data-card="side-projects"]'), 'and so does the example in the box');
  await settings(p).locator('details.css-help > summary').first().click();
  const help = (await settings(p).locator('details.custom-css details.css-help').textContent()).replace(/\s+/g, ' ');
  ok(help.includes('[data-tile="recipe-box"]') && help.includes('“Recipe box” is recipe-box'), 'a tile by its real id');
  ok(help.includes('[data-section="greeting"]') && help.includes(':root[data-style="aurora"]') && help.includes('[data-group="other"]'), 'and a real section, style and group');
  await p.screenshot({ path: path.join(out, 'css-help.png') });

  // a launch page: its columns
  await settings(p).getByRole('button', { name: /^File/ }).click();
  await p.locator('#menu-file').getByRole('button', { name: /Launch page/ }).click();
  await p.waitForTimeout(600);
  await editTab(p, 'Page');
  const openFold = settings(p).locator('details.custom-css');
  if (!(await openFold.getAttribute('open') !== null)) await openFold.locator('> summary').click();
  const launchHint = (await settings(p).locator('details.custom-css').textContent()).replace(/\s+/g, ' ');
  ok(/your “Billing” card is \[data-card="billing"\]/.test(launchHint) && /\[data-column="dev"\] \(each DEV tile\)/.test(launchHint), 'on a launch page: its cards and columns');

  // ---- 11. your own time zone as the example ----
  const tz = await fresh({ timezoneId: 'Europe/Berlin' });
  await tz.goto(home);
  await tz.waitForTimeout(900);
  await openSettings(tz);
  await settings(tz).getByRole('tab', { name: 'Edit page' }).click();
  await settings(tz).getByRole('tab', { name: 'Widgets', exact: true }).click();
  await tz.waitForTimeout(250);
  ok(await settings(tz).getByRole('combobox', { name: 'Time zone' }).first().getAttribute('placeholder') === 'Europe/Berlin', 'time zone example: the device\'s own');

  // ---- 12. a data widget's template help uses the data's own names ----
  await settings(tz).getByRole('button', { name: /Show data from a URL/ }).click();
  await tz.locator('#menu-data').getByRole('button', { name: /Your own address/ }).click();
  await tz.waitForTimeout(300);
  const editor = settings(tz).locator('.added-widget').last();
  const helpOf = async () => (await editor.locator('details.css-help', { hasText: 'Writing a template' }).textContent()).replace(/\s+/g, ' ');
  ok((await helpOf()).includes('{{owner.login}}'), 'before trying it, made-up names');
  await editor.getByRole('textbox', { name: /Address/ }).fill('https://data.example.test/repo.json');
  await editor.getByRole('button', { name: 'Try it' }).click();
  await tz.waitForTimeout(600);
  const dataHelp = await helpOf();
  ok(dataHelp.includes('{{full_name}}') && dataHelp.includes('{{owner.login}}') && dataHelp.includes('{{#releases}}…{{/releases}}')
    && dataHelp.includes('{{name}}') && dataHelp.includes('{{pushed_at | ago}}'), 'after Try it, names from what came back');
  await editor.locator('details.css-help', { hasText: 'Writing a template' }).locator('summary').click();
  await tz.screenshot({ path: path.join(out, 'template-help.png') });
  await tz.context().close();

  // phone width: six swatches in two rows of three
  const phone = await fresh({ viewport: { width: 390, height: 844 } });
  await phone.goto(home);
  await phone.waitForTimeout(900);
  await openSettings(phone);
  await myView(phone);
  await settings(phone).locator('.swatches').scrollIntoViewIfNeeded();
  const rows = new Set(await settings(phone).locator('.swatch-chip').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().top))));
  ok(rows.size === 2, `phone: two rows of swatches (${rows.size})`);
  ok(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'phone: nothing overflows');
  await phone.screenshot({ path: path.join(out, 'colors-phone.png') });

  done();
});
