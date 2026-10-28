import { defineConfig, type Plugin } from 'vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CONFIG_FILE = fileURLToPath(new URL('./public/launchpad.config.js', import.meta.url));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Loads launchpad.config.js before the app. It's a plain (non-module) script so it
 * also works when index.html is opened straight from disk, where fetch() can't read files.
 */
function configScript(): Plugin {
  return {
    name: 'launchpad-config-script',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'script', attrs: { src: './launchpad.config.js' }, injectTo: 'head' }],
    },
  };
}

/**
 * Build to one self-contained index.html (JS, CSS and fonts inlined): browsers refuse
 * to load module scripts and fonts from separate files over file://.
 */
function singleFile(): Plugin {
  return {
    name: 'launchpad-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') return;
      let html = String(page.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(new RegExp(`<script[^>]*src="[^"]*${escapeRe(file.fileName)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && file.fileName.endsWith('.css')) {
          html = html.replace(new RegExp(`<link[^>]*href="[^"]*${escapeRe(file.fileName)}"[^>]*>`), () => `<style>${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      page.source = html;
    },
  };
}

/**
 * Dev-server only: lets the in-page settings save straight to public/launchpad.config.js.
 * (In a built copy, settings save through the browser's file picker or a download instead.)
 */
function saveConfigFile(): Plugin {
  return {
    name: 'launchpad-save-config',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__launchpad/config', (req, res) => {
        const reply = (status: number, message = '') => { res.statusCode = status; res.end(message); };

        // only same-origin PUTs from the page itself
        const origin = req.headers.origin;
        if (req.method !== 'PUT') return reply(405, 'Use PUT');
        if (origin && new URL(origin).host !== req.headers.host) return reply(403, 'Cross-origin request refused');

        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 2_000_000) req.destroy();
        });
        req.on('end', async () => {
          try {
            const json = body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1);
            const data = JSON.parse(json);
            if (!body.includes('window.LAUNCHPAD_CONFIG') || typeof data !== 'object' || !Array.isArray(data.apps)) {
              return reply(400, 'That doesn\'t look like a launchpad config');
            }
            await writeFile(CONFIG_FILE, body, 'utf8');
            reply(204);
          } catch (err) {
            reply(400, (err as Error).message);
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './', // relative paths, so the build works from any folder (or file://)
  build: {
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
  },
  plugins: [configScript(), singleFile(), saveConfigFile()],
});
