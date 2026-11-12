// tests/e2e/choices.firefox.spec.js
// Firefox, which draws frosted glass in place of the lens: a row of choices in Settings still chooses. (Firefox
// doesn't pass a scripted click on a label along to its radio button, which once left these rows dead there.)
// Needs `npx playwright install firefox` once.
import { test } from '@playwright/test';
import { checks, closeContexts, sample, sites } from './support.js';

const site = sites('choices-firefox');

test.afterEach(closeContexts);

test('Firefox: Settings\' rows of choices can be chosen', async ({ browser }) => {
  const { log, ok, done } = checks();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(look => {
    if (!localStorage.getItem('launchpad:look')) localStorage.setItem('launchpad:look', JSON.stringify(look));
  }, { style: 'aurora', theme: 'light', background: 'still' });
  const p = await ctx.newPage();
  p.on('pageerror', e => log.push('[pageerror] ' + e.message));
  await p.goto(site('sample', sample));
  await p.waitForTimeout(2500);
  const settings = p.locator('dialog.settings:not(.setup)');
  const mine = () => p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:look')));

  await p.keyboard.press('Control+,');
  await p.waitForTimeout(1000);
  await settings.locator('.mode-switch [role="tab"]').first().click();
  await p.waitForTimeout(800);
  ok(await settings.locator('.mode-switch [aria-selected="true"]').innerText() === 'My view', 'the My view / Edit page switch switches');

  await settings.locator('.segmented[aria-label="Theme"] label').nth(2).click();
  await p.waitForTimeout(800);
  ok((await mine()).theme === 'dark', 'Theme can be set to Dark');
  await settings.locator('.segmented[aria-label="Background"] label').nth(2).click();
  await p.waitForTimeout(800);
  ok((await mine()).background === 'plain', 'Background can be set to Plain');
  ok(await settings.locator('.mode-switch').getAttribute('data-lens') === 'frost', 'the controls are frosted here, not lenses');
  done();
});
