/* global window */
// M12 race harness driver. Runs every scenario N times against the harness page
// (one fresh browser context per run) and grades the facts the page reports.
// Start the dev server first (npm run dev from the repo root), then:
//   node app/harness/run.mjs [--url http://127.0.0.1:5173/harness/] [--iters 6] [--only s2_dispatch_then_release]
// Playwright comes from the repo's own node_modules (what CI installs), falling
// back to .ds-sync/node_modules for the older local setup on this PC (Chromium
// cached in %LOCALAPPDATA%/ms-playwright either way).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const loadPlaywright = () => {
  for (const from of ['playwright', '../../.ds-sync/node_modules/playwright']) {
    try {
      return require(from);
    } catch {
      // try the next location
    }
  }
  throw new Error('Playwright not found. Run `npm ci` at the repo root, then `npx playwright install chromium`.');
};
const { chromium } = loadPlaywright();

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const URL_ = arg('url', 'http://127.0.0.1:5173/harness/');
const LABEL = arg('label', 'run');
const ITERS = Number(arg('iters', '6'));
const OUT = arg('out', `results-${LABEL}.json`);
const ONLY = arg('only', '');

// What "M12 verified" means per scenario. `edit`: the raced local edit must
// survive in app state AND on the server. `partner`: the pulled partner row
// must also land (state + server). s5 instead requires the newer local edit to
// beat the partner everywhere; s8 stages no partner.
const EXPECT = {
  s1_control: { edit: true, partner: true },
  s2_dispatch_then_release: { edit: true, partner: true },
  s3_release_then_dispatch: { edit: true, partner: true },
  s4_dispatch_after_apply: { edit: true, partner: true },
  s5_same_row_conflict: { conflictWin: true },
  s6_idb_provenance: { edit: true, partner: true },
  s7_edit_committed_before_release: { edit: true, partner: true },
  s8_empty_pull: { edit: true },
  // A sample device that adopts the server's household must be asked who it is (audit OB-1).
  s9_join_replace: { identity: true },
  s10_backup_import: { edit: true },
  // A household tombstone pulled while bound must END in needs-choice, visibly (audit SYN-2).
  s11_tombstone_unbind: { choice: true },
  // One partner bill pulled into a still-sample bills store must not promote the sample rows (audit SY-2).
  s12_sample_store_pull: { sampleStore: true },
  // A discrete click while the pull is being applied: no tombstone, no crash, every row where it belongs (audit SY-1).
  s13_discrete_click: { edit: true, partner: true, partnerNew: true, noTombstones: true },
  // Adopting another tab's stale blob must not delete or revert the partner's rows on the server (audit SY-3).
  s14_stale_tab_adoption: { partnerOnServer: true, partnerNewOnServer: true, noTombstones: true },
};

function grade(name, facts) {
  const exp = EXPECT[name];
  const problems = [];
  if (exp.choice) {
    if (facts.status !== 'needs-choice') problems.push(`choice masked: ended ${facts.status}`);
    if (facts.consoleErrors.length) problems.push(`console: ${facts.consoleErrors[0]}`);
    return problems;
  }
  if (exp.identity && facts.needsIdentity !== true) problems.push('adopted without asking which member this device is');
  if (exp.sampleStore && !facts.billsOnlyPartner) problems.push(`sample bills promoted: store holds ${facts.billsCount} bills, expected only the partner's`);
  if (exp.noTombstones && facts.tombstonesPushed > 0) problems.push(`${facts.tombstonesPushed} tombstone(s) pushed`);
  if (exp.partnerNew && !facts.partnerNewInState) problems.push("partner's new row not in state");
  if ((exp.partnerNew || exp.partnerNewOnServer) && !facts.partnerNewOnServer) problems.push("partner's new row lost on server");
  if (exp.partnerOnServer && !facts.partnerXOnServer) problems.push('partner edit reverted on server');
  if (exp.conflictWin) {
    if (!facts.editXInState) problems.push('local conflict edit reverted in state');
    if (!facts.editOnServer) problems.push('local conflict edit missing on server');
    if (facts.partnerXInState) problems.push('older partner copy still in state');
  } else {
    if (exp.edit && !facts.editInState) problems.push('edit lost from state');
    if (exp.edit && !facts.editOnServer) problems.push('edit never reached server');
    if (exp.partner && !facts.partnerXInState) problems.push('partner row not in state');
    if (exp.partner && !facts.partnerXOnServer) problems.push('partner row lost on server');
  }
  if (facts.status !== 'online') problems.push(`ended ${facts.status}`);
  if (facts.pending !== 0) problems.push(`${facts.pending} pending`);
  if (facts.consoleErrors.length) problems.push(`console: ${facts.consoleErrors[0]}`);
  return problems;
}

const browser = await chromium.launch();
const results = [];
let scenarios;
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__h && window.__h.sync, null, { timeout: 20000 });
  scenarios = await page.evaluate(() => window.__h.scenarioNames);
  await ctx.close();
}
if (ONLY) scenarios = scenarios.filter((s) => s === ONLY);
console.log(`[${LABEL}] ${scenarios.length} scenarios x ${ITERS} iterations against ${URL_}`);

for (const name of scenarios) {
  for (let i = 0; i < ITERS; i += 1) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    let entry;
    try {
      await page.goto(URL_, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__h && window.__h.sync, null, { timeout: 20000 });
      // page.evaluate takes no timeout option (a third argument is silently ignored - audit INF-3):
      // race the run against a real timer so a gated promise that never resolves fails the
      // iteration instead of holding the job for CI's six-hour default.
      const RUN_TIMEOUT_MS = 90_000;
      let timer;
      const r = await Promise.race([
        page.evaluate(async (n) => await window.__h.run(n), name),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`scenario ${name} did not finish within ${RUN_TIMEOUT_MS} ms`)), RUN_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));
      r.facts.consoleErrors.push(...pageErrors);
      const problems = grade(name, r.facts);
      entry = { scenario: name, iter: i, pass: problems.length === 0, problems, facts: r.facts, trace: r.trace };
    } catch (e) {
      entry = { scenario: name, iter: i, pass: false, problems: [`harness error: ${String(e).slice(0, 300)}`], facts: null, trace: null };
    }
    results.push(entry);
    process.stdout.write(entry.pass ? '.' : 'F');
    await ctx.close();
  }
  const runs = results.filter((r) => r.scenario === name);
  const fails = runs.filter((r) => !r.pass).length;
  console.log(`  ${name}: ${runs.length - fails}/${runs.length} pass${fails ? ` — e.g. ${runs.find((r) => !r.pass).problems.join('; ')}` : ''}`);
}

await browser.close();
writeFileSync(OUT, JSON.stringify({ label: LABEL, url: URL_, at: new Date().toISOString(), results }, null, 1));
const total = results.length;
const passed = results.filter((r) => r.pass).length;
console.log(`[${LABEL}] TOTAL ${passed}/${total} pass -> ${OUT}`);
// Fail the process, not just the console: a red harness in CI must fail the
// job. Silently-green is the failure mode this harness exists to catch.
if (passed < total) process.exitCode = 1;
