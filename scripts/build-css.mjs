#!/usr/bin/env node
// Builds dist/styles.css from src/styles/index.css by inlining its local
// `@import "./x.css";` lines (recursively, in order). No preprocessor — the
// stylesheet is plain CSS with custom properties, so concatenation is the
// whole build. Deterministic: same inputs → byte-identical output.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/styles/index.css');
const OUT = resolve(ROOT, 'dist/styles.css');

const seen = new Set();
function inline(file) {
  const abs = resolve(file);
  if (seen.has(abs)) return '';
  seen.add(abs);
  const css = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  return css.replace(/^@import\s+(?:url\()?["']([^"']+)["']\)?\s*;\s*$/gm, (line, spec) => {
    if (/^(https?:|data:)/.test(spec)) return line; // remote imports stay as-is
    const target = resolve(dirname(abs), spec);
    if (!existsSync(target)) throw new Error(`build-css: ${spec} (from ${abs}) not found`);
    return `/* ── ${spec} ── */\n${inline(target)}`;
  });
}

const out = `/* @budget-app/ui — built from src/styles/index.css; do not edit by hand */\n${inline(ENTRY)}`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`styles.css: ${(out.length / 1024).toFixed(1)} KB ← ${seen.size} source file(s)`);
