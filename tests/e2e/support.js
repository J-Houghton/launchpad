// tests/e2e/support.js
// What the page tests share. They drive the built page (dist/index.html) the way it's really used: opened
// straight from disk, with a launchpad.config.js beside it. `npm test` builds it first.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const DIST = path.join(ROOT, 'dist');
const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const RESULTS = path.join(ROOT, 'test-results');

/** The sample config the tests start from (a home page: four cards, no columns, no extensions). */
export const samplePath = path.join(FIXTURES, 'sample.config.js');
export const sample = fs.readFileSync(samplePath, 'utf8');
/** A version 3 config, as launchpad.config.js once was: old configs must keep loading. */
export const v3 = fs.readFileSync(path.join(FIXTURES, 'v3.config.js'), 'utf8');

/**
 * A maker of throwaway copies of the built page, for one test file: `site(name, configText, extra)` writes
 * index.html, the example extensions and that config into a folder of their own, and returns its file:// address.
 * `extra` is more files to put beside it ({ 'extensions/x.js': text }), or other HTML to use as index.html.
 */
export function sites(suite) {
  return (name, configText, extra = {}) => {
    const dir = path.join(RESULTS, 'sites', suite, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'extensions'), { recursive: true });
    if (typeof extra === 'string') fs.writeFileSync(path.join(dir, 'index.html'), extra);
    else fs.copyFileSync(path.join(DIST, 'index.html'), path.join(dir, 'index.html'));
    for (const f of fs.readdirSync(path.join(DIST, 'extensions'))) {
      fs.copyFileSync(path.join(DIST, 'extensions', f), path.join(dir, 'extensions', f));
    }
    if (typeof extra === 'object') for (const [f, text] of Object.entries(extra)) fs.writeFileSync(path.join(dir, f), text);
    if (configText) fs.writeFileSync(path.join(dir, 'launchpad.config.js'), configText);
    return pathToFileURL(path.join(dir, 'index.html')).href;
  };
}

/** Where a test file keeps the screenshots it takes along the way (test-results/shots/<suite>). */
export function shots(suite) {
  const dir = path.join(RESULTS, 'shots', suite);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * A test's checks. `ok(condition, what)` is a soft assertion, so one failure doesn't hide the checks after it;
 * `log` also takes the page's errors as '[pageerror] …' and '[console] …' lines, and `done()` fails the test if
 * there were any.
 */
export function checks() {
  const log = [];
  const ok = (condition, what) => {
    log.push(`${condition ? 'PASS' : 'FAIL'}  ${what}`);
    expect.soft(!!condition, what).toBe(true);
  };
  const done = () => expect.soft(log.filter(line => line.startsWith('[')), 'no page or console errors').toEqual([]);
  return { log, ok, done };
}

/**
 * Waits until the page has finished gliding to a new layout (a view transition). While one runs, the page is a
 * picture of itself and takes no pointer, so a drag begun too soon is lost.
 */
export const settled = page => page.waitForFunction(
  () => !document.getAnimations().some(a => (a.effect?.pseudoElement ?? '').startsWith('::view-transition')),
);

/** For `test.afterEach`: closes the contexts a test opened for itself. */
export async function closeContexts({ browser }) {
  for (const context of browser.contexts()) await context.close().catch(() => {});
}
