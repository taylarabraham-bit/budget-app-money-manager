/* global localStorage */
// Responsive audit: drives the built app across the phone sizes people actually
// have and fails on the things that make a UI look broken rather than merely
// unpolished - content escaping the viewport, titles and tab labels truncating,
// and controls too small for a thumb.
//
// It exists because the app was developed on one phone. A 412px-wide S24 Ultra
// hides problems that a 360px phone - the commonest Android width - shows
// immediately: "Household" rendered as "Hous..." on every narrower device.
//
// Three passes:
//   tabs        the five bottom-nav screens
//   subscreens  Settings, Paydays, Report, Settle up, Lists, Accounts - reached
//               by clicking their real entry points, so a broken entry point is
//               itself a finding
//   onboarding  the setup wizard, walked step by step to the end, in a throwaway
//               browser profile so finishing it writes nothing that outlives the run
//
//   npm run app:build:uitest     # credentials stripped - see README
//   npm run ui-audit             # needs the ui-audit preview on :4174
//
// Flags: --url <origin>  --json <file>  --only <width>  --pass <tabs|subscreens|onboarding>
//
// Exit code 1 if anything is flagged, so this can gate a build.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const loadPlaywright = () => {
  for (const from of ['playwright', '../.ds-sync/node_modules/playwright']) {
    try {
      return require(from);
    } catch {
      // try the next location
    }
  }
  throw new Error('Playwright not found. Run `npm ci`, then `npx playwright install chromium`.');
};
const { chromium } = loadPlaywright();

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const URL_ = arg('url', 'http://127.0.0.1:4174/');
const ONLY = arg('only', '');
const PASS = arg('pass', '');
const JSON_OUT = arg('json', '');

/**
 * Real devices, not round numbers. The narrow end matters most: everything at
 * 412 and up was already fine, and every defect found lived below it.
 */
const VIEWPORTS = [
  { w: 280, h: 653, name: 'Galaxy Fold (cover)' },
  { w: 320, h: 568, name: 'small / legacy Android' },
  { w: 344, h: 882, name: 'Z Fold 5 (cover)' },
  { w: 360, h: 640, name: 'Android baseline (short)' },
  { w: 360, h: 800, name: 'commonest Android' },
  { w: 393, h: 851, name: 'Pixel 8' },
  { w: 412, h: 915, name: 'S24 Ultra / large Android' },
  { w: 740, h: 360, name: 'phone, landscape' },
  { w: 768, h: 1024, name: 'tablet' },
  { w: 1280, h: 800, name: 'laptop' },
  { w: 1920, h: 1080, name: 'desktop' },
];

/** The wizard is long; walking it everywhere would treble the run for little more signal. */
const ONBOARDING_AT = new Set([320, 360, 1280]);

const TABS = ['Overview', 'Activity', 'Bills', 'Goals', 'Household'];

/**
 * Sub-screens, with the control that actually opens them. Reaching them by
 * clicking real UI means a broken entry point shows up as "unreachable" rather
 * than as silence - the failure mode of auditing only what you can navigate to.
 */
const SUBSCREENS = [
  { name: 'Settings', aria: '^Settings' },
  { name: 'Paydays', text: 'Paydays' },
  { name: 'Report', text: 'Report' },
  { name: 'Settle up', text: 'History' },
  { name: 'Lists', text: 'Open' },
  // Exact labels only. A loose alternative like a bare "Manage" matches whichever
  // control happens to come first in the DOM, so the pass silently audits the
  // wrong thing - or opens a dialog - and reports clean because it never arrived.
  { name: 'Accounts', text: 'Manage accounts|Add accounts' },
];

/** Runs in the page. Returns the problems found on whatever is currently shown. */
const INSPECT = `(() => {
  const W = document.documentElement.clientWidth;
  const H = document.documentElement.clientHeight;
  const out = [];

  // 1. Nothing may escape the viewport horizontally. Vertical scrolling is fine.
  //    Name the culprits: "the page is 8px too wide" is not actionable on its own,
  //    and the deepest offenders are the ones actually doing it - a parent is
  //    usually just wrapping something that will not fit.
  if (document.documentElement.scrollWidth > W + 1) {
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= W + 1) continue;
      over.push({ el, r });
    }
    const deepest = over.filter(({ el }) => !over.some((o) => o.el !== el && el.contains(o.el)));
    const named = deepest.slice(0, 3).map(({ el, r }) => {
      const cls = String(el.className).trim().split(/\\s+/).slice(0, 2).join('.');
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' (to ' + Math.round(r.right) + 'px' + (el.textContent?.trim() ? ', "' + el.textContent.trim().slice(0, 24) + '"' : '') + ')';
    });
    out.push({ kind: 'overflow', detail: 'page is ' + (document.documentElement.scrollWidth - W) + 'px wider than the screen' + (named.length ? ' - widest: ' + named.join('; ') : '') });
  }

  // 2. Text the design intends to be read whole must not ellipsise. Other
  //    truncation (a long merchant name in a row) is deliberate and ignored.
  const mustFit = ['.bdg-page-header__title', '.bdg-bottom-nav__label', '.bdg-tabs__tab', '.bdg-page-header__eyebrow'];
  for (const sel of mustFit) {
    for (const el of document.querySelectorAll(sel)) {
      if (el.scrollWidth > el.clientWidth + 1) {
        out.push({ kind: 'truncated', detail: sel + ' "' + el.textContent.trim().slice(0, 30) + '" needs ' + el.scrollWidth + 'px, has ' + el.clientWidth + 'px' });
      }
    }
  }

  // 3. The primary action must be REACHABLE. Being below the fold is normal on a
  //    long form - you scroll. What is not normal is still being unreachable
  //    after scrolling to it, which is what a fixed bar covering the footer, or
  //    a container that cannot scroll, produces.
  const footer = document.querySelector('.onboarding__footer, .bdg-dialog__footer');
  if (footer) {
    footer.scrollIntoView({ block: 'end' });
    const f = footer.getBoundingClientRect();
    if (f.bottom > H + 1 || f.top < 0) {
      out.push({ kind: 'footer-unreachable', detail: 'primary actions still outside the viewport after scrolling to them (top ' + Math.round(f.top) + ', bottom ' + Math.round(f.bottom) + ', viewport ' + H + ')' });
    } else {
      // Reachable, but is it actually clickable, or is something painted over it?
      const btn = footer.querySelector('button');
      if (btn) {
        const r = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && hit !== btn && !btn.contains(hit) && hit.closest('button') !== btn) {
          out.push({ kind: 'footer-covered', detail: '"' + (btn.textContent || '').trim().slice(0, 20) + '" is overlapped by ' + (hit.className || hit.tagName) });
        }
      }
    }
  }

  // 4. Tap targets. Advisory only. Each small control is probed at its
  //    scrolled-into-view position: probing in place flagged controls that
  //    merely sat under the fixed bottom nav at the load-time scroll (the
  //    landscape Settings switch), which says nothing about the control - a
  //    thumb reaches it exactly where scrollIntoView puts it. The scroll is
  //    restored afterwards so the other checks measure the original layout.
  const seen = new Set();
  const scroller = document.scrollingElement || document.documentElement;
  const scrollTop0 = scroller.scrollTop;
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], select, input[type="checkbox"], input[type="radio"]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    let r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.width >= 32 && r.height >= 32) continue;
    el.scrollIntoView({ block: 'center' });
    r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // 15, not 16: on a control exactly 32px tall a +-16 probe lands on the
    // boundary pixel and resolves to the neighbour.
    const R = 15;
    const misses = [[cx - R, cy], [cx + R, cy], [cx, cy - R], [cx, cy + R]].filter(([x, y]) => {
      if (x < 0 || y < 0 || x > W || y > H) return false;
      const hit = document.elementFromPoint(x, y);
      return !hit || !(hit === el || el.contains(hit) || hit.closest('button, a[href], [role="button"], [role="tab"]') === el);
    });
    if (!misses.length) continue; // an invisible ::after hit pad covers it
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) || el.className;
    const key = label + '|' + Math.round(r.width) + 'x' + Math.round(r.height);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'tap-target', advisory: true, detail: '"' + label + '" is ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' and no hit pad reaches 32px' });
  }
  scroller.scrollTop = scrollTop0;
  return out;
})()`;

/** Clicks a control outside the navigation, by exact text or by aria-label pattern. */
const clickOutsideNav = (spec) =>
  `(() => {
    const spec = ${JSON.stringify(spec)};
    const all = [...document.querySelectorAll('button, a[href], [role="button"]')].filter((b) => !b.closest('nav, .app-side, .bdg-bottom-nav'));
    const match = (b) => {
      const aria = (b.getAttribute('aria-label') || '').trim();
      const text = (b.textContent || '').trim();
      if (spec.aria) return new RegExp(spec.aria).test(aria);
      return new RegExp('^(' + spec.text + ')$').test(text);
    };
    const el = all.find(match);
    if (!el) return false;
    el.click();
    return true;
  })()`;

const GO_TAB = (name) =>
  `(() => {
    const el = [...document.querySelectorAll('button, a')].find((e) => (e.textContent || '').trim() === ${JSON.stringify(name)} && e.closest('nav, .app-side, .bdg-bottom-nav'));
    if (el) { el.click(); return true; }
    return false;
  })()`;

const TITLE = `document.querySelector('.bdg-page-header__title')?.textContent?.trim() ?? null`;

/**
 * Types a plausible value into every empty visible field, so the wizard walk
 * exercises the whole flow instead of stopping at the first required field.
 * The value is chosen from the field's own hints - a money field gets a number,
 * not the word "Audit".
 */
async function fillVisibleFields(page) {
  for (const input of await page.locator('input:visible, textarea:visible').all()) {
    const type = (await input.getAttribute('type')) ?? 'text';
    if (['checkbox', 'radio', 'button', 'submit', 'hidden', 'range', 'color'].includes(type)) continue;
    if (await input.inputValue()) continue;
    const mode = (await input.getAttribute('inputmode')) ?? '';
    const hint = `${(await input.getAttribute('placeholder')) ?? ''} ${(await input.getAttribute('aria-label')) ?? ''}`.toLowerCase();
    let value = 'Audit household';
    if (type === 'number' || mode === 'decimal' || mode === 'numeric' || /amount|\$|limit|balance|target/.test(hint)) value = '120';
    else if (type === 'date') value = '2026-09-15';
    else if (type === 'time') value = '09:00';
    else if (type === 'email') value = 'audit@example.com';
    else if (/name|who|person|partner/.test(hint)) value = 'Audit Person';
    try {
      await input.fill(value, { timeout: 2000 });
    } catch {
      /* a field that refuses input is the screen's business, not the audit's */
    }
  }
}

const results = [];
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  if (ONLY && String(vp.w) !== ONLY) continue;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 });
  // A fresh context has no localStorage, so the first-run Welcome sheet opens
  // over everything. Its modal overlay swallows the probes and the clicks,
  // which reads as "every control is unreachable" - mark it seen before boot.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('budget-app.welcome.v1', JSON.stringify({ version: 1, dismissedAt: new Date(0).toISOString() }));
      localStorage.setItem('budget-app.settings.v1', JSON.stringify({ theme: 'light' }));
    } catch {
      /* storage blocked; the sheet just stays up */
    }
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const found = [];
  const add = (where, list) => { for (const p of list) found.push({ where, ...p }); };

  try {
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // ---- pass 1: the five tabs ----
    if (!PASS || PASS === 'tabs') {
      for (const tab of TABS) {
        await page.evaluate(GO_TAB(tab));
        await page.waitForTimeout(260);
        add(tab, await page.evaluate(INSPECT));
      }
    }

    // ---- pass 2: sub-screens, reached through their real entry points ----
    if (!PASS || PASS === 'subscreens') {
      for (const sub of SUBSCREENS) {
        await page.evaluate(GO_TAB('Overview'));
        await page.waitForTimeout(220);
        const before = await page.evaluate(TITLE);
        const clicked = await page.evaluate(clickOutsideNav(sub));
        if (!clicked) {
          found.push({ where: sub.name, kind: 'unreachable', detail: 'no control matching ' + (sub.aria ? 'aria ' + sub.aria : 'text ' + sub.text) + ' on Overview' });
          continue;
        }
        await page.waitForTimeout(360);
        const after = await page.evaluate(TITLE);
        const isDialog = await page.evaluate(`!!document.querySelector('[role="dialog"]')`);
        if (isDialog) {
          // Some entry points open a dialog rather than a screen; audit it as one.
          add(sub.name + ' (dialog)', await page.evaluate(INSPECT));
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
          continue;
        }
        if (after === before) {
          found.push({ where: sub.name, kind: 'unreachable', detail: 'clicking its entry point left the screen on "' + before + '"' });
          continue;
        }
        add(sub.name + ' [' + after + ']', await page.evaluate(INSPECT));
      }
    }

    // ---- pass 3: the setup wizard, walked to the end ----
    if ((!PASS || PASS === 'onboarding') && ONBOARDING_AT.has(vp.w)) {
      // Pass 2 can leave a dialog open or the app on a sub-screen; get properly
      // home first, or the wizard's entry point looks (wrongly) unreachable.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      await page.evaluate(GO_TAB('Overview'));
      await page.waitForTimeout(300);
      const entered = await page.evaluate(clickOutsideNav({ text: 'Set up mine|Set up my household' }));
      if (!entered) {
        found.push({ where: 'onboarding', kind: 'unreachable', detail: 'no "Set up mine" entry on Overview (needs the sample household)' });
      } else {
        await page.waitForTimeout(400);
        await page.evaluate(clickOutsideNav({ text: '.*Set up a new household.*' }));
        await page.waitForTimeout(350);
        const visited = [];
        for (let i = 0; i < 14; i++) {
          const eyebrow = await page.evaluate(`document.querySelector('.bdg-page-header__eyebrow')?.textContent?.trim() ?? ''`);
          const title = await page.evaluate(TITLE);
          visited.push(title);
          add('onboarding: ' + (eyebrow ? eyebrow + ' - ' : '') + title, await page.evaluate(INSPECT));
          // Fill what the step requires before advancing. A wizard that refuses
          // to continue on an empty required field is behaving correctly - the
          // audit is here to find layout and dead ends, not to re-test validation.
          await fillVisibleFields(page);
          const done = await page.evaluate(clickOutsideNav({ text: 'Finish setup' }));
          if (done) { await page.waitForTimeout(900); break; }
          const advanced = await page.evaluate(clickOutsideNav({ text: 'Continue' }));
          if (!advanced) break;
          await page.waitForTimeout(320);
          // A step that refuses to advance (validation) would otherwise loop silently.
          const nowTitle = await page.evaluate(TITLE);
          if (nowTitle === title) {
            const skipped = await page.evaluate(clickOutsideNav({ text: 'Skip for now' }));
            await page.waitForTimeout(320);
            const afterSkip = await page.evaluate(TITLE);
            if (!skipped || afterSkip === title) {
              found.push({ where: 'onboarding: ' + title, kind: 'stuck', detail: 'Continue did not advance and there is no working Skip - the wizard cannot be completed' });
              break;
            }
          }
        }
        const landed = await page.evaluate(TITLE);
        const inApp = await page.evaluate(`!!document.querySelector('.bdg-bottom-nav, .app-side')`);
        if (!inApp) found.push({ where: 'onboarding', kind: 'stuck', detail: 'finished on "' + landed + '" but the app shell is not showing' });
        results.push({ onboardingVisited: visited });
      }
    }
  } catch (e) {
    found.push({ where: '-', kind: 'error', detail: String(e).slice(0, 200) });
  }
  for (const e of pageErrors) found.push({ where: '-', kind: 'console-error', detail: e.slice(0, 200) });
  await ctx.close();

  // One screen's problem is usually every screen's problem; report it once.
  const uniq = [];
  const seen = new Set();
  for (const f of found) {
    const k = f.kind + '|' + f.detail;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(f);
  }
  const failures = uniq.filter((p) => !p.advisory);
  const notes = uniq.filter((p) => p.advisory);
  results.push({ viewport: `${vp.w}x${vp.h}`, name: vp.name, failures, notes });
  const mark = failures.length ? 'FAIL' : ' ok ';
  console.log(`[${mark}] ${String(vp.w).padStart(4)}x${String(vp.h).padEnd(4)} ${vp.name.padEnd(26)} ${failures.length || ''}`);
  for (const p of failures) console.log(`         ${p.where}: ${p.kind} - ${p.detail}`);
  for (const p of notes) console.log(`    note   ${p.where}: ${p.kind} - ${p.detail}`);
}

await browser.close();

const failed = results.reduce((n, r) => n + (r.failures?.length ?? 0), 0);
const noted = results.reduce((n, r) => n + (r.notes?.length ?? 0), 0);
console.log(`\n${failed === 0 ? 'Clean' : failed + ' failure(s)'} across ${results.filter((r) => r.viewport).length} viewport(s)${noted ? `, plus ${noted} advisory note(s)` : ''}.`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ url: URL_, results }, null, 1));
if (failed > 0) process.exitCode = 1;
