import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { precacheManifest, rewriteServiceWorker, type BuiltFile } from './src/pwa-precache';

// The app consumes the design system straight from ../src so library edits
// hot-reload here; the published package (dist/) is what other consumers get.
const ui = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

// After a build, fill the service worker's placeholder lines (see public/sw.js)
// with the list of built files and a hash of them, so the installed PWA can
// precache the whole app shell. Runs for builds only; in dev the placeholders
// stay and the worker caches nothing.
function pwaPrecache(): Plugin {
  let outDir = '';
  return {
    name: 'pwa-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files: BuiltFile[] = [];
      for (const relative of await walk(outDir)) files.push({ path: relative, content: await readFile(path.join(outDir, relative)) });
      const swPath = path.join(outDir, 'sw.js');
      await writeFile(swPath, rewriteServiceWorker(await readFile(swPath, 'utf8'), precacheManifest(files)));
    },
  };
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
async function walk(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), relative)));
    else out.push(relative);
  }
  return out;
}

export default defineConfig({
  // CI sets BASE_PATH=/<repo>/ for the GitHub Pages build only; everything else is served from the root.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), pwaPrecache()],
  resolve: {
    alias: [
      { find: '@budget-app/ui/styles.css', replacement: ui('styles/index.css') },
      { find: '@budget-app/ui', replacement: ui('index.ts') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  // The dev server is also reachable on the tailnet through `tailscale serve`
  // (http://<pc>.<tailnet>.ts.net, printed by scripts/demo.mjs) so phones can run the app live with no build;
  // Vite rejects unknown Host headers unless the MagicDNS domain is allowed.
  server: { open: false, allowedHosts: ['.ts.net'] },
});
