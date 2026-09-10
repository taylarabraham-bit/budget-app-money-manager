# Money Manager

A budget app for a household. It keeps the members of the house, a personal budget for each of them, savings goals, bills, paydays and a purchase log that you fill in by hand, and it works out who owes whom. It runs as an Android app and as a web app you can install from the browser. It is offline-first: everything is saved on the device you use it on, so it works without a connection and without an account.

## Install the app

The app is at https://taylarabraham-bit.github.io/budget-app-money-manager/. Open that address in the browser of the device you want it on, then install it so it gets its own icon and opens full screen:

- **Android, in Chrome:** tap the menu (three dots) and choose **Install app** (older versions call it **Add to Home screen**).
- **iPhone or iPad, in Safari:** tap Share and choose **Add to Home Screen**. On iOS 16.4 or newer, Chrome and Edge can do the same from their menus.
- **Windows or Mac, in Edge or Chrome:** click the install icon at the right end of the address bar, or open the menu and choose **Install Money Manager**.

The first time it opens, the app runs a short setup for your household. You can also tap **Explore the sample** to look around a sample household first; nothing is saved until you change something.

After the first open it works with no connection. When a new version is published it is picked up the next time you open the app, so there is nothing to update by hand. New versions go live automatically whenever a change lands on the project's main branch and passes its checks.

What you should know:

- **Your data stays on your device.** It is saved in the browser's storage for that app. Nothing is sent anywhere and there are no accounts. Your phone's own lock is what protects it.
- **One install per person.** Two people on one computer need separate browser profiles or separate user accounts, otherwise they share one copy of the data.
- **The installed web app and the Android APK are separate.** On the same phone they are two installs with two copies of the data. Pick one.
- **Reminders only fire while the app is open.** A web app cannot run in the background, so nothing is delivered while it is closed. The bell in the header always lists what needs attention.
- **Back up before changing phones, or before clearing the browser.** Uninstalling the app or clearing the site's data in the browser removes what it saved. Tap your avatar (top right; on a wide screen, the household name at the top of the side bar) to open **Settings**, and under **Your data** tap **Export backup (JSON)**. Keep that file somewhere safe. On the new device, open the same screen and tap **Import backup…**. Importing replaces, it does not merge: each part the file carries (purchases, goals, bills, paydays and so on) replaces what is on the device outright, and a part the file does not carry is left as it was. Receipt photos are not included in backups. **Export purchases (CSV)** gives you the purchase log as a spreadsheet.

## Keep two devices in sync (optional)

Sync is off by default. A single phone never needs it. If two of you want the same numbers on two devices, pick one of these.

### 1. Carry a backup file

No server, no setup. Treat one device as the primary one where changes are made, and copy its data across now and then:

1. On the primary device: avatar > **Settings** > **Your data** > **Export backup (JSON)**. Send the file to the other device however you like (a message to yourself, a shared drive, a cable).
2. On the other device: avatar > **Settings** > **Your data** > **Import backup…**, pick the file, then tap **Replace**.

Each import replaces the other device's data with the file, so anything logged there since the last import is lost. That is why one device should be the primary.

### 2. Your own Supabase project

A free hosted database that both devices talk to. Changes made on one device show up on the other within seconds while both are online, and queue up while a device is offline.

1. Create a free account at https://supabase.com and create a new project. Choose any name and a strong database password (you will not need the password in the app).
2. In the project, open the **SQL Editor** and run the two files from this repository, in this order, one after the other: paste the contents of [`supabase/migrations/20260823_sync_records.sql`](supabase/migrations/20260823_sync_records.sql) and run it, then the contents of [`supabase/migrations/20260902_clock_clamp.sql`](supabase/migrations/20260902_clock_clamp.sql) and run it. Both are safe to run again later.
3. Open **Project Settings > API** and copy two values: the **Project URL** (an https:// address) and the **anon public** key (newer dashboards may list it as the publishable key; either works).
4. On each device, open the app, tap your avatar > **Settings** > **Sync between devices**. Paste the Project URL into **Server URL** (the field's hint mentions a laptop on Tailscale; a hosted project's address goes in the same box) and the key into **Anon key**, then tap **Connect**. A brand-new device that is still in the setup wizard can instead choose **Join your partner's household**, paste the same two values and tap **Connect and join**.
5. The first device to connect uploads its household. A second device that is still showing the sample household joins automatically and asks which of you it is. If both devices already hold real data, the app asks which one wins. From **Settings** the choices are **Use the server's data** or **Upload this device's data**; in the setup wizard they are **Join <the household's name>** or **Keep this device's data**. The other copy is replaced.

Afterwards the card shows **Connected** and when it last synced. **Sync now** forces a round trip and **Disconnect** stops syncing on that device; changes made while disconnected are kept and go through the next time it connects to the same household.

Two things to understand about this option:

- **The URL plus the key is the password.** The app's access rule lets anyone holding both read, change and delete everything in that project, and a hosted project is reachable from the whole internet. Keep both private and paste them only into the app on your own devices. If they leak, open the project's **Project Settings > API** in the Supabase dashboard and generate a new JWT secret. That invalidates the old key at once; copy the new key and paste it into **Settings > Sync between devices** on each device.
- **Free projects pause after about a week without activity.** Sync then stops with **Server not reachable** and the app keeps working offline, queueing changes. Open the Supabase dashboard, restore the project, and the queue goes through on its own.

### 3. A server at home over Tailscale

The most private option for a household with a PC or laptop that is usually on: Supabase runs on that machine in Docker, reachable only over your own Tailscale network. [`supabase/README.md`](supabase/README.md) walks through it. In the app the steps are the same as option 2: **Settings > Sync between devices**, the server's https:// address and its anon key, **Connect**.

The **Server URL** field accepts any https:// address, so the app does not care whether the server is hosted or at home.

## For developers

### Setup

One clone holds both halves: the design system at the root of the repo and the Money Manager app in [`app/`](app/), an npm workspace that imports the components straight from `src/`. Nothing in the repo points at any particular server: a fresh clone runs on its own, and the [sync options](#keep-two-devices-in-sync-optional) are added at runtime.

1. **Install** [Node](https://nodejs.org) 22 or newer (CI runs 22 and 24) and Git. Windows, macOS and Linux all work, and the commands below are the same on each.
2. **Clone and install** the dependencies:

   ```bash
   git clone https://github.com/taylarabraham-bit/budget-app-money-manager.git
   cd budget-app-money-manager
   npm ci
   ```

3. **Run the app** locally with `npm run dev` and open http://127.0.0.1:5173/. The first run opens a short setup wizard for your household, or you can tap **Explore the sample** to look around the sample household first. The app is offline-first and keeps everything in that browser's storage, so this is the whole setup for a single device. The public copy at https://taylarabraham-bit.github.io/budget-app-money-manager/ is built and deployed by CI from every green push to `master` (see [CI](#ci)); nothing is deployed from a developer machine.
4. **Sync between devices (optional).** Any Supabase works: a hosted project or a self-hosted one at home ([`supabase/README.md`](supabase/README.md) covers both). Then either enter the server's URL and anon key in the app (avatar > **Settings** > **Sync between devices**), or copy [`app/.env.example`](app/.env.example) to `app/.env.local` so `npm run dev` and every build from that clone connect automatically. `.env.local` is gitignored: keep it that way.
5. **Phones (optional).** Run the app live on a phone from your PC with `npm run demo` (see [Run the app live](#run-the-app-live-phones-included)), or build the Android APK (see [Android build](#android-build-the-apk)).
6. **Before a commit**, `npm run ci` runs what the GitHub workflow runs: lint, typecheck, the test suite and both builds.

### The design system (@budget-app/ui)

The root of the repo is the design system: React components, design tokens and a single stylesheet, built around the app's core ideas (a household with several members, a personal budget per member, savings goals, daily earning totals, and a manually logged purchase history).

The package is not published to npm: the app in `app/` consumes it straight from `../src` through a Vite/TypeScript alias (`@budget-app/ui`), so library edits hot-reload there. Another project would build it (`npm run build` -> `dist/`) and install the repo path.

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

To develop the package on its own:

```bash
npm install
npm run build      # tsc -> dist/ + dist/styles.css
npm run typecheck
```

Source layout: `src/components/<group>/<Name>/<Name>.tsx`, styles in `src/styles/` (tokens, base, utilities, one CSS file per group), shared helpers in `src/lib/`.

### Tests

```bash
npm test           # the whole suite, about a second
npm run test:watch # re-runs on save
npm run ci         # what CI runs: lint -> typecheck -> test -> build -> app build
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

### Responsive audit

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
npm run pwa-icons        # regenerate app/public/icons/*.png from app/assets/icon-only.png (only needed when the master changes)
```

To reproduce the GitHub Pages build instead, run `BASE_PATH=/budget-app-money-manager/ npm run app:build:uitest`. From Git Bash on Windows prefix that with `MSYS_NO_PATHCONV=1`: the shell otherwise rewrites the leading slash into a Windows path (`/Program Files/Git/budget-app-money-manager/`), the build still exits 0, and every asset URL in the result is wrong. PowerShell and Linux need no prefix. Then `npm run pwa-check` serves that build the way Pages does (under the base path, with Vite preview's `Vary: Origin`), lets the worker install, cuts the network and proves the app still opens; it needs `npx playwright install chromium` once and must run straight after the build, since it reads `app/dist` as it is. Nothing unit-tests `app/public/sw.js`, so run it after touching the worker - `npm run ci` stays green either way.

The four PWA icons in `app/public/icons/` (and `app/public/manifest.webmanifest`) are committed; `npm run pwa-icons` regenerates them from `app/assets/icon-only.png` with Playwright and only needs re-running when that master changes.

Build with `app:build:uitest` rather than `app:build` for this: a normal build bakes in `VITE_SUPABASE_URL`/`ANON_KEY` and auto-connects, so an audit would drive a browser against the real household and any stray edit would push to the server. The uitest mode reads `app/.env.uitest.local` (gitignored, empty values) which overrides `.env.local`.

Two gotchas the script handles, worth knowing if you write your own: a fresh browser context has no `localStorage`, so the first-run Welcome sheet opens and its modal overlay swallows every click and probe; and a tap-target probe "misses" when a control is merely covered by the fixed bottom nav at the current scroll position, which is why size is advisory and only overflow and truncation gate.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `master` and every pull request:

- **Gates**, on Node 22 (the `engines` floor - 20 reached end of life in April 2026) and 24 (what the maintainers run): lint, typecheck, the suite, the suite again under `TZ=Australia/Sydney`, then both builds. The second run is deliberate - dates here are local calendar days, and a UTC-vs-local regression passes on a UTC runner and fails under a southern-hemisphere zone.
- **Sync race harness**, after the gates pass, on Node 24: installs Chromium, starts the dev server and runs all fourteen scenarios. Kept in its own job so a flaky browser run cannot hide a broken unit test. All three jobs stop after 15 minutes, so a hung step can never sit for GitHub's six-hour default.
- **Deploy to GitHub Pages**, after the gates pass, only for a push to `master` (a pull request or a manual run never touches the live site). It builds the app with `BASE_PATH=/<repo-name>/` so every asset URL matches the site's sub-path, proves the build installs and opens offline (`npm run pwa-check`, the same check you can run locally), uploads `app/dist` and deploys it to https://taylarabraham-bit.github.io/budget-app-money-manager/. The runner has no `.env.local`, so the published build carries no server address: sync stays off until a server is entered in Settings. It is the only job with Pages write permission, and deploys run one at a time and are never cancelled mid-way. Every other build keeps `base: '/'`. To reproduce that build locally run `BASE_PATH=/budget-app-money-manager/ npm run app:build` (from Git Bash on Windows prefix it with `MSYS_NO_PATHCONV=1`, or the shell rewrites the leading slash into a Windows path).

### Android build (the APK)

The phones run a signed Capacitor build of the same app. From a fresh clone:

```bash
npm ci
npm run app:build:android          # web bundle -> app/dist-android (bakes app/.env.local if present: the APK then auto-connects to your server)
cd app && npx cap sync android     # copies the bundle in and generates capacitor-cordova-android-plugins (gitignored)
cd android && ./gradlew assembleRelease
```

Needs JDK 21 and an Android SDK with `platforms;android-35` + `build-tools;35.0.0` (`android/local.properties` points Gradle at the SDK; gitignored). The release build is signed from a keystore that lives OUTSIDE the repo: `android/keystore.properties` (gitignored) holds its path and passwords. **Back that keystore up** - Android only installs an update over the phones' copies when the signature matches and `versionCode` in `android/app/build.gradle` has gone up, so bump `versionCode`/`versionName` for every delivered build. Without `keystore.properties` only `assembleDebug` is signed; the debug build is the QA vehicle (its WebView is remotely debuggable) and must never be the one on the phones. `app/dist-android` is separate from `app/dist` on purpose: `dist` holds the env-stripped `--mode uitest` build that live QA serves, and an APK build must never swap the real server URL underneath a running test.

### Run the app live (phones included)

The app can also run live from your PC - handy for trying an edit on a phone without rebuilding:

```bash
npm run demo
```

That starts the dev server and, through `tailscale serve`, makes it reachable from any device signed in to your Tailscale network at **https://<your-pc>.<your-tailnet>.ts.net/** (the PC's MagicDNS name - the script prints the real one; a plain `http://` fallback is served too for tailnets without HTTPS certificates). Open that URL in the phone's browser; edits show up the moment they are saved. HTTPS matters on phones: it makes the page a secure context, so the optional notifications can work. Ctrl+C stops everything and removes the serve config, so nothing persistent changes on the PC. `npm run dev` is the local-only version (http://127.0.0.1:5173/).

To sync phones with a server at home, follow [`supabase/README.md`](supabase/README.md) - the phones need Tailscale for that anyway.

### Claude Design sync

This repo syncs to a Claude Design project with `/design-sync`. Sync inputs are committed under `.design-sync/` (config, notes, conventions header, authored previews); build output and machine state are gitignored.
