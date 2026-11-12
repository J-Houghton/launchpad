// tests/e2e/settings-glass.spec.js
// Settings in liquid glass (Aurora): its floating controls are glass, a row's selection can be dragged, switches
// slide, the footer's save buttons part from Done once there's something to save, the File menu opens above its
// button, and My view's list of cards can be searched.
import { test } from '@playwright/test';
import { checks, closeContexts, sample, sites } from './support.js';

const site = sites('settings-glass');

test.afterEach(closeContexts);

test('Settings in glass: its controls, dragging a selection, switches, the footer and the card search', async ({ browser }) => {
  const { log, ok, done } = checks();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(look => {
    if (!localStorage.getItem('launchpad:look')) localStorage.setItem('launchpad:look', JSON.stringify(look));
  }, { style: 'aurora', theme: 'light', background: 'still' });
  const p = await ctx.newPage();
  p.on('pageerror', e => log.push('[pageerror] ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(site('sample', sample));
  await p.waitForTimeout(2000);
  const settings = p.locator('dialog.settings:not(.setup)');
  const middle = async loc => {
    const b = await loc.boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const drag = async (from, to) => {
    await p.mouse.move(...await middle(from));
    await p.mouse.down();
    await p.waitForTimeout(250);
    await p.mouse.move(...await middle(to), { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(800);
  };

  await p.keyboard.press('Control+,');
  await p.waitForTimeout(1200);
  ok(await settings.getAttribute('data-glass') !== null, 'Settings is drawn in glass');
  // each lens is made, then drawn, a couple a frame
  for (const control of ['.mode-switch', '.settings-close', '.settings-tabs', '.settings-foot .btn']) {
    await settings.locator(`${control}[data-lens]`).first().waitFor();
  }
  const glass = await settings.locator('[data-lens="glass"]').evaluateAll(els => els.map(e => e.classList[0]));
  ok(['mode-switch', 'icon-btn', 'settings-tabs', 'btn'].every(k => glass.includes(k)), `its switch, close button, tabs and footer buttons are glass (${glass.join(' ')})`);

  // ---- a row's selection, dragged ----
  const tabs = settings.locator('.settings-tabs [role="tab"]');
  await drag(tabs.nth(0), tabs.nth(2));
  ok(await settings.locator('.settings-tabs [aria-selected="true"]').innerText() === 'Widgets', 'dragging the tabs\' selection to Widgets opens Widgets');

  // ---- the footer: Done alone, until there's something to save ----
  const actions = settings.locator('.settings-actions .btn');
  ok(await actions.first().innerText() === 'Done' && (await actions.nth(1).boundingBox()).width < 2, 'with nothing to save, the footer is Done alone');
  await tabs.nth(0).click();
  await p.waitForTimeout(400);
  await settings.locator('.app-editor summary').first().click();
  await p.waitForTimeout(400);
  await settings.locator('.app-editor[open] input.input').first().fill('Side projects!');
  await p.waitForTimeout(900);
  ok(await actions.first().innerText() === 'Cancel' && (await actions.nth(1).boundingBox()).width > 40 && await actions.nth(1).isEnabled(),
    'after a change, Save and Save to file part from it, and Done reads Cancel');

  // ---- the File menu: above its button, once it has grown out of it ----
  const fileButton = settings.locator('.settings-foot .menu-trigger');
  await fileButton.click();
  const menu = p.locator('#menu-file');
  await p.locator('#menu-file[data-lens]').waitFor();
  await menu.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  const [mb, tb] = [await menu.boundingBox(), await fileButton.boundingBox()];
  ok(await menu.getAttribute('data-lens') === 'glass' && mb.y + mb.height <= tb.y + 2, 'the File menu is glass, and sits above its button');
  await p.keyboard.press('Escape');

  // ---- My view: switches, a row of choices, the card search ----
  await settings.locator('.mode-switch [role="tab"]').first().click();
  await p.waitForTimeout(800);
  const sw = settings.locator('.toggle-row .switch').first();
  await sw.scrollIntoViewIfNeeded();
  const s = await sw.boundingBox();
  await p.mouse.move(s.x + s.width - 8, s.y + s.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(300);
  ok(await sw.evaluate(e => e.hasAttribute('data-thumb') && /url\(/.test(e.style.getPropertyValue('--thumb-lens'))), 'held, a switch\'s thumb lifts into a lens');
  await p.mouse.move(s.x + 4, s.y + s.height / 2, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(700);
  ok(!(await sw.isChecked()), 'sliding a switch across turns it off');
  await sw.click();
  await p.waitForTimeout(700);
  ok(await sw.isChecked(), 'clicking it turns it back on');

  await settings.locator('.settings-frame').evaluate(e => e.scrollTo(0, 0));
  await p.waitForTimeout(300);
  const theme = settings.locator('.segmented[aria-label="Theme"] label');
  await drag(theme.nth(1), theme.nth(2));
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:look')).theme) === 'dark', 'dragging Theme\'s selection to Dark picks Dark');

  await settings.locator('.settings-group-head input[type="search"]').fill('mak');
  await p.waitForTimeout(400);
  ok(await settings.locator('.toggle-row').count() === 1, 'the card search narrows the list to the one that matches');

  done();
});
