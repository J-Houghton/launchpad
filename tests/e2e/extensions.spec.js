// tests/e2e/extensions.spec.js
// Extensions: loading files beside index.html, the examples that come with Launchpad, the ready-made data
// widgets, safe mode, and what's refused. Requests to the public APIs are answered by the test, offline.
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, shots, sites } from './support.js';

const out = shots('extensions');
const site = sites('extensions');

test.afterEach(closeContexts);

const WEATHER = '"weather": { "place": "London, England", "latitude": 51.5085, "longitude": -0.1257, "units": "celsius" }';
const LOOK = '"look": { "theme": "system", "style": "aurora", "background": "particles" }';
if (!sample.includes(WEATHER) || !sample.includes(LOOK)) throw new Error('sample changed');
const inDays = n => new Date(Date.now() + n * 86400_000 + 3 * 3600_000).toISOString().slice(0, 16);
const withExtensions = sample
  .replace(WEATHER, `${WEATHER},
    "added": [
      { "id": "notes", "type": "extension", "extension": "notes", "title": "Scratchpad", "options": { "lines": 4 } },
      { "id": "launch", "type": "extension", "extension": "countdown", "title": "", "options": { "label": "Launch", "when": "${inDays(12)}" } },
      { "id": "find", "type": "extension", "extension": "search", "title": "", "options": { "engine": "custom", "address": "https://search.example.test/?q=%s", "newTab": false } },
      { "id": "gone", "type": "extension", "extension": "missing-thing", "title": "Not here", "options": {} }
    ]`)
  .replace(LOOK, `"look": { "theme": "dark", "style": "aurora", "background": "starfield" },
  "extensions": ["extensions/notes.js", "extensions/countdown.js", "extensions/search.js", "extensions/starfield.js", "https://evil.example.test/x.js", "../outside.js", "extensions/broken.js", "extensions/nope.js"]`);
const BROKEN = `Launchpad.widget('Bad Name', { name: 'x', render() {} });`;


test("extensions: loading, the examples, the ready-made data widgets, safe mode, and what's refused", async ({ browser: b }) => {
  const { log, ok, done } = checks();
  const remote = [];
  let answer = true;
  const messages = [];
  const fresh = async () => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await ctx.route('https://evil.example.test/**', route => { remote.push(route.request().url()); return route.fulfill({ body: 'window.__evil = true' }); });
    await ctx.route('https://search.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>results</title>' }));
    const json = body => route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    await ctx.route('https://api.github.com/**', json({ full_name: 'lit/lit', html_url: 'https://github.com/lit/lit', description: 'Lit', stargazers_count: 20500, forks_count: 950, open_issues_count: 500, pushed_at: new Date(Date.now() - 7200_000).toISOString() }));
    await ctx.route('https://hn.algolia.com/**', json({ hits: [{ title: 'Show HN: a launch page', url: 'https://example.com/a', points: 120, num_comments: 40, objectID: '1' }] }));
    await ctx.route('https://open.er-api.com/**', json({ base_code: 'USD', time_last_update_unix: Math.floor(Date.now() / 1000), rates: { EUR: 0.9213, GBP: 0.7812, JPY: 151.2, CAD: 1.37 } }));
    await ctx.route('https://www.githubstatus.com/**', json({ page: { url: 'https://www.githubstatus.com', updated_at: new Date().toISOString() }, status: { description: 'All Systems Operational' }, incidents: [] }));
    const p = await ctx.newPage();
    p.on('pageerror', e => { if (!/Bad Name/.test(e.message)) log.push('[pageerror] ' + e.message); });
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo|ERR_|Bad Name/.test(m.text()) && log.push('[console] ' + m.text()));
    p.on('dialog', d => { messages.push(d.message()); answer ? d.accept() : d.dismiss(); });
    return p;
  };
  const settings = p => p.locator('dialog.settings:not(.setup)');
  const openSettings = async p => { await p.keyboard.press('Control+,'); await p.waitForTimeout(350); };
  const editTab = async (p, name) => {
    await settings(p).getByRole('tab', { name: 'Edit page' }).click();
    await settings(p).getByRole('tab', { name, exact: true }).click();
    await p.waitForTimeout(250);
  };
  const openFold = async (p, cls) => {
    const d = settings(p).locator(`details.${cls}`);
    if (!(await d.evaluate(e => e.open))) await d.locator(':scope > summary').click();
  };

  // ---- 1. extensions from the config ----
  let p = await fresh();
  const url = site('ext', withExtensions, { 'extensions/broken.js': BROKEN });
  await p.goto(url);
  await p.waitForTimeout(1800);
  ok(await p.evaluate(() => typeof window.Launchpad?.widget === 'function' && window.Launchpad.version === 2 && typeof window.Launchpad.glass === 'function'), 'window.Launchpad is there, with glass (version 2)');
  ok(await p.evaluate(() => { try { window.Launchpad = null; } catch { /* strict */ } return !!window.Launchpad; }), 'and can\'t be replaced');
  ok(remote.length === 0 && !(await p.evaluate(() => window.__evil)), 'an address in "extensions" is never loaded');
  const scripts = await p.evaluate(() => [...document.querySelectorAll('script[data-extension]')].map(s => s.dataset.extension));
  ok(!scripts.includes('../outside.js') && scripts.length === 6, `only paths beside the page are tried (${scripts.join(', ')})`);

  // notes
  const notes = p.locator('[data-section="notes"] extension-widget');
  ok(await notes.locator('.widget-title').textContent() === 'Scratchpad', 'notes: its title');
  const area = notes.locator('textarea.lp-notes');
  ok(await area.getAttribute('rows') === '4' && await area.getAttribute('placeholder') === 'Jot something down…', 'notes: its settings, and defaults for the rest');
  await area.fill('remember the milk');
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:widget:notes:text'))) === 'remember the milk', 'notes: saved in its own corner of storage');
  // countdown
  const count = p.locator('[data-section="launch"] extension-widget');
  ok(/^12\s*days$/.test((await count.locator('.lp-countdown-big').textContent()).trim()), `countdown: ${(await count.locator('.lp-countdown-big').textContent()).trim()}`);
  ok(/until Launch/.test(await count.locator('.lp-countdown-foot').textContent()), 'countdown: until what');
  ok(await count.locator('.widget-title').textContent() === 'Countdown', 'an untitled extension widget is named after its type');
  // search: bare, "/" focuses it, searching goes to the address
  const search = p.locator('[data-section="find"] extension-widget');
  ok(await search.evaluate(e => e.hasAttribute('data-bare')) && await search.locator('.widget-label').count() === 0, 'search: bare, with no title bar');
  await p.locator('body').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press('/');
  ok(await p.evaluate(() => document.activeElement?.matches('.lp-search input')), '"/" jumps to the search box');
  await p.screenshot({ path: path.join(out, 'extensions.png') });
  await p.keyboard.type('launch pads');
  await p.keyboard.press('Enter');
  await p.waitForURL(/search\.example\.test/);
  ok(p.url() === 'https://search.example.test/?q=launch%20pads', `search: goes to its address (${p.url()})`);
  await p.goBack();
  await p.waitForTimeout(1500);
  // missing
  ok(/isn't loaded \("missing-thing"\)/.test(await p.locator('[data-section="gone"]').textContent()), 'a widget whose extension isn\'t loaded says so');
  // starfield
  ok(await p.evaluate(() => document.documentElement.dataset.background) === 'starfield', 'the config\'s background is an extension\'s');
  const lit = await p.locator('.backdrop canvas').evaluate(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  });
  ok(lit > 200, `starfield: stars on the canvas (${lit} pixels lit)`);

  // Settings: statuses, and the extensions' widget types and background on offer
  await openSettings(p);
  await editTab(p, 'Page');
  await openFold(p, 'extensions');
  const state = async i => (await settings(p).locator('.extension-row').nth(i).locator('.ext-state').textContent()).trim();
  ok(/Adds the Notes widget/.test(await state(0)), `status: ${await state(0)}`);
  ok(/Adds the Starfield background/.test(await state(3)), `status: ${await state(3)}`);
  ok(/won't do/.test(await state(4)), `a file that breaks the rules says why: ${await state(4)}`);
  ok(/not found/.test(await state(5)), `a missing file says so: ${await state(5)}`);
  ok(await settings(p).locator('.extension-row').count() === 6, 'the address and the path outside were dropped from the list');
  await p.screenshot({ path: path.join(out, 'settings-extensions.png') });
  await editTab(p, 'Widgets');
  for (const name of ['Notes', 'Countdown', 'Search box']) {
    ok(await settings(p).locator('.add-widget').getByRole('button', { name }).count() === 1, `Add a widget offers ${name}`);
  }
  const editor = settings(p).locator('.added-widget[data-added="find"]');
  ok(await editor.locator('select[data-field="added:find:engine"]').inputValue() === 'custom'
    && await editor.locator('input[type=checkbox][data-field="added:find:newTab"]').isChecked() === false, 'its settings, as the extension describes them');
  await editor.locator('select[data-field="added:find:engine"]').selectOption('wikipedia');
  await settings(p).getByRole('tab', { name: 'My view' }).click();
  ok(await settings(p).getByRole('radiogroup', { name: 'Background' }).locator('label', { hasText: 'Starfield' }).count() === 1, 'My view offers the Starfield background');
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:config')).data.widgets.added.find(w => w.id === 'find').options.engine) === 'wikipedia', 'a changed setting is saved');

  // ---- 2. safe mode ----
  p = await fresh();
  await p.goto(url + '?safe');
  await p.waitForTimeout(1200);
  ok(await p.locator('script[data-extension]').count() === 0, '?safe: no extension is loaded');
  ok(/safe mode/.test(await p.locator('[data-section="notes"]').textContent()), '?safe: their widgets say why they\'re empty');
  ok(/custom CSS, colours and extensions are off/.test(await p.locator('.toast').textContent()), '?safe: says so');

  // ---- 3. adding the examples in Settings, and the ready-made data widgets ----
  p = await fresh();
  await p.goto(site('plain', sample));
  await p.waitForTimeout(1000);
  await openSettings(p);
  await editTab(p, 'Widgets');
  ok(await settings(p).locator('.add-widget').getByRole('button', { name: 'Notes' }).count() === 0, 'without extensions, no extension widgets on offer');
  await settings(p).getByRole('button', { name: /Show data from a URL/ }).click();
  const menu = p.locator('#menu-data');
  // (it's kept out of sight for a moment as it opens, until it can grow out of its button)
  await menu.waitFor();
  ok(await menu.getByRole('button').count() === 5, 'data: your own address, and four ready-made ones');
  await p.screenshot({ path: path.join(out, 'data-presets.png') });
  await menu.getByRole('button', { name: /GitHub repository/ }).click();
  for (const name of ['Hacker News', 'Exchange rates', 'service']) {
    await settings(p).getByRole('button', { name: /Show data from a URL/ }).click();
    await p.locator('#menu-data').getByRole('button', { name: new RegExp(name) }).click();
  }
  ok(await settings(p).locator('.added-widget').count() === 4, 'four ready-made data widgets added');
  await editTab(p, 'Page');
  await openFold(p, 'extensions');
  for (const name of ['Notes', 'Countdown', 'Search box', 'Starfield']) await settings(p).locator('.example-card', { hasText: name }).click();
  ok(await settings(p).locator('.extension-row').count() === 4 && await settings(p).locator('.example-card:disabled').count() === 4, 'the four examples added, and marked as added');
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(1500);
  ok(await p.locator('script[data-extension]').count() === 4, 'saved: the examples load straight away');
  const page = p.locator('main');
  ok(/lit\/lit/.test(await page.textContent()) && /20,500/.test(await page.textContent()), 'GitHub repository: shows the stars');
  ok(/Show HN: a launch page/.test(await page.textContent()), 'Hacker News: shows the stories');
  ok(/€0\.921/.test(await page.textContent()), 'Exchange rates: shows the euro');
  ok(/All Systems Operational/.test(await page.textContent()) && /No open incidents/.test(await page.textContent()), 'service status: shows the status');
  await p.screenshot({ path: path.join(out, 'presets.png'), fullPage: true });
  await openSettings(p);
  await editTab(p, 'Widgets');
  ok(await settings(p).locator('.add-widget').getByRole('button', { name: 'Countdown' }).count() === 1, 'now Add a widget offers the examples\' widgets');
  await settings(p).locator('.add-widget').getByRole('button', { name: 'Countdown' }).click();
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-field')) === 'added:countdown-1:title', 'adding one puts you in its title');
  await settings(p).locator('[data-field="added:countdown-1:when"]').fill(inDays(3));
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(800);
  ok(/^3\s*days$/.test((await p.locator('[data-section="countdown-1"] .lp-countdown-big').textContent()).trim()), 'and it shows on the page');

  // ---- 4. a bad extension path, and someone else's file ----
  await openSettings(p);
  await editTab(p, 'Page');
  await openFold(p, 'extensions');
  await settings(p).getByRole('button', { name: 'Add a file' }).click();
  await settings(p).locator('[data-field="ext:4"]').fill('https://cdn.example.test/widget.js');
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-field')) === 'ext:4', 'an address won\'t save as an extension');
  await settings(p).getByRole('button', { name: 'Cancel' }).click();

  p = await fresh();
  await p.goto(site('plain2', sample));
  await p.waitForTimeout(900);
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  answer = false;
  messages.length = 0;
  await p.locator('.settings-file').setInputFiles({ name: 'theirs.config.js', mimeType: 'text/javascript', buffer: Buffer.from(withExtensions) });
  await p.waitForTimeout(400);
  ok(messages.some(m => /6 extensions to run \(extensions\/notes\.js/.test(m) && /run code/.test(m)), `opening a file with extensions asks first (${messages[0]?.split('\n')[0].slice(0, 120)}…)`);
  await editTab(p, 'Page');
  await openFold(p, 'extensions');
  ok(await settings(p).locator('.extension-row').count() === 0, 'Cancel leaves them out');
  answer = true;

  ok(!log.some(l => l.startsWith('[pageerror]') || l.startsWith('[console]')), 'no page errors');
  done();
});
