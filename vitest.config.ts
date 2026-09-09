import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// One test run for the whole repo: the design system's helpers in `src/` and
// the app's logic in `app/src/`. Tests sit next to what they test as
// `*.test.ts`; `tsconfig.build.json` already excludes them from the published
// package and `vite build` never reaches them, so nothing here ships.
//
// The alias mirrors app/vite.config.ts, so a test imports `@budget-app/ui`
// exactly as the app does and gets the live source rather than a stale dist/.
const ui = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@budget-app/ui/styles.css', replacement: ui('styles/index.css') },
      { find: '@budget-app/ui', replacement: ui('index.ts') },
    ],
  },
  test: {
    // Logic tests are pure functions over plain data and need no DOM, so the
    // default stays `node` - it is faster and catches an accidental reliance on
    // browser globals. Component tests opt in per file with the
    // `// @vitest-environment jsdom` docblock; jsdom is a dev dependency.
    // Keep the default as `node`: flipping it globally would hide that.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'app/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '.ds-sync/**', 'ds-bundle/**', '.design-sync/**'],
    // Dates are the app's most bug-prone material: several suites travel the
    // clock, so give every file a clean, restored timer state.
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'app/src/data/**', 'app/src/lib/**', 'app/src/sync/**', 'app/src/features/**/selectors.ts', 'app/src/features/**/dates.ts'],
    },
  },
});
