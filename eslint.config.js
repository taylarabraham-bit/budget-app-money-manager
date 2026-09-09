// ESLint for the whole repo (audit INF-6): typescript-eslint's recommended rules
// plus the two classic react-hooks rules, type-aware where a tsconfig covers the
// file. `tsc --strict` checks none of exhaustive-deps, rules-of-hooks, unused
// variables or floating promises - the shapes several hand-found QA bugs had.
// `npm run lint` is a CI gate.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  performance: 'readonly',
  structuredClone: 'readonly',
};

export default tseslint.config(
  {
    // Build output, the Android project, the service worker (its own global scope), Claude Code's worktrees and other sessions' scratch dirs.
    ignores: ['dist/**', 'app/dist/**', 'app/dist-android/**', 'app/android/**', 'app/public/**', 'node_modules/**', '.claude/**', '.ds-sync/**', 'ds-bundle/**', '.design-sync/**', 'coverage/**', '**/*.json'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // The root tsconfig covers src/, app/tsconfig.json covers app/src, app/harness and the two config files.
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The plugin's v7 "recommended" set adds React Compiler rules (refs, set-state-in-effect,
      // immutability) that reject the ref-mirroring this codebase uses on purpose; the two
      // rules the audit asked for are the ones that catch real bugs.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // A rethrown error carries the original as `cause` where it helps; the rule flags every
      // readable-message rewrap the sync layer does on purpose.
      'preserve-caught-error': 'off',
      // Money formatting tests pin the non-breaking space Intl puts between symbol and figure.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
    },
  },
  {
    // Node scripts and the harness driver: plain JS, no type information.
    files: ['scripts/**/*.mjs', 'app/harness/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: nodeGlobals },
    rules: { 'preserve-caught-error': 'off' },
  },
);
