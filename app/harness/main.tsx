// M12 race harness. Mounts the app's REAL providers with a gate-controlled
// in-memory transport, so "a local edit lands while a pull is applying" can be
// replayed at exact interleaving points instead of by sleeping and hoping.
// One scenario per page load (the driver gives each run a fresh browser
// context); all timing-sensitive code lives here so both worktrees (fixed
// HEAD and pre-fix 7925be1) execute byte-identical logic.
//
// Interface rule (per budget-app-81): touch ONLY the transport promise and the
// public store/sync APIs - those are identical on both sides of the 98bcd18 fix.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { STORAGE_KEYS } from '../src/data/persist';
import { SettingsProvider } from '../src/data/settings';
import { HouseholdProvider, useHousehold } from '../src/data/store';
import { putReceipt } from '../src/data/receipts';
import { AccountsProvider, useAccounts } from '../src/features/accounts';
import { BillsProvider, useBills } from '../src/features/bills';
import { PaydaysProvider } from '../src/features/paydays';
import { SettlementsProvider } from '../src/features/settle';
import { ListsProvider } from '../src/features/lists';
import { QuickAddProvider } from '../src/features/quickadd';
import { MemoryTransport, SYNC_STORAGE_KEY, SyncProvider, useSync } from '../src/sync';
import type { SyncRecord, SyncTransport } from '../src/sync';

// A build may carry default server details (app/.env.local). The harness must
// never auto-connect to them: `disconnected` makes the provider ignore build
// defaults until a scenario connects explicitly - and every connection here
// goes through the gated in-memory transport, so no real server is ever touched.
localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ version: 1, deviceId: 'dev_harness', outbox: [], disconnected: true }));

const RACED = 'RACED LOCAL EDIT';
const PARTNER = 'PARTNER EDIT';
const PARTNER_NEW = 'PARTNER NEW ROW';
const PARTNER_NEW_ID = 't_partner_new';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the probe bag is deliberately untyped
const H: Record<string, any> = { trace: [], targets: {}, consoleErrors: [] };
(window as unknown as Record<string, unknown>).__h = H;
const mark = (kind: string, extra?: Record<string, unknown>) => H.trace.push({ t: Math.round(performance.now() * 10) / 10, kind, ...extra });

window.addEventListener('error', (e) => H.consoleErrors.push(String(e.message)));
const origError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  H.consoleErrors.push(args.map(String).join(' '));
  origError(...args);
};

/**
 * Wraps the real MemoryTransport. `arm()` makes the NEXT pull compute its
 * result, then hold just before returning it to the provider; `release()` lets
 * it through. Everything after release happens on the normal microtask path,
 * so code run synchronously after release() executes BEFORE applyRecords.
 * Realtime is muted: pulls happen only when the harness asks.
 */
class GatedTransport implements SyncTransport {
  readonly inner = new MemoryTransport();
  pushLog: SyncRecord[][] = [];
  pullCount = 0;
  private gate: Deferred | null = null;
  private atGate: Deferred | null = null;

  /** Resolves when the armed pull is holding (result already computed). */
  arm(): Promise<void> {
    this.gate = deferred();
    this.atGate = deferred();
    mark('arm');
    return this.atGate.promise;
  }
  release(): void {
    mark('release');
    this.gate?.resolve();
    this.gate = null;
  }
  async pull(householdId: string, cursor?: string) {
    const result = await this.inner.pull(householdId, cursor);
    this.pullCount += 1;
    if (this.gate) {
      const g = this.gate;
      mark('pull-holding', { records: result.records.length });
      this.atGate?.resolve();
      this.atGate = null;
      await g.promise;
      mark('pull-released');
    }
    return result;
  }
  async push(records: SyncRecord[]) {
    this.pushLog.push(records.map((r) => ({ ...r })));
    mark('push', { n: records.length });
    return this.inner.push(records);
  }
  ping() {
    return this.inner.ping();
  }
  listHouseholds() {
    return this.inner.listHouseholds();
  }
  deleteHousehold(id: string) {
    return this.inner.deleteHousehold(id);
  }
  subscribe() {
    return () => undefined;
  }
}

function Probe() {
  const hh = useHousehold();
  const sync = useSync();
  const bills = useBills();
  const accounts = useAccounts();
  H.hh = hh;
  H.sync = sync;
  H.bills = bills.bills;
  H.billsSample = bills.isSample;
  H.accounts = accounts.accounts;
  H.accountTransfers = accounts.transfers;
  useEffect(() => {
    const titleOf = (id: string | undefined) => (id ? hh.transactions.find((t) => t.id === id)?.title : undefined);
    mark('commit', { X: titleOf(H.targets.X), Y: titleOf(H.targets.Y), pending: sync.pending, status: sync.status, sample: hh.isSample });
  });
  // A real button: a click on it is a DISCRETE event, which React renders ahead of
  // anything dispatched from a promise continuation - the lane split behind SY-1.
  return (
    <button id="h-edit" type="button" onClick={() => editRow(H.targets.Y)}>
      edit Y
    </button>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const micro = async (n: number) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};
async function waitFor(label: string, cond: () => boolean, timeoutMs = 10_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${label}`);
    await sleep(25);
  }
}

const editRow = (id: string) => {
  mark('dispatch-edit', { id });
  H.hh.updateTransaction(id, { title: RACED, note: 'raced' });
};

/** Adopt the sample as a real household, connect to the empty in-memory server, pick target rows. */
async function seedAndConnect(): Promise<GatedTransport> {
  H.hh.updateHousehold({ name: 'Harness Home' });
  await waitFor('sample adopted', () => !H.hh.isSample);
  const outcome = await H.sync.connect({ url: 'memory://m12-harness', anonKey: 'harness' });
  if (outcome.outcome !== 'uploaded') throw new Error(`expected first connect to upload, got ${outcome.outcome}`);
  await waitFor('first upload drained', () => H.sync.pending === 0 && H.sync.status === 'online');
  const t: GatedTransport = H.transport;
  const txs = H.hh.transactions;
  if (txs.length < 2) throw new Error('sample data has too few transactions');
  H.targets = { X: txs[0].id, Y: txs[1].id };
  mark('seeded', { txCount: txs.length, server: t.inner.all().length });
  return t;
}

/**
 * Server-side partner edit of `rowId` via the inner transport (no gate, no push
 * log). Stamped `now`: strictly newer than the seed upload (so the memory
 * server's LWW stores it), and the 60 ms pause makes any later local edit
 * strictly newer than it - deterministic ordering without faking clocks.
 */
async function stagePartner(t: GatedTransport, rowId: string) {
  const row = H.hh.transactions.find((r: { id: string }) => r.id === rowId);
  const rec: SyncRecord = {
    householdId: H.sync.householdId,
    collection: 'transactions',
    id: rowId,
    data: { ...row, title: PARTNER },
    updatedAt: new Date().toISOString(),
    deleted: false,
    deviceId: 'dev_partner',
  };
  await t.inner.push([rec]);
  await sleep(60);
  mark('partner-staged', { id: rowId });
}

/** A NEW partner row on the server (the kind SY-1's watcher diff turned into a tombstone). */
async function stagePartnerNew(t: GatedTransport) {
  const template = H.hh.transactions[0];
  const rec: SyncRecord = {
    householdId: H.sync.householdId,
    collection: 'transactions',
    id: PARTNER_NEW_ID,
    data: { ...template, id: PARTNER_NEW_ID, title: PARTNER_NEW },
    updatedAt: new Date().toISOString(),
    deleted: false,
    deviceId: 'dev_partner',
  };
  await t.inner.push([rec]);
  await sleep(60);
  mark('partner-new-staged');
}

/** Arm the gate and kick a sync; resolves when the pull is holding with its result computed. */
function armAndStartSync(t: GatedTransport): Promise<void> {
  const at = t.arm();
  void H.sync.syncNow().catch(() => undefined);
  return at;
}

/** Let debounced pushes fire, drain the chain, then one final round trip so server winners land locally. */
async function settle() {
  await sleep(700);
  await waitFor('chain settled', () => H.sync.status === 'online' && H.sync.pending === 0, 15_000);
  await H.sync.syncNow();
  await sleep(700);
  await waitFor('drained after final sync', () => H.sync.status === 'online' && H.sync.pending === 0, 15_000);
  await H.sync.syncNow();
  await waitFor('final pull applied', () => H.sync.status === 'online', 15_000);
  mark('settled');
}

function facts(t: GatedTransport) {
  const find = (id: string) => H.hh.transactions.find((r: { id: string }) => r.id === id);
  const server = t.inner.all();
  const onServer = (id: string) => server.find((r) => r.collection === 'transactions' && r.id === id);
  const stateY = find(H.targets.Y);
  const stateX = find(H.targets.X);
  const commits = H.trace.filter((e: { kind: string }) => e.kind === 'commit');
  return {
    editInState: stateY?.title === RACED || stateX?.title === RACED,
    editYInState: stateY?.title === RACED,
    editXInState: stateX?.title === RACED,
    editOnServer: (onServer(H.targets.Y)?.data as { title?: string } | null)?.title === RACED || (onServer(H.targets.X)?.data as { title?: string } | null)?.title === RACED,
    editEverPushed: t.pushLog.some((batch) => batch.some((r) => (r.data as { title?: string } | null)?.title === RACED)),
    partnerXInState: stateX?.title === PARTNER,
    partnerXOnServer: (onServer(H.targets.X)?.data as { title?: string } | null)?.title === PARTNER,
    partnerNewInState: find(PARTNER_NEW_ID)?.title === PARTNER_NEW,
    partnerNewOnServer: !!onServer(PARTNER_NEW_ID) && !onServer(PARTNER_NEW_ID)!.deleted,
    tombstonesPushed: t.pushLog.flat().filter((r) => r.deleted).length,
    editEverCommitted: commits.some((c: { Y?: string; X?: string }) => c.Y === RACED || c.X === RACED),
    editInFinalCommit: commits.length > 0 && [commits[commits.length - 1]].some((c: { Y?: string; X?: string }) => c.Y === RACED || c.X === RACED),
    txCount: H.hh.transactions.length,
    serverTxCount: server.filter((r) => r.collection === 'transactions' && !r.deleted).length,
    pending: H.sync.pending,
    needsIdentity: H.sync.needsIdentity,
    billsCount: H.bills.length,
    billsOnlyPartner: H.bills.length === 1 && H.bills[0]?.id === 'b_partner',
    status: H.sync.status,
    consoleErrors: H.consoleErrors.slice(),
  };
}

type Scenario = (t: GatedTransport) => Promise<void>;
const scenarios: Record<string, Scenario> = {
  /** Control: no race at all. Edit settles fully, then the partner row pulls in. */
  s1_control: async (t) => {
    editRow(H.targets.Y);
    await sleep(700);
    await waitFor('edit pushed', () => H.sync.pending === 0);
    await stagePartner(t, H.targets.X);
    await H.sync.syncNow();
  },
  /** THE M12 window: edit dispatched, gate released, same stack - the edit's setState is queued before applyRecords runs, with no commit in between. */
  s2_dispatch_then_release: async (t) => {
    await stagePartner(t, H.targets.X);
    await armAndStartSync(t);
    editRow(H.targets.Y);
    t.release();
  },
  /** Same window, opposite order in the same stack: release first, then dispatch. Still lands before applyRecords (both precede the microtask queue). */
  s3_release_then_dispatch: async (t) => {
    await stagePartner(t, H.targets.X);
    await armAndStartSync(t);
    t.release();
    editRow(H.targets.Y);
  },
  /** Edit dispatched a few microtasks AFTER applyRecords ran, before React commits the hydrate. */
  s4_dispatch_after_apply: async (t) => {
    await stagePartner(t, H.targets.X);
    await armAndStartSync(t);
    t.release();
    await micro(8);
    editRow(H.targets.Y);
  },
  /** Same-row conflict inside the window: the pull carries an older partner edit of X; the local edit of X is newer and must win everywhere. */
  s5_same_row_conflict: async (t) => {
    await stagePartner(t, H.targets.X);
    await armAndStartSync(t);
    editRow(H.targets.X);
    t.release();
  },
  /** The QA-cited provenance: the save awaits a real IndexedDB receipt write first, then dispatches - gate released in the same continuation. */
  s6_idb_provenance: async (t) => {
    await stagePartner(t, H.targets.X);
    await armAndStartSync(t);
    await putReceipt(H.targets.Y, new Blob(['harness receipt'], { type: 'image/jpeg' }));
    editRow(H.targets.Y);
    t.release();
  },
  /** Edit fully committed and enqueued BEFORE the held pull is released - the outbox path must protect it. */
  s7_edit_committed_before_release: async (t) => {
    await stagePartner(t, H.targets.X);
    await armAndStartSync(t);
    editRow(H.targets.Y);
    await waitFor('edit enqueued', () => H.sync.pending > 0);
    t.release();
  },
  /** The window with an EMPTY pull (nothing staged): applyRecords has nothing to apply, the edit must survive untouched. */
  s8_empty_pull: async (t) => {
    await armAndStartSync(t);
    editRow(H.targets.Y);
    t.release();
  },
  /** H1 semantics on the new code path: joining a server household must still REPLACE the sample wholesale - no ghosts. */
  s9_join_replace: async () => {
    const sampleTxIds = new Set(H.hh.transactions.map((r: { id: string }) => r.id));
    const sampleMemberIds = new Set(H.hh.members.map((r: { id: string }) => r.id));
    const clone = (row: object, patch: object) => JSON.parse(JSON.stringify({ ...row, ...patch }));
    const now = new Date().toISOString();
    const rec = (collection: string, data: { id: string }) => ({ householdId: 'hh_server', collection, id: data.id, data, updatedAt: now, deleted: false, deviceId: 'dev_partner' });
    H.seedRecords = [
      rec('household', clone(H.hh.household, { id: 'hh_server', name: 'Server Home' })),
      rec('members', clone(H.hh.members[0], { id: 'm_srv1', name: 'Srv One' })),
      rec('members', clone(H.hh.members[1] ?? H.hh.members[0], { id: 'm_srv2', name: 'Srv Two' })),
      rec('categories', clone(H.hh.categories[0], { id: 'c_srv', name: 'Srv Cat' })),
      rec('transactions', clone(H.hh.transactions[0], { id: 't_srv1', title: 'SERVER TX', categoryId: 'c_srv', memberId: 'm_srv1', loggedBy: 'm_srv1' })),
      rec('transactions', clone(H.hh.transactions[1], { id: 't_srv2', title: 'SERVER TX 2', categoryId: 'c_srv', memberId: 'm_srv2', loggedBy: 'm_srv2' })),
    ];
    const outcome = await H.sync.connect({ url: 'memory://m12-join', anonKey: 'harness' });
    if (outcome.outcome !== 'joined') throw new Error(`expected joined, got ${outcome.outcome}`);
    await waitFor('join drained', () => H.sync.pending === 0 && H.sync.status === 'online');
    H.targets = { X: 't_srv1', Y: 't_srv2' };
    const tx = H.hh.transactions;
    if (H.hh.household.id !== 'hh_server') throw new Error(`household id not adopted: ${H.hh.household.id}`);
    if (tx.length !== 2 || tx.some((r: { id: string }) => sampleTxIds.has(r.id))) throw new Error(`join merged instead of replaced: ${tx.length} tx`);
    if (H.hh.members.some((r: { id: string }) => sampleMemberIds.has(r.id))) throw new Error('sample member ghosts survived the join');
    if (H.bills.length !== 0) throw new Error(`join kept ${H.bills.length} sample bills`);
    // Accounts sync as two more collections; a join must replace them wholesale too.
    if (H.accounts.length !== 0) throw new Error(`join kept ${H.accounts.length} sample accounts`);
    if (H.accountTransfers.length !== 0) throw new Error(`join kept ${H.accountTransfers.length} sample account transfers`);
  },
  /**
   * A household tombstone pulled while bound (the partner "uploaded this device's
   * data") must leave the device in needs-choice with the choice VISIBLE - the
   * sync/start/household-effect callers used to paint "online" over it, so every
   * edit until the next restart was saved locally and never queued (audit SYN-2).
   */
  s11_tombstone_unbind: async (t: GatedTransport) => {
    const householdId = H.sync.householdId;
    const now = new Date().toISOString();
    // The partner's "upload this device's data" leaves TWO things on the server: a
    // tombstone for the household this device mirrors, and the partner's live
    // replacement under a new id. With only the tombstone the server would look
    // empty and this device would simply re-upload - no choice to hide.
    const replacement = JSON.parse(JSON.stringify({ ...H.hh.household, id: 'hh_partner_new', name: 'Partner Home' }));
    await t.inner.push([
      { householdId, collection: 'household', id: householdId, data: null, updatedAt: now, deleted: true, deviceId: 'dev_partner' },
      { householdId: 'hh_partner_new', collection: 'household', id: 'hh_partner_new', data: replacement, updatedAt: now, deleted: false, deviceId: 'dev_partner' },
    ]);
    mark('tombstone-staged', { householdId });
    await H.sync.syncNow();
    await waitFor('choice visible after tombstone', () => H.sync.status === 'needs-choice', 15_000);
    mark('needs-choice', { status: H.sync.status, householdId: H.sync.householdId ?? null });
  },
  /**
   * The mixed-state trap (audit SY-2): the household is real but the BILLS store
   * still shows the sample. Pulling ONE partner bill used to merge it into the
   * sample rows and commit - promoting all 13 sample bills to real. The store
   * must end holding exactly the server's bills.
   */
  s12_sample_store_pull: async (t: GatedTransport) => {
    if (H.billsSample !== true) throw new Error('precondition: bills store should still be sample');
    const sampleBill = JSON.parse(JSON.stringify(H.bills[0]));
    const partnerBill = { ...sampleBill, id: 'b_partner', name: 'PARTNER BILL' };
    await t.inner.push([{ householdId: H.sync.householdId, collection: 'bills', id: 'b_partner', data: partnerBill, updatedAt: new Date().toISOString(), deleted: false, deviceId: 'dev_partner' }]);
    mark('partner-bill-staged');
    await H.sync.syncNow();
    await waitFor('partner bill arrived', () => H.bills.some((b: { id: string }) => b.id === 'b_partner'), 15_000);
    mark('bills-after-pull', { count: H.bills.length, sample: H.billsSample });
  },
  /**
   * A DISCRETE tap - a real click, which React renders ahead of anything dispatched
   * from a promise continuation - landing after the gate is released but before the
   * pull's continuation runs. The tap used to render alone; at that commit the
   * watcher diffed the OLD rows against the rows just absorbed as the baseline, and
   * the outbox filled with a tombstone for the partner's new row, an old-content
   * copy of their edited one, and a nested-update crash (audit SY-1). Pulled records
   * now commit synchronously, so the tap's commit already holds them.
   */
  s13_discrete_click: async (t) => {
    await stagePartner(t, H.targets.X);
    await stagePartnerNew(t);
    await armAndStartSync(t);
    t.release();
    (document.getElementById('h-edit') as HTMLButtonElement).click();
  },
  /**
   * Another tab writes a STALE household blob (it had not seen the partner's pulled
   * rows yet) and this tab adopts it through the storage event. Diffing the adopted
   * rows against the baseline used to enqueue a tombstone for the partner's new row
   * and re-stamp their edit with this tab's clock, deleting and reverting it on the
   * server and then on their phone (audit SY-3 / SYN-4). Adopted rows are the new
   * baseline instead; the stale tab catches up on its own next pull.
   */
  s14_stale_tab_adoption: async (t) => {
    const before = JSON.parse(JSON.stringify(H.hh.transactions));
    await stagePartner(t, H.targets.X);
    await stagePartnerNew(t);
    await H.sync.syncNow();
    await waitFor('partner rows pulled', () => H.hh.transactions.some((r: { id: string }) => r.id === PARTNER_NEW_ID), 15_000);
    const stale = JSON.parse(localStorage.getItem(STORAGE_KEYS.household)!);
    stale.transactions = before; // no partner row, X unedited - what the other tab still holds
    stale.savedAt = new Date().toISOString();
    const raw = JSON.stringify(stale);
    localStorage.setItem(STORAGE_KEYS.household, raw);
    mark('stale-blob-written');
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.household, newValue: raw, storageArea: localStorage }));
  },
  /** Backup import: the plain-data hydrate form must still replace wholesale, and the watcher must push what changed. */
  s10_backup_import: async () => {
    const data = JSON.parse(
      JSON.stringify({ household: H.hh.household, members: H.hh.members, categories: H.hh.categories, transactions: H.hh.transactions, goals: H.hh.goals, goalContributions: H.hh.goalContributions }),
    );
    const restored = data.transactions.find((r: { id: string }) => r.id === H.targets.Y);
    restored.title = RACED;
    mark('hydrate-import');
    H.hh.hydrate(data);
  },
};

H.run = async (name: string) => {
  const fn = scenarios[name];
  if (!fn) throw new Error(`unknown scenario: ${name}`);
  // s9 connects for itself (it must stay on the sample to exercise the join).
  const t = name === 's9_join_replace' ? (null as unknown as GatedTransport) : await seedAndConnect();
  mark('scenario-start', { name });
  await fn(t);
  // s11 ends in needs-choice by design; settle() waits for 'online'.
  if (name !== 's11_tombstone_unbind') await settle();
  return { facts: facts(H.transport), trace: H.trace };
};
H.scenarioNames = Object.keys(scenarios);

function App() {
  return (
    <SettingsProvider>
      <HouseholdProvider>
        <BillsProvider>
          <PaydaysProvider>
            <AccountsProvider>
              <SettlementsProvider>
                <ListsProvider>
                  <QuickAddProvider>
                    <SyncProvider
                      pollMs={9_999_999}
                      createTransport={() => {
                        const t = new GatedTransport();
                        // s9 pre-seeds the "server" with a household to join. push() is
                        // synchronous inside, so it lands before connect() first awaits.
                        if (H.seedRecords) void t.inner.push(H.seedRecords);
                        H.transport = t;
                        return t;
                      }}
                    >
                      <Probe />
                    </SyncProvider>
                  </QuickAddProvider>
                </ListsProvider>
              </SettlementsProvider>
            </AccountsProvider>
          </PaydaysProvider>
        </BillsProvider>
      </HouseholdProvider>
    </SettingsProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
document.getElementById('log')!.textContent = 'M12 harness mounted.';
