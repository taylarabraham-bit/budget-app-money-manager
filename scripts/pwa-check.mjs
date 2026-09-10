// End-to-end check of the installable, offline-capable build: serves app/dist the
// way GitHub Pages will (under the repo base path), lets the service worker install
// and precache the shell, then pulls the network and proves the app still opens.
//
// It builds nothing. Build first, with credentials stripped and the Pages base:
//
//   BASE_PATH=/budget-app-money-manager/ npm run app:build:uitest
//   npm run pwa-check
//
// (Git Bash on Windows rewrites a leading-slash value into a Windows path; prefix
// the build with MSYS_NO_PATHCONV=1 there. PowerShell needs no such thing.)
//
// Checks, in order - a failed gate skips what depends on it:
//   dist        app/dist/sw.js exists, its placeholders were rewritten, index.html was built for the base
//   render      the app shell (bottom nav or sidebar) appears on first load, no request failed
//   worker      navigator.serviceWorker.ready resolves with the base as its scope
//   precache    the worker's cache holds the shell (scope + index.html) and the main script
//   manifest    the manifest link resolves, names "Money Manager", and its three icons all load
//   icon        the apple-touch-icon loads
//   offline     with the network cut, a reload and a fresh navigation both render the app,
//               and an uncached fetch fails (so the network really was cut)
//   sw.js       the served worker lists index.html, every assets/* file, the manifest and the icons
//
// The preview keeps Vite's default CORS allow-list, so every response carries
// `Vary: Origin` - the same as `npm run preview:uitest` and any CORS-enabled static
// host, and stricter than GitHub Pages (`Vary: Accept-Encoding`). The worker has to
// survive that too, or "offline" only works on hosts that happen to omit Vary.
//
// Flags: --base </path/>  (default /budget-app-money-manager/; must match the build)
//        --port <n>        (default 4175, bound to 127.0.0.1)
//
// Exit code 1 if any check fails, so this can gate a deploy.

import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const loadPlaywright = () => {
  for (const from of ['playwright', '../.ds-sync/node_modules/playwright']) {
    try {
      return require(from);
    } catch {
      // try the next location
    }
  }
  throw new Error('Playwright not found. Run `npm ci`, then `npx playwright install chromium`.');
};
const { chromium } = loadPlaywright();

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', '/budget-app-money-manager/');
const PORT = Number(arg('port', '4175'));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const DIST = path.join(APP, 'dist');
const ORIGIN = `http://127.0.0.1:${PORT}`;
const URL_ = ORIGIN + BASE;

// The lines public/sw.js ships with; the build replaces both (see app/src/pwa-precache.ts).
const BUILD_PLACEHOLDER = "const BUILD = 'dev';";
const PRECACHE_PLACEHOLDER = 'const PRECACHE = [];';

// ---- reporting ----

const results = [];
const report = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + detail : ''}`);
  return ok;
};
const skip = (name, why) => {
  results.push({ name, ok: null, detail: why });
  console.log(`[SKIP] ${name} - ${why}`);
};
/** Runs a check; an exception is a failure with the error as its detail. */
const check = async (name, fn) => {
  try {
    const detail = await fn();
    return report(name, true, typeof detail === 'string' ? detail : '');
  } catch (e) {
    return report(name, false, String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300));
  }
};
const fail = (message) => {
  throw new Error(message);
};

// ---- the built output ----

/** Every file under `dir`, relative to it with forward slashes. */
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

/** The PRECACHE list and BUILD id out of a (rewritten) sw.js source. */
function parseWorker(source) {
  const list = /^const PRECACHE = (\[.*\]);$/m.exec(source);
  const build = /^const BUILD = "([^"]+)";$/m.exec(source);
  if (!list || !build) fail('sw.js has no rewritten PRECACHE / BUILD lines');
  return { list: JSON.parse(list[1]), build: build[1] };
}

const distFiles = existsSync(DIST) ? walk(DIST) : [];
const swPath = path.join(DIST, 'sw.js');
if (!existsSync(swPath)) {
  console.error(`No built worker at app/dist/sw.js. Build first:\n  BASE_PATH=${BASE} npm run app:build:uitest`);
  process.exit(1);
}
const swSource = readFileSync(swPath, 'utf8');
if (swSource.includes(BUILD_PLACEHOLDER) || swSource.includes(PRECACHE_PLACEHOLDER)) {
  console.error('app/dist/sw.js still has its dev placeholders (BUILD/PRECACHE), so it caches nothing.\nThe pwa-precache plugin in app/vite.config.ts did not run; rebuild:\n  BASE_PATH=' + BASE + ' npm run app:build:uitest');
  process.exit(1);
}
const built = parseWorker(swSource);
const indexHtml = readFileSync(path.join(DIST, 'index.html'), 'utf8');
const mainScript = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(indexHtml)?.[1] ?? '';

report('dist: sw.js rewritten by the build', true, `build ${built.build}, ${built.list.length} precached files`);
report('dist: index.html built for base ' + BASE, mainScript.startsWith(BASE), mainScript ? `main script is ${mainScript}` : 'no module script tag in index.html');

// ---- serve it as Pages would ----

process.env.BASE_PATH = BASE;
const { preview } = await import('vite');
let server = null;
let browser = null;

const closeServer = async () => {
  if (!server) return;
  const s = server;
  server = null;
  s.httpServer.closeAllConnections?.();
  await s.close();
};

const ok = async (url) => {
  const res = await fetch(url);
  if (res.status !== 200) fail(`${url} returned ${res.status}`);
  return res;
};

/** Runs in the page. Resolves with the worker's scope once one is active, or null after a wait. */
const SW_READY = `Promise.race([
  navigator.serviceWorker.ready.then((r) => ({ scope: r.scope, state: r.active ? r.active.state : null })),
  new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
])`;

/** Runs in the page. Every cache and the URLs it holds. */
const CACHE_CONTENTS = `(async () => {
  const out = {};
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    out[name] = (await cache.keys()).map((r) => r.url);
  }
  return out;
})()`;

const APP_SHELL = `!!document.querySelector('.bdg-bottom-nav, .app-side')`;
const TITLE = `document.querySelector('.bdg-page-header__title')?.textContent?.trim() ?? null`;
const LINK_HREF = (rel) => `document.querySelector('link[rel="${rel}"]')?.href ?? null`;

/** Fresh context: welcome sheet already seen, light theme, a phone viewport so the bottom nav shows. */
const INIT = `try {
  localStorage.setItem('budget-app.welcome.v1', JSON.stringify({ version: 1, dismissedAt: new Date(0).toISOString() }));
  localStorage.setItem('budget-app.settings.v1', JSON.stringify({ theme: 'light' }));
} catch (e) {}`;

try {
  server = await preview({
    configFile: path.join(APP, 'vite.config.ts'),
    root: APP,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: PORT, strictPort: true, open: false },
  });

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();

  // Same-origin trouble only: the sync server and fonts are the network's business, not the shell's.
  let failed = [];
  page.on('requestfailed', (r) => {
    if (r.url().startsWith(ORIGIN) && !r.url().includes('pwa-check-uncached')) failed.push(`${r.url().slice(ORIGIN.length)} (${r.failure()?.errorText ?? 'failed'})`);
  });
  page.on('response', (r) => {
    if (r.url().startsWith(ORIGIN) && r.status() >= 400) failed.push(`${r.url().slice(ORIGIN.length)} (HTTP ${r.status()})`);
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]));

  const waitForShell = async () => {
    await page.waitForSelector('.bdg-bottom-nav, .app-side', { timeout: 15000 }).catch(() => undefined);
    if (!(await page.evaluate(APP_SHELL))) {
      fail(`app shell not rendered (title: ${JSON.stringify(await page.evaluate(TITLE))}; failed requests: ${failed.join(', ') || 'none'}; page errors: ${pageErrors.join('; ') || 'none'})`);
    }
    if (failed.length) fail(`request(s) failed: ${failed.join(', ')}`);
    return `title "${await page.evaluate(TITLE)}"`;
  };

  // ---- first load ----
  await page.goto(URL_, { waitUntil: 'load' });
  const rendered = await check('render: app shell on first load at ' + BASE, waitForShell);

  // Vite's preview answers like a CORS-enabled static host: its default allow-list
  // is a pattern, so the `cors` middleware adds `Vary: Origin` to every response.
  // That is stricter than GitHub Pages (`Vary: Accept-Encoding`) and deliberately
  // kept: a worker whose cache lookups honour Vary misses the page's own
  // crossorigin script and stylesheet requests, which carry an Origin header the
  // precached entries were stored without - and the "offline" checks then fail.
  await check('serve: main script served with the headers the worker will cache', async () => {
    const res = await ok(new URL(mainScript, URL_).href);
    const vary = res.headers.get('vary');
    return `content-type ${res.headers.get('content-type')}; vary ${vary ? JSON.stringify(vary) : 'absent'}`;
  });

  const ready = await check('worker: navigator.serviceWorker.ready with scope ' + BASE, async () => {
    const reg = await page.evaluate(SW_READY);
    if (!reg) fail('no active worker after 15s (is the build registering ' + BASE + 'sw.js?)');
    if (reg.scope !== URL_) fail(`scope is ${reg.scope}, expected ${URL_}`);
    return `state ${reg.state}`;
  });

  const cacheName = 'money-manager-' + built.build;
  const precached = ready
    ? await check('precache: shell and main script cached by the worker', async () => {
        const want = [URL_, URL_ + 'index.html', new URL(mainScript, URL_).href];
        let contents = {};
        for (let i = 0; i < 40; i++) {
          contents = await page.evaluate(CACHE_CONTENTS);
          const urls = contents[cacheName] ?? [];
          if (want.every((u) => urls.includes(u))) return `${urls.length} entries in ${cacheName}`;
          await page.waitForTimeout(500);
        }
        const names = Object.keys(contents);
        if (!names.includes(cacheName)) fail(`no cache named ${cacheName} after 20s (have: ${names.join(', ') || 'none'})`);
        fail(`missing after 20s: ${want.filter((u) => !(contents[cacheName] ?? []).includes(u)).join(', ')}`);
      })
    : (skip('precache: shell and main script cached by the worker', 'no worker'), false);

  // ---- manifest and icons, fetched from Node so the worker is not in the way ----
  await check('manifest: link resolves, name "Money Manager", three icons that load', async () => {
    const href = await page.evaluate(LINK_HREF('manifest'));
    if (!href) fail('no <link rel="manifest"> in the page');
    const res = await ok(href);
    const manifest = await res.json();
    if (manifest.name !== 'Money Manager') fail(`name is ${JSON.stringify(manifest.name)}`);
    if (manifest.short_name !== 'Money Manager') fail(`short_name is ${JSON.stringify(manifest.short_name)}`);
    if (!Array.isArray(manifest.icons) || manifest.icons.length !== 3) fail(`expected 3 icons, got ${manifest.icons?.length ?? 'none'}`);
    for (const icon of manifest.icons) {
      const url = new URL(icon.src, href).href;
      const r = await ok(url);
      if (!/image\/png/.test(r.headers.get('content-type') ?? '')) fail(`${icon.src} is ${r.headers.get('content-type')}, not image/png`);
    }
    return `${href.slice(ORIGIN.length)}; icons ${manifest.icons.map((i) => i.sizes + (i.purpose === 'maskable' ? ' maskable' : '')).join(', ')}`;
  });

  await check('icon: apple-touch-icon loads', async () => {
    const href = await page.evaluate(LINK_HREF('apple-touch-icon'));
    if (!href) fail('no <link rel="apple-touch-icon"> in the page');
    await ok(href);
    return href.slice(ORIGIN.length);
  });

  // ---- offline ----
  if (rendered && precached) {
    await ctx.setOffline(true);
    failed = [];
    await check('offline: reload renders the app from the cache', async () => {
      await page.reload({ waitUntil: 'load' });
      return waitForShell();
    });
    await check('offline: the network really is cut (an uncached fetch fails)', async () => {
      const outcome = await page.evaluate(`fetch(${JSON.stringify(URL_ + 'pwa-check-uncached-' + Date.now())}).then((r) => 'HTTP ' + r.status, (e) => 'rejected: ' + e.message)`);
      if (!outcome.startsWith('rejected')) fail(`uncached fetch got ${outcome} while offline`);
      return outcome;
    });
    failed = [];
    await check('offline: a fresh navigation to ' + BASE + ' renders the app', async () => {
      await page.goto(URL_, { waitUntil: 'load' });
      return waitForShell();
    });
    await ctx.setOffline(false);
  } else {
    skip('offline: reload renders the app from the cache', 'first load or precache failed');
    skip('offline: a fresh navigation renders the app', 'first load or precache failed');
  }

  // ---- the served worker lists the whole build ----
  await check('sw.js: served worker precaches index.html and every assets/* file', async () => {
    const res = await ok(URL_ + 'sw.js');
    const served = parseWorker(await res.text());
    if (served.build !== built.build) fail(`served build ${served.build} differs from app/dist (${built.build})`);
    const need = ['index.html', 'manifest.webmanifest', ...distFiles.filter((f) => f.startsWith('assets/') || f.startsWith('icons/'))];
    const missing = need.filter((f) => !served.list.includes(f));
    if (missing.length) fail(`missing from PRECACHE: ${missing.join(', ')}`);
    if (served.list.includes('sw.js')) fail('PRECACHE lists sw.js itself');
    return `${need.length} files present`;
  });

  await ctx.close();
} catch (e) {
  report('run', false, String(e && e.stack ? e.stack : e).split('\n').slice(0, 2).join(' '));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await closeServer().catch(() => undefined);
}

const failures = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${results.length - failures.length - skipped.length} of ${results.length} checks passed${failures.length ? `, ${failures.length} failed` : ''}${skipped.length ? `, ${skipped.length} skipped` : ''}.`);
if (failures.length > 0) process.exitCode = 1;
