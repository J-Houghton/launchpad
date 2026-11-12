// tests/e2e/widgets.spec.js
// Added widgets: embeds and data. Requests to the made-up hosts below are answered by the test (page.route), offline.
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { checks, closeContexts, sample, shots, sites } from './support.js';

const out = shots('widgets');
const site = sites('widgets');

test.afterEach(closeContexts);

const ADDED = '"weather": { "place": "London, England", "latitude": 51.5085, "longitude": -0.1257, "units": "celsius" }';
if (!sample.includes(ADDED)) throw new Error('sample weather line changed');
const withWidgets = sample.replace(ADDED, `${ADDED},
    "added": [
      { "id": "builds", "type": "data", "title": "Builds", "url": "https://data.example.test/builds.json", "refresh": 5, "template": [
        "<ul class=\\"data-list\\">{{#builds}}<li class=\\"build\\"><a href=\\"{{link}}\\" onclick=\\"alert(1)\\">{{name}}</a> <small>{{finished | ago}}</small></li>{{/builds}}</ul>",
        "{{^builds}}<p>No builds</p>{{/builds}}<script>window.__ran = true</script><img src=x onerror=\\"window.__ran = true\\">"
      ] },
      { "id": "status", "type": "embed", "title": "Status", "url": "https://embed.example.test/status", "height": 240 }
    ]`);
const hour = 3600_000;
const BUILDS = {
  builds: [
    { name: 'main #412', link: 'https://ci.example.test/412', finished: new Date(Date.now() - 2 * hour).toISOString() },
    { name: '<img src=x onerror="window.__ran=true">', link: 'javascript:alert(1)', finished: Date.now() - 60_000 },
  ],
};


test('added widgets: embeds and data', async ({ browser: b }) => {
  const { log, ok, done } = checks();
  let answer = true;
  const messages = [];
  let dataHits = 0;
  let dataStatus = 200;
  const fresh = async () => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    await ctx.route('https://data.example.test/**', route => {
      dataHits++;
      return route.fulfill({ status: dataStatus, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(BUILDS) });
    });
    await ctx.route('https://embed.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1 style="font:16px sans-serif">All systems normal</h1>' }));
    await ctx.route('https://api.github.com/**', route => route.fulfill({
      contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{ name: 'lit@3.3.1', html_url: 'https://github.com/lit/lit/releases/1', published_at: new Date(Date.now() - 3 * 86400_000).toISOString() }]),
    }));
    const p = await ctx.newPage();
    p.on('pageerror', e => log.push('[pageerror] ' + e.message));
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|open-meteo|ERR_/.test(m.text()) && log.push('[console] ' + m.text()));
    p.on('dialog', d => { messages.push(d.message()); answer ? d.accept() : d.dismiss(); });
    return p;
  };
  const settings = p => p.locator('dialog.settings:not(.setup)');
  const openSettings = async p => { await p.keyboard.press('Control+,'); await p.waitForTimeout(350); };
  const widgetsTab = async p => {
    await settings(p).getByRole('tab', { name: 'Edit page' }).click();
    await settings(p).getByRole('tab', { name: 'Widgets', exact: true }).click();
    await p.waitForTimeout(250);
  };

  // ---- 1. from the config file ----
  let p = await fresh();
  const url = site('widgets', withWidgets);
  await p.goto(url);
  await p.waitForTimeout(1500);
  const data = p.locator('[data-section="builds"] data-widget');
  ok(await data.count() === 1 && await p.locator('[data-section="status"] embed-widget').count() === 1, 'both widgets are sections on the page');
  const order = await p.locator('.page > [data-section]').evaluateAll(els => els.map(e => e.dataset.section));
  ok(order.indexOf('builds') < order.indexOf('cards') && order.indexOf('status') < order.indexOf('cards'), `left out of the layout, they go just before the cards (${order.join(', ')})`);
  ok(await data.locator('.widget-title').textContent() === 'Builds', 'data widget: its title');
  ok(await data.locator('li.build').count() === 2, 'data widget: a row per build, class kept');
  const first = data.locator('li.build a').first();
  ok(await first.textContent() === 'main #412' && await first.getAttribute('href') === 'https://ci.example.test/412'
    && await first.getAttribute('target') === '_blank' && await first.getAttribute('rel') === 'noopener noreferrer', 'links: the address, opened in a new tab');
  ok(await first.getAttribute('onclick') === null, 'event attributes are dropped');
  ok(/2 hours ago/.test(await data.locator('li.build small').first().textContent()), `| ago: "${await data.locator('li.build small').first().textContent()}"`);
  ok(await data.locator('li.build a').nth(1).getAttribute('href') === null, 'a javascript: link loses its address');
  ok((await data.locator('li.build a').nth(1).textContent()).includes('<img'), 'markup inside the data shows as text');
  ok(await data.locator('script, img').count() === 0 && !(await p.evaluate(() => window.__ran)), 'scripts and images with handlers never make it in, or run');
  ok(await data.locator('p', { hasText: 'No builds' }).count() === 0, '{{^builds}} hidden when there are builds');
  const frame = p.locator('[data-section="status"] iframe.embed-frame');
  ok(await frame.getAttribute('sandbox') === 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox', 'embed: sandboxed');
  ok(await frame.evaluate(f => f.getBoundingClientRect().height) === 240, 'embed: its height');
  ok(/All systems normal/.test(await p.frameLocator('[data-section="status"] iframe').locator('h1').textContent()), 'embed: the page shows in it');
  ok(await p.locator('[data-section="status"] .widget-open').getAttribute('href') === 'https://embed.example.test/status', 'embed: a link to open it in a tab');
  await p.screenshot({ path: path.join(out, 'widgets.png') });

  const before = dataHits;
  await data.getByRole('button', { name: 'Refresh' }).click();
  await p.waitForTimeout(500);
  ok(dataHits === before + 1, 'Refresh fetches it again');
  dataStatus = 503;
  await data.getByRole('button', { name: 'Refresh' }).click();
  await p.waitForTimeout(500);
  ok(/Couldn't load it: the server answered 503/.test(await data.locator('.data-error').textContent()) && await data.locator('li.build').count() === 2,
    'a failed refresh says why, and keeps the last data');
  dataStatus = 200;

  // in the layout, like any section
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('tab', { name: 'Layout', exact: true }).click();
  ok(await settings(p).locator('.section-row', { hasText: 'Builds' }).count() === 1 && await settings(p).locator('.section-row', { hasText: 'Status' }).count() === 1, 'Layout lists them by title');
  await settings(p).getByRole('button', { name: 'Arrange on the page' }).click();
  await p.waitForTimeout(700);
  ok(await p.locator('[data-section="builds"] > .arrange-tools .arrange-name').textContent() === 'Builds', 'Arrange: a toolbar named for it');
  await p.locator('[data-section="status"] > .arrange-tools').getByRole('button', { name: /^Hide/ }).click();
  await p.waitForTimeout(400);
  ok(await p.locator('.arrange-chip', { hasText: 'Status' }).count() === 1, 'hidden, it\'s offered back by name');
  await p.locator('.arrange-bar').getByRole('button', { name: 'Cancel' }).click();
  await p.waitForTimeout(400);

  // ---- 2. adding one in Settings ----
  p = await fresh();
  await p.goto(site('sample', sample));
  await p.waitForTimeout(1000);
  await openSettings(p);
  await widgetsTab(p);
  await settings(p).getByRole('button', { name: /Show data from a URL/ }).click();
  await p.locator('#menu-data').getByRole('button', { name: /Your own address/ }).click();
  await p.waitForTimeout(300);
  const editor = settings(p).locator('.added-widget').last();
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-field')) === 'added:data-1:url', 'adding one puts you in its address');
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-field')) === 'added:data-1:url', 'saving without an address points at it');
  await editor.getByRole('textbox', { name: /Address/ }).fill('https://data.example.test/builds.json');
  await editor.getByRole('textbox', { name: /Title/ }).fill('Latest builds');
  await editor.getByRole('button', { name: 'Try it' }).click();
  await p.waitForTimeout(500);
  ok((await editor.locator('.data-preview pre.data-raw').textContent()).includes('main #412'), 'Try it, with no template: the data as it comes');
  await editor.getByRole('textbox', { name: 'Template' }).fill('<ol>{{#builds}}<li>{{name}}</li>{{/builds}}</ol>');
  await p.waitForTimeout(200);
  ok(await editor.locator('.data-preview li').count() === 2, 'the preview follows the template as you type');
  await editor.getByRole('textbox', { name: 'Template' }).fill('{{#builds}}<li>{{name}}</li>');
  await p.waitForTimeout(200);
  ok(/never closed/.test(await editor.locator('.data-preview').textContent()), 'a broken template says what\'s wrong');
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-field')) === 'added:data-1:template', 'saving a broken template points at it');
  await editor.getByRole('textbox', { name: 'Template' }).fill('<ol class="mine">\n{{#builds}}<li>{{name}}</li>{{/builds}}\n</ol>');
  await p.screenshot({ path: path.join(out, 'settings-data.png') });
  await settings(p).getByRole('button', { name: /Embed a page/ }).click();
  await settings(p).locator('.added-widget').last().getByRole('textbox', { name: /Address/ }).fill('https://embed.example.test/status');
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(1200);
  ok(await p.locator('[data-section="data-1"] ol.mine li').count() === 2, 'saved: the data widget is on the page');
  ok(await p.locator('[data-section="embed-1"] iframe').count() === 1, 'saved: so is the embed');
  const order2 = await p.locator('.page > [data-section]').evaluateAll(els => els.map(e => e.dataset.section));
  ok(order2.indexOf('data-1') === order2.indexOf('cards') - 2 && order2.indexOf('embed-1') === order2.indexOf('cards') - 1, `added just before the cards (${order2.join(', ')})`);
  // written to the file with the template one line per entry
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('button', { name: /^File/ }).click();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#menu-file').getByRole('button', { name: /Download a copy/ }).click()]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  ok(/"template": \[\n\s+"<ol class=\\"mine\\">",/.test(text), 'the file lists a template one line per entry');
  // removing it takes it off the layout too
  await settings(p).getByRole('tab', { name: 'Widgets', exact: true }).click();
  await settings(p).locator('.added-widget', { hasText: 'Embed' }).getByRole('button', { name: /^Remove/ }).click();
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(600);
  ok(await p.locator('[data-section="embed-1"]').count() === 0, 'removed: gone from the page');
  ok(!(await p.evaluate(() => JSON.parse(localStorage.getItem('launchpad:config')).data.layout.sections.some(s => s.id === 'embed-1'))), '…and from the layout');

  // ---- 3. opening someone else's file asks about their widgets ----
  p = await fresh();
  await p.goto(site('sample2', sample));
  await p.waitForTimeout(900);
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  answer = false;
  messages.length = 0;
  await p.locator('.settings-file').setInputFiles({ name: 'theirs.config.js', mimeType: 'text/javascript', buffer: Buffer.from(withWidgets) });
  await p.waitForTimeout(400);
  ok(messages.some(m => /2 widgets showing data\.example\.test, embed\.example\.test/.test(m) && /trust/.test(m)), `asks first, naming the sites (${messages[0]?.split('\n')[0]})`);
  await widgetsTab(p);
  ok(await settings(p).locator('.added-widget').count() === 0, 'Cancel loads it without them');
  await settings(p).getByRole('tab', { name: 'Layout', exact: true }).click();
  ok(await settings(p).locator('.section-row').count() === 6, '…and without their places in the layout');
  answer = true;

  // ---- 4. the launch example's releases ----
  p = await fresh();
  await p.goto(site('sample3', sample));
  await p.waitForTimeout(900);
  await openSettings(p);
  await settings(p).getByRole('tab', { name: 'Edit page' }).click();
  await settings(p).getByRole('button', { name: /^File/ }).click();
  await p.locator('#menu-file').getByRole('button', { name: /Launch page/ }).click();
  await settings(p).getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(1500);
  const rel = p.locator('[data-section="releases"]');
  ok(/lit@3\.3\.1/.test(await rel.textContent()) && /3 days ago/.test(await rel.textContent()), 'launch example: latest releases');
  await p.screenshot({ path: path.join(out, 'launch-releases.png') });

  ok(!log.some(l => l.startsWith('[pageerror]') || l.startsWith('[console]')), 'no page errors');
  done();
});
