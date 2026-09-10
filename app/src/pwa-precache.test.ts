import { describe, expect, it } from 'vitest';
import { BUILD_PLACEHOLDER, PRECACHE_PLACEHOLDER, precacheManifest, rewriteServiceWorker } from './pwa-precache';

const files = [
  { path: 'assets\\index-abc123.js', content: 'console.log(1)' },
  { path: 'sw.js', content: 'worker' },
  { path: 'index.html', content: '<html>' },
  { path: 'icons/icon-192.png', content: new Uint8Array([1, 2, 3]) },
  { path: 'manifest.webmanifest', content: '{}' },
];

describe('precacheManifest', () => {
  it('lists every built file except the worker, sorted, with forward slashes', () => {
    expect(precacheManifest(files).list).toEqual(['assets/index-abc123.js', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest']);
  });

  it('names the build with a short hex id that ignores input order', () => {
    const { build } = precacheManifest(files);
    expect(build).toMatch(/^[0-9a-f]{12}$/);
    expect(precacheManifest([...files].reverse()).build).toBe(build);
  });

  it('changes the build id when a file with a stable name changes content', () => {
    const before = precacheManifest(files).build;
    const after = precacheManifest(files.map((f) => (f.path === 'index.html' ? { ...f, content: '<html lang="en">' } : f))).build;
    expect(after).not.toBe(before);
    expect(precacheManifest(files).list).toEqual(precacheManifest(files.map((f) => (f.path === 'index.html' ? { ...f, content: 'x' } : f))).list);
  });
});

describe('rewriteServiceWorker', () => {
  const source = `// comment\n${BUILD_PLACEHOLDER}\n${PRECACHE_PLACEHOLDER}\n\nconst CACHE = 'money-manager-' + BUILD;\n`;

  it('replaces both placeholder lines and leaves the rest alone', () => {
    const out = rewriteServiceWorker(source, { list: ['index.html', 'assets/a.js'], build: 'deadbeef0123' });
    expect(out).toBe(`// comment\nconst BUILD = "deadbeef0123";\nconst PRECACHE = ["index.html","assets/a.js"];\n\nconst CACHE = 'money-manager-' + BUILD;\n`);
    expect(out).not.toContain(BUILD_PLACEHOLDER);
    expect(out).not.toContain(PRECACHE_PLACEHOLDER);
  });

  it('fails the build loudly when a placeholder is missing', () => {
    expect(() => rewriteServiceWorker(source.replace(PRECACHE_PLACEHOLDER, 'const PRECACHE = ["x"];'), { list: [], build: 'a' })).toThrow(/PRECACHE/);
    expect(() => rewriteServiceWorker(source.replace(BUILD_PLACEHOLDER, "const BUILD = 'x';"), { list: [], build: 'a' })).toThrow(/BUILD/);
  });

  it('only matches the placeholder as a whole line', () => {
    const indented = source.replace(BUILD_PLACEHOLDER, `  ${BUILD_PLACEHOLDER}`);
    expect(() => rewriteServiceWorker(indented, { list: [], build: 'a' })).toThrow(/BUILD/);
  });
});
