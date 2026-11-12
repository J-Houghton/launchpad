// playwright.config.js
// The page tests (tests/e2e): a real browser driving the built page. Run them with `npm run test:e2e`, which
// builds the page first.
//
// Liquid glass is only drawn by Chromium browsers, so the main run uses one: Edge on Windows (it's already
// there), Playwright's own Chromium elsewhere, or whichever LAUNCHPAD_BROWSER names (msedge, chrome, chromium).
// The Firefox tests (*.firefox.spec.js) need `npx playwright install firefox` once.
import { defineConfig } from '@playwright/test';

const channel = process.env.LAUNCHPAD_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium');

export default defineConfig({
  testDir: 'tests/e2e',
  // a file is one long walk through a feature, with pauses for its animations
  timeout: 300_000,
  // the checks time animations, and a busy machine throws them off: two files at a time
  workers: 2,
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      testIgnore: /\.firefox\.spec\.js$/,
      use: { browserName: 'chromium', ...(channel === 'chromium' ? {} : { channel }) },
    },
    { name: 'firefox', testMatch: /\.firefox\.spec\.js$/, use: { browserName: 'firefox' } },
  ],
  // glass.spec.js reads each lens through the source modules, so it runs against the dev server
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    url: 'http://localhost:5179/',
    reuseExistingServer: true,
  },
});
