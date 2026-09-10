/* global Image, document */
// PWA icon generator: renders the web-install icons from the master artwork.
//
// The repo has no image library (sharp is not a dependency) but it does have
// Playwright with Chromium, for scripts/ui-audit.mjs. So this script opens a
// blank page in headless Chromium, draws app/assets/icon-only.png (1024x1024)
// onto canvases and exports each one with canvas.toDataURL('image/png').
//
//   npm run pwa-icons
//
// Output (app/public/icons/, referenced from app/public/manifest.webmanifest
// and app/index.html - all four are committed, so this only needs re-running
// when the master artwork changes):
//   icon-192.png             purpose "any"      the master, scaled
//   icon-512.png             purpose "any"      the master, scaled
//   maskable-512.png         purpose "maskable" artwork at 80% on the app
//                            background, so a circle/squircle mask keeps the
//                            whole wallet inside the safe zone
//   apple-touch-icon-180.png iOS home screen    opaque, artwork at 85% on the
//                            app background (iOS rounds the corners itself)
//
// Each file is checked after writing: the PNG IHDR must carry the requested
// size and the file must stay small enough to sit in the install prompt's
// critical path. The exit code is 1 if any check fails.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const master = `${root}app/assets/icon-only.png`;
const outDir = `${root}app/public/icons/`;

// --bdg-color-bg (light) in src/styles/tokens.css and background_color/theme_color in the manifest.
const APP_BG = '#f6f6f3';
const MAX_BYTES = 150 * 1024;

// scale: artwork edge as a fraction of the canvas. background: null keeps the
// master's own pixels edge to edge; a colour paints a plate behind the scaled
// artwork. radius: corner rounding of the scaled artwork as a fraction of its
// edge (the plate variants get a rounded tile, like the Android launcher draws).
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 1, background: null, radius: 0 },
  { file: 'icon-512.png', size: 512, scale: 1, background: null, radius: 0 },
  { file: 'maskable-512.png', size: 512, scale: 0.8, background: APP_BG, radius: 0.22 },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 0.85, background: APP_BG, radius: 0.22 },
];

// Runs inside the page. Returns the PNG as a data URL.
const render = async ({ src, size, scale, background, radius }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }
  const edge = Math.round(size * scale);
  const offset = Math.round((size - edge) / 2);
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(offset, offset, edge, edge, edge * radius);
    ctx.clip();
  }
  ctx.drawImage(img, offset, offset, edge, edge);
  return canvas.toDataURL('image/png');
};

// PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
const pngSize = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

const main = async () => {
  const src = `data:image/png;base64,${readFileSync(master).toString('base64')}`;
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  let failed = false;
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>pwa-icons</title>');
    for (const icon of ICONS) {
      const dataUrl = await page.evaluate(render, { src, ...icon });
      const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      writeFileSync(outDir + icon.file, bytes);

      const { width, height } = pngSize(bytes);
      const problems = [];
      if (width !== icon.size || height !== icon.size) problems.push(`expected ${icon.size}x${icon.size}, got ${width}x${height}`);
      if (bytes.length > MAX_BYTES) problems.push(`${bytes.length} bytes exceeds ${MAX_BYTES}`);
      if (problems.length) failed = true;
      console.log(
        `${problems.length ? 'FAIL' : 'ok  '} icons/${icon.file.padEnd(26)} ${width}x${height}  ${(bytes.length / 1024).toFixed(1).padStart(6)} KB${
          problems.length ? '  ' + problems.join('; ') : ''
        }`,
      );
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exitCode = 1;
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
