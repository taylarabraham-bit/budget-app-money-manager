# design-sync notes - @budget-app/ui

Repo-specific facts a future sync needs. The config (`config.json`) holds everything that maps to a `cfg.*` key; this file holds the rest.

## Shape and build

- Package shape (no Storybook by design). Build is plain `tsc` (`tsconfig.build.json`) + `scripts/build-css.mjs`, which inlines `src/styles/index.css`'s `@import` chain into `dist/styles.css`. Run `npm run build` before the converter whenever `src/` changed.
- The converter picks up `dist/styles.css` via `cfg.cssEntry`; tokens are declared inside it (`:root` + `[data-theme="dark"]`), so `tokens/` in the bundle is empty on purpose and the README reports them from `_ds_bundle.css`.
- `dist/` uses extension-less ESM imports (tsc output). Fine for esbuild/bundlers; it will NOT `import()` directly in Node - don't use Node to smoke-test `dist/`.
- Fonts: system stack only (`system-ui`, Segoe UI, Roboto, Helvetica Neue, Arial; monospace stack for `--bdg-font-mono`). Nothing to ship, no `[FONT_MISSING]`.
- No provider. Components set their own `font-family`; `.bdg-app` is the optional app wrapper (background, focus ring, box-sizing).

## Previews

- All 24 previews are authored in `.design-sync/previews/` (no generated tier in this shape). Each export wraps its story in `<div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: ... }}>` so cards sit on the app background.
- Column mode (`cfg.overrides.<Name>.cardMode = "column"`) for phone-width pieces (lists, nav bars, charts, headers, cards, alerts, stat/goal/budget cards); the product pane is <=728px so grid cells are ~304px. Dialog is `single` with `primaryStory: LogPurchase`, viewport 560x640 (>520px keeps it centred rather than the mobile bottom-sheet layout).
- `TransactionList` previews pin `today={new Date('2026-08-23T18:00:00')}` so the Today/Yesterday labels are stable. Date-only ISO strings are parsed as LOCAL days (`parseIsoDate`) - this was an off-by-one bug caught in grading.
- Cells in a grid card render in alphabetical export order (esbuild sorts IIFE exports); name exports accordingly if order matters.

## Machine / environment

- Windows 11, Node 24.19 installed via winget at `C:\Program Files\nodejs` (not on the Git Bash PATH by default - prefix `export PATH="/c/Program Files/nodejs:$PATH"`).
- Playwright Chromium lives in `%LOCALAPPDATA%\ms-playwright`; the converter deps + playwright are installed in `.ds-sync/` (gitignored, re-create with the step-7 commands).
- The repo lives in a OneDrive-synced folder; installs are slower than usual but worked. Keep `node_modules`, `dist`, `.ds-sync`, `ds-bundle` out of git (already in `.gitignore`).
- The Claude Code Bash tool here truncates commands over ~8 KB and collapses `\\` in heredocs - write source files with the Write tool, not heredocs.

## First sync (2026-08-23)

- Project: https://claude.ai/design/p/b3971e2f-5ba8-4fca-917c-9a28f338be86 - 24 components, 132 files, incremental path (one batch: everything verified before the first push).
- One `resync.mjs` run reported the validate stage as failed while a direct `package-validate.mjs` run passed; the immediate re-run of the driver was fully green. Treat a lone driver validate failure as a flake: re-run once before digging in.
- The user-facing review page is `ds-bundle/.review.html` (serve with `node .ds-sync/storybook/http-serve.mjs ./ds-bundle`).

## Second sync (2026-08-23, later the same day)

- Anchored re-sync via the driver worked as documented: all 24 components carried forward (sourceKeys unchanged), validate ran the full render check because styling moved, upload partition was {Select (hideLabel in .d.ts/.prompt.md), bundle, styling}, no deletes, atomic path. Nothing needed grading.

## Third sync (2026-08-23, evening)

- One-line DS diff from the app sessions (TextField `type` union + 'time', doc bullet). Driver: 24 carried forward, validate clean, upload {TextField, bundle}, no deletes, atomic path. Conventions header re-validated unchanged.

## Fourth sync (2026-08-23, night)

- Post-QA sync: BudgetBar no-limit state (QA M3; grades pre-verified locally, carried forward) + the field.css focus-ring fix from the phone polish pass. Driver: 23 carried + BudgetBar changed-with-grades, validate clean, upload {BudgetBar, bundle, styling}, no deletes.

## Known render warns

- None. Validate is clean (24/24, no `[RENDER_*]`/`[GRID_OVERFLOW]`/`[FONT_*]` lines) as of the first sync (2026-08-23).

## Re-sync risks

- `dist/` is gitignored: a fresh clone must `npm ci && npm run build` before `resync.mjs`, or the converter will `[NO_DIST]`/synth from `src/` with weaker `.d.ts` contracts.
- Preview data (member names, amounts, dates) is inlined in the `.tsx` files; if component props are renamed, the previews and the docs in `docs/components/*.md` both need the rename (docs are the `.prompt.md` bodies - keep prop names in them exact).
- Grades are machine-local (`.design-sync/.cache/review/`); cross-machine carry-forward comes only from the uploaded `_ds_sync.json`.
- The conventions header (`conventions.md`) enumerates utility classes and token families by name; re-validate it against `ds-bundle/_ds_bundle.css` after any token/utility rename (`.design-sync/.cache/check-conventions.mjs` did this on the first sync - recreate a similar check if the cache is gone).
