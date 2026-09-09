# @budget-app/ui

The design system for the household Budget App (Android + Windows): React components, design tokens and a single stylesheet. Built around the app's core ideas - a household with several members, a personal budget per member, savings goals, daily earning totals, and a manually logged purchase history.

## Setup

One clone holds both halves: the design system at the root of the repo and the Money Manager app in [`app/`](app/), an npm workspace that imports the components straight from `src/`. Nothing in the repo points at any particular server: a fresh clone runs on its own, and a household that wants its devices to sync hosts its own server (step 4).

1. **Install** [Node](https://nodejs.org) 22 or newer (CI runs 22 and 24) and Git. Windows, macOS and Linux all work, and the commands below are the same on each.
2. **Clone and install** the dependencies:

   ```bash
   git clone https://github.com/taylarabraham-bit/budget-app-money-manager.git
   cd budget-app-money-manager
   npm ci
   ```

3. **Run the app** with `npm run dev` and open http://127.0.0.1:5173/. The first run opens a short setup wizard for your household, or you can look around the sample household first. The app is offline-first and keeps everything in that browser's storage, so this is the whole setup for a single device.
4. **Sync between devices (optional).** Each household runs its own Supabase server on a PC at home, reachable only over its own Tailscale network; [`supabase/README.md`](supabase/README.md) walks through hosting one. Then either enter the server's URL and anon key in the app (avatar → **Settings** → **Sync between devices**), or copy [`app/.env.example`](app/.env.example) to `app/.env.local` so `npm run dev` and every build connect automatically. `.env.local` is gitignored: keep it that way.
5. **Phones (optional).** Run the app live on a phone from your PC with `npm run demo` (see [Run the app live](#run-the-app-live-phones-included)), or build the Android APK (see [Android build](#android-build-the-apk)).
6. **Before a commit**, `npm run ci` runs what the GitHub workflow runs: lint, typecheck, the test suite and both builds.

## Use it

The package is not published to npm: the app in `app/` consumes it straight from `../src` through a Vite/TypeScript alias (`@budget-app/ui`), so library edits hot-reload there. Another project would build it (`npm run build` → `dist/`) and install the repo path.

```jsx
import '@budget-app/ui/styles.css';
import { PageHeader, StatCard, BudgetBar, Card } from '@budget-app/ui';

export function Overview() {
  return (
    <div className="bdg-app">
      <div className="bdg-screen bdg-stack">
        <PageHeader size="lg" title="Overview" subtitle="Saturday, 23 August" />
        <StatCard label="Today's earnings" value={148.5} change={0.12} changeLabel="vs yesterday" />
        <Card title="Budgets" subtitle="August">
          <BudgetBar category="Groceries" spent={312} limit={450} icon="🛒" />
        </Card>
      </div>
    </div>
  );
}
```

Tokens are CSS custom properties (`--bdg-*`) on `:root`; add `data-theme="dark"` to any ancestor for dark mode. Per-component usage lives in [`docs/components/`](docs/components/) and app-level rules in [`docs/guides/`](docs/guides/).

## Components

| Group | Components |
|---|---|
| actions | Button |
| forms | TextField, AmountInput, Select, Checkbox, Switch |
| layout | Card, PageHeader |
| household | Avatar, MemberChip |
| feedback | Badge, ProgressBar, Alert, EmptyState |
| finance | Amount, StatCard, BudgetBar, GoalCard, TransactionItem, TransactionList, TrendBars |
| navigation | Tabs, BottomNav |
| overlay | Dialog |

Helpers: `formatMoney`, `formatMoneyAuto`, `splitMoney`, `currencySymbol`, `formatPercent`, `initialsOf`, `memberColorFor`, `formatDayLabel`, `parseIsoDate`.

## Develop

```bash
npm install
npm run build      # tsc -> dist/ + dist/styles.css
npm run typecheck
```

Source layout: `src/components/<group>/<Name>/<Name>.tsx`, styles in `src/styles/` (tokens, base, utilities, one CSS file per group), shared helpers in `src/lib/`.

## Tests

```bash
npm test           # the whole suite, about a second
npm run test:watch # re-runs on save
npm run ci         # what CI runs: typecheck -> test -> build -> app build
```

Vitest, configured in [`vitest.config.ts`](vitest.config.ts). Tests live next to what they test as `*.test.ts` (or `*.test.tsx` for components) and are picked up automatically - no config to touch when adding one. Import `describe` / `it` / `expect` from `vitest`; there are no globals, so a component test also needs `afterEach(cleanup)`. `tsconfig.build.json` excludes them, so nothing test-shaped reaches the published package. Shared builders (households, members, purchases, bills, paydays) are in [`app/src/test/fixtures.ts`](app/src/test/fixtures.ts).

Logic tests run in the `node` environment - it is faster and catches an accidental reliance on browser globals. A component test opts into a DOM per file with a `// @vitest-environment jsdom` docblock on the first line; that is the whole setup.

What is covered is the load-bearing pure logic - the parts where a regression costs money or silently loses data rather than looking wrong:

| Suite | The invariant it pins |
|---|---|
| `data/split` | shares of a purchase add up to it exactly, in whole cents |
| `data/store` | `goal.saved` is derived from the contributions ledger; untrusted blobs drop bad rows, not whole stores |
| `data/backup` | import never wipes a store the file lacks; CSV is RFC 4180 and formula-safe |
| `sync/engine` | a rebuilt-but-identical row is not an edit; a pull never clobbers an edit racing it |
| `lib/frequency` | a schedule anchored to the 31st stays on the 31st through short months |
| `lib/dates` | picked dates are local calendar days, never UTC midnight |
| `features/settle/selectors` | the balance is antisymmetric and settles to zero to the cent |
| `features/paydays/selectors` | every bill occurrence in the window is counted; no cap means no ceiling |
| `src/lib/format` | every amount in the app formats the same way |

Components are covered where what they render is a *verdict* rather than decoration:

| Suite | The invariant it pins |
|---|---|
| `BudgetBar` | over/under decided in whole cents; no limit never reads as over |
| `Amount` | the split parts read as one figure; tone follows the sign |
| `ProgressBar` | the accessible name reaches the element carrying the role |
| `Checkbox` | the visually hidden input stays named, focusable and keyboard-operable |

The table lists the load-bearing suites; newer ones sit next to the code they pin (the onboarding wizard's Finish rules, every feature store's row guards, the money dialogs' amount cap, the shell's Back handling, the sync transport and the two lane-split repros in `store.lanes` and `SyncProvider.interleave`). Sync races have their own cover as well: the browser harness in [`app/harness/`](app/harness/README.md), fourteen deterministic edit-versus-pull interleavings.

`npm run lint` runs ESLint (typescript-eslint's recommended rules plus `react-hooks`): exhaustive-deps, rules-of-hooks, unused variables and floating promises are the shapes several hand-found bugs had, and `tsc --strict` checks none of them.

## Responsive audit

The app is developed on one phone, and a 412px-wide S24 Ultra hides what a 360px phone shows immediately. [`scripts/ui-audit.mjs`](scripts/ui-audit.mjs) drives the built app across eleven real device sizes - from a 280px folding-phone cover screen up to 1920px desktop - and fails on content escaping the viewport, on page titles or tab labels ellipsising, on a primary action that stays unreachable after scrolling to it, and (advisory) on controls with no 32px touch target.

Three passes, each addable with `--pass`:

| Pass | Covers |
|---|---|
| `tabs` | the five bottom-nav screens |
| `subscreens` | Settings, Paydays, Report, Settle up, Lists, Accounts - reached by clicking their real entry points, so a broken entry point is itself a finding |
| `onboarding` | the setup wizard, filled in and walked to the end, in a throwaway profile |

Entry points are matched on **exact** labels. A loose alternative (a bare `Manage`) matches whichever control comes first in the DOM, so the pass audits the wrong thing - or opens a dialog - and reports clean because it never arrived. If you add a screen, add its entry to `SUBSCREENS` with the label the button actually has.

```bash
npm run app:build:uitest   # build with the Supabase credentials stripped
```

then serve that build on port 4174 and run the audit against it:

```bash
npm run preview:uitest   # vite preview of app/dist on 4174 (the Claude Code launch config `ui-audit` is the same thing)
npm run ui-audit
```

Build with `app:build:uitest` rather than `app:build` for this: a normal build bakes in `VITE_SUPABASE_URL`/`ANON_KEY` and auto-connects, so an audit would drive a browser against the real household and any stray edit would push to the server. The uitest mode reads `app/.env.uitest.local` (gitignored, empty values) which overrides `.env.local`.

Two gotchas the script handles, worth knowing if you write your own: a fresh browser context has no `localStorage`, so the first-run Welcome sheet opens and its modal overlay swallows every click and probe; and a tap-target probe "misses" when a control is merely covered by the fixed bottom nav at the current scroll position, which is why size is advisory and only overflow and truncation gate.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `master` and every pull request:

- **Gates**, on Node 22 (the `engines` floor - 20 reached end of life in April 2026) and 24 (what the maintainers run): lint, typecheck, the suite, the suite again under `TZ=Australia/Sydney`, then both builds. The second run is deliberate - dates here are local calendar days, and a UTC-vs-local regression passes on a UTC runner and fails under a southern-hemisphere zone.
- **Sync race harness**, after the gates pass, on Node 24: installs Chromium, starts the dev server and runs all fourteen scenarios. Kept in its own job so a flaky browser run cannot hide a broken unit test. Both jobs stop after 15 minutes, so a hung step can never sit for GitHub's six-hour default.

## Android build (the APK)

The phones run a signed Capacitor build of the same app. From a fresh clone:

```bash
npm ci
npm run app:build:android          # web bundle -> app/dist-android (bakes app/.env.local if present: the APK then auto-connects to your server)
cd app && npx cap sync android     # copies the bundle in and generates capacitor-cordova-android-plugins (gitignored)
cd android && ./gradlew assembleRelease
```

Needs JDK 21 and an Android SDK with `platforms;android-35` + `build-tools;35.0.0` (`android/local.properties` points Gradle at the SDK; gitignored). The release build is signed from a keystore that lives OUTSIDE the repo: `android/keystore.properties` (gitignored) holds its path and passwords. **Back that keystore up** - Android only installs an update over the phones' copies when the signature matches and `versionCode` in `android/app/build.gradle` has gone up, so bump `versionCode`/`versionName` for every delivered build. Without `keystore.properties` only `assembleDebug` is signed; the debug build is the QA vehicle (its WebView is remotely debuggable) and must never be the one on the phones. `app/dist-android` is separate from `app/dist` on purpose: `dist` holds the env-stripped `--mode uitest` build that live QA serves, and an APK build must never swap the real server URL underneath a running test.

## Run the app live (phones included)

The app can also run live from your PC - handy for trying an edit on a phone without rebuilding:

```bash
npm run demo
```

That starts the dev server and, through `tailscale serve`, makes it reachable from any device signed in to your Tailscale network at **https://<your-pc>.<your-tailnet>.ts.net/** (the PC's MagicDNS name - the script prints the real one; a plain `http://` fallback is served too for tailnets without HTTPS certificates). Open that URL in the phone's browser; edits show up the moment they are saved. HTTPS matters on phones: it makes the page a secure context, so the optional notifications can work. Ctrl+C stops everything and removes the serve config, so nothing persistent changes on the PC. `npm run dev` is the local-only version (http://127.0.0.1:5173/).

To sync phones with your own Supabase, follow [`supabase/README.md`](supabase/README.md) - the phones need Tailscale for that anyway.

## Claude Design sync

This repo syncs to a Claude Design project with `/design-sync`. Sync inputs are committed under `.design-sync/` (config, notes, conventions header, authored previews); build output and machine state are gitignored.
