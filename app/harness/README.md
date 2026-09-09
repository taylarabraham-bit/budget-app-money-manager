# M12 sync race harness

Regression cover for QA finding **M12** ("a local edit made while a pull is
applying can be reverted and never synced") and its residual window, fixed in
`866b164`. The page at `/harness/` mounts the app's REAL providers with a
gate-controlled in-memory transport, so the exact edit-vs-pull interleavings
replay deterministically instead of by sleeping and hoping.

Dev-server only: `vite build` never bundles this page, so it does not ship.

## Run it

```
npm run dev          # from the repo root (serves 127.0.0.1:5173)
node app/harness/run.mjs
```

Twelve scenarios, six iterations each, all expected green. The run prints a
per-scenario tally, writes `results-run.json` to the current directory, and
**exits non-zero if anything failed** - so CI fails on a red harness instead of
reporting a green job with a failure buried in the log.
`--only <scenario>` runs one; `--iters N` changes the repetition count;
`--out <file>` renames the results file.

Playwright is a dev dependency of the repo, so `npm ci` is enough; the browser
itself comes from `npx playwright install chromium` (cached in
`%LOCALAPPDATA%/ms-playwright`). The driver still falls back to the older
`.ds-sync/node_modules` copy on this PC if it finds one.

CI runs this as its own job after the unit gates pass, at `--iters 3` - these
interleavings are deterministic, not statistical, so repetition buys little
there.

## What red means

Any failure in s2/s3/s5/s6 means the M12 regression is BACK: an edit dispatched
in the same event-loop turn before `applyRecords` runs is being discarded by a
wholesale hydrate/replaceAll again (see `engine.withoutRacedRows` and the
functional updaters in `SyncProvider.applyRecords`). s4 red = the absorbed-
baseline diff broke (the original 98bcd18 fix). s9 red = joining stopped
replacing wholesale (H1 semantics). s10 red = backup import broke. s11 red =
a household tombstone unbinds the device but the choice is painted over with
"online" again (audit SYN-2) - proven to fail without that fix, 0/2. s12 red =
a pull into a still-sample store merges with the sample rows and promotes them
(audit SY-2; 14 bills instead of 1 without the fix). s9 also now checks that a
device adopting the server's household on its own is asked which member it is
(audit OB-1) - without that fix it adopts silently as members[0].

| Scenario | Interleaving it pins |
| --- | --- |
| s1_control | no race - partner row pulls in cleanly |
| s2/s3 | edit dispatched same-stack around the release, before applyRecords |
| s4 | edit lands after applyRecords, before React commits the hydrate |
| s5 | same-row conflict in the window - newer local edit must win everywhere |
| s6 | the real save shape: edit dispatched after an awaited IndexedDB write |
| s7 | edit committed and outboxed before the pull is released |
| s8 | the window with an empty pull |
| s9 | joining a server household still replaces the sample wholesale |
| s10 | backup-import hydrate replaces wholesale and pushes what changed |
| s11 | a household tombstone (partner uploaded their device) ends in a VISIBLE needs-choice, not "online" |
| s12 | one partner bill pulled into a still-sample bills store leaves exactly that bill, never the promoted sample |

The full story (trace evidence, three-commit differential) is in the QA report
artifact `fc02db0d` and the memory note `budget-app-qa-findings`.
