// Build-time helper behind the pwa-precache plugin in ../vite.config.ts: works out
// what the service worker precaches and rewrites its placeholder lines. It lives
// under src/ only so the app's tsconfig, lint and test globs cover it - nothing in
// the app imports it (it needs node:crypto), and Vite never bundles it.
import { createHash } from 'node:crypto';

/** One built file: its path relative to the output directory and its bytes. */
export interface BuiltFile {
  path: string;
  content: Uint8Array | string;
}

/** The lines app/public/sw.js ships with; both must survive until the build rewrites them. */
export const BUILD_PLACEHOLDER = "const BUILD = 'dev';";
export const PRECACHE_PLACEHOLDER = 'const PRECACHE = [];';

/** How many hex characters of the digest name the cache. */
const BUILD_ID_LENGTH = 12;

/**
 * The worker's precache list (sorted, forward slashes, without the worker
 * itself) and a short id for the build. The id covers file contents as well as
 * names, so a build that changes only index.html or the manifest - files whose
 * names never carry a hash - still gets a fresh cache.
 */
export function precacheManifest(files: BuiltFile[]): { list: string[]; build: string } {
  const sorted = files
    .map((file) => ({ ...file, path: file.path.replace(/\\/g, '/') }))
    .filter((file) => file.path !== 'sw.js')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const file of sorted) {
    hash.update(file.path + '\n');
    hash.update(file.content);
    hash.update('\n');
  }
  return { list: sorted.map((file) => file.path), build: hash.digest('hex').slice(0, BUILD_ID_LENGTH) };
}

/** Fills the worker's two placeholder lines in; throws when either is missing so a build never ships a worker that caches nothing. */
export function rewriteServiceWorker(source: string, manifest: { list: string[]; build: string }): string {
  for (const placeholder of [BUILD_PLACEHOLDER, PRECACHE_PLACEHOLDER]) {
    if (!hasLine(source, placeholder)) throw new Error(`pwa-precache: sw.js is missing the placeholder line "${placeholder}"`);
  }
  return source
    .replace(lineOf(BUILD_PLACEHOLDER), `const BUILD = ${JSON.stringify(manifest.build)};`)
    .replace(lineOf(PRECACHE_PLACEHOLDER), `const PRECACHE = ${JSON.stringify(manifest.list)};`);
}

const hasLine = (source: string, line: string) => lineOf(line).test(source);
const lineOf = (line: string) => new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm');
