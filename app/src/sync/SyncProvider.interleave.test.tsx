// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { SettingsProvider } from '../data/settings';
import { HouseholdProvider, useHousehold, type HouseholdData } from '../data/store';
import { STORAGE_KEYS } from '../data/persist';
import { AccountsProvider } from '../features/accounts';
import { BillsProvider } from '../features/bills';
import { PaydaysProvider } from '../features/paydays';
import { SettlementsProvider } from '../features/settle';
import { ListsProvider } from '../features/lists';
import { QuickAddProvider } from '../features/quickadd';
import { SyncProvider, useSync } from './SyncProvider';
import { MemoryTransport } from './transport-memory';
import { SYNC_STORAGE_KEY } from './state';
import type { CollectionKey, SyncRecord, SyncTransport } from './types';
import { PRIYA, SAM, category, household, member, purchase } from '../test/fixtures';

// Audit SY-1, with the real providers and a gated in-memory server: a pull's
// records are dispatched, and BEFORE React renders them the user taps something
// that edits the household. The tap used to render alone, the watcher diffed
// the old rows against the rows just absorbed as the new baseline, and the
// outbox filled with a tombstone for the partner's new purchase and a
// fresh-stamped copy of their edited row - pushed on the next launch, deleting
// and reverting the partner's work on every device. Pulled records are now
// committed synchronously (flushSync) before anything else can run. This must
// stay the only click in this jsdom window (see store.lanes.test.tsx).

const SERVER_KEY = 'budget-app.sync.memory.interleave';
const CONFIG = { url: 'memory://interleave', anonKey: 'k'.repeat(24) };
const HH = 'hh_A';
const DEV = 'dev_A';

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

/** Wraps the memory server: `arm()` makes the next pull compute its result and hold; `release()` lets it through. */
class Gated implements SyncTransport {
  readonly inner = new MemoryTransport(SERVER_KEY);
  pushLog: SyncRecord[][] = [];
  private gate: Deferred | null = null;
  private atGate: Deferred | null = null;
  arm(): Promise<void> {
    this.gate = deferred();
    this.atGate = deferred();
    return this.atGate.promise;
  }
  release(): void {
    this.gate?.resolve();
    this.gate = null;
  }
  async pull(householdId: string, cursor?: string) {
    const result = await this.inner.pull(householdId, cursor);
    if (this.gate) {
      const g = this.gate;
      this.atGate?.resolve();
      this.atGate = null;
      await g.promise;
    }
    return result;
  }
  async push(records: SyncRecord[]) {
    this.pushLog.push(records.map((r) => ({ ...r })));
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

type Box = { hh?: ReturnType<typeof useHousehold>; sync?: ReturnType<typeof useSync>; transport?: Gated; commits: number };
const newBox = (): Box => ({ commits: 0 });

function Probe({ box }: { box: Box }) {
  box.hh = useHousehold();
  box.sync = useSync();
  box.commits += 1;
  return (
    <button id="edit" onClick={() => box.hh!.updateTransaction('t_y', { title: 'CLICK EDIT' })}>
      edit
    </button>
  );
}

const roots: Root[] = [];
function mount(box: Box): Root {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const createTransport = () => (box.transport = new Gated());
  root.render(
    <SettingsProvider>
      <HouseholdProvider>
        <BillsProvider>
          <PaydaysProvider>
            <AccountsProvider>
              <SettlementsProvider>
                <ListsProvider>
                  <QuickAddProvider>
                    <SyncProvider pollMs={9_999_999} createTransport={createTransport}>
                      <Probe box={box} />
                    </SyncProvider>
                  </QuickAddProvider>
                </ListsProvider>
              </SettlementsProvider>
            </AccountsProvider>
          </PaydaysProvider>
        </BillsProvider>
      </HouseholdProvider>
    </SettingsProvider>,
  );
  return root;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const micro = async (n: number) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};
async function waitFor(label: string, cond: () => boolean, timeoutMs = 8_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${label}`);
    await sleep(10);
  }
}
const online = (box: Box) => () => box.sync?.status === 'online';
async function settle(box: Box) {
  await sleep(500);
  await waitFor('settled', () => box.sync!.status === 'online' && box.sync!.pending === 0, 10_000);
}

type Blob = HouseholdData & { version: 1; savedAt: string };
const blob = (): Blob => ({
  version: 1,
  savedAt: '2026-08-30T10:00:00.000Z',
  household: household({ id: HH, name: 'A home' }),
  members: [member(PRIYA), member(SAM, { color: 'sky' })],
  categories: [category('groceries'), category('pay', { kind: 'income', limit: 0 })],
  transactions: [purchase('t_x', 10), purchase('t_y', 20)],
  goals: [],
  goalContributions: [],
});
const rec = <T extends { id: string }>(collection: CollectionKey, data: T, over: Partial<SyncRecord> = {}): SyncRecord => ({ householdId: HH, collection, id: data.id, data, updatedAt: '2026-08-30T09:00:00.000Z', deleted: false, deviceId: 'dev_B', ...over });
const titleOf = (r: SyncRecord | undefined) => (r?.data as { title?: string } | null | undefined)?.title;
const serverRecordsFor = (d: HouseholdData): SyncRecord[] => [rec('household', d.household), ...d.members.map((m) => rec('members', m)), ...d.categories.map((c) => rec('categories', c)), ...d.transactions.map((t) => rec('transactions', t))];
const seedServer = async (records: SyncRecord[]) => {
  await new MemoryTransport(SERVER_KEY).push(records);
};
const seedDevice = (b: Blob) => {
  localStorage.setItem(STORAGE_KEYS.household, JSON.stringify(b));
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ version: 1, deviceId: DEV, config: CONFIG, householdId: HH, outbox: [] }));
};
const syncStateOnDisk = () => JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY)!) as { cursor?: string; outbox: SyncRecord[] };
const blobOnDisk = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.household)!) as Blob;
const serverRows = (c: CollectionKey) => new MemoryTransport(SERVER_KEY).all().filter((r) => r.collection === c);

const errors: string[] = [];
const onError = (e: ErrorEvent) => {
  errors.push(e.message);
  e.preventDefault();
};

beforeEach(() => {
  localStorage.clear();
  errors.length = 0;
  window.addEventListener('error', onError);
  if (document.visibilityState !== 'visible') Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(() => {
  window.removeEventListener('error', onError);
  for (const r of roots.splice(0)) r.unmount();
  document.body.innerHTML = '';
});

/** Partner rows on the server, a pull held at the gate, released; returns once the pull's continuation is queued (React not yet rendered). */
async function pullHeldThenReleased(box: Box, data: Blob) {
  const now = new Date().toISOString();
  await box.transport!.inner.push([rec('transactions', purchase('t_partner', 33, { title: 'PARTNER NEW' }), { updatedAt: now }), rec('transactions', { ...data.transactions[0]!, title: 'PARTNER EDIT X' }, { updatedAt: now })]);
  await sleep(30);
  const at = box.transport!.arm();
  void box.sync!.syncNow().catch(() => undefined);
  await at;
  box.transport!.release();
}

describe('a tap landing while a pull is being applied (audit SY-1)', () => {
  it('keeps the partner rows, pushes no tombstone, and a relaunch changes nothing', async () => {
    const box = newBox();
    const data = blob();
    seedDevice(data);
    await seedServer(serverRecordsFor(data));
    const root = mount(box);
    await waitFor('online', online(box));
    await settle(box);
    await pullHeldThenReleased(box, data);
    // The click lands in the same turn as the release: before the pull's continuation runs.
    document.getElementById('edit')!.click();
    await micro(6);
    await sleep(80);

    expect(errors.filter((m) => /Maximum update depth/.test(m))).toEqual([]);
    const disk = blobOnDisk();
    expect(disk.transactions.some((t) => t.id === 't_partner')).toBe(true);
    expect(disk.transactions.find((t) => t.id === 't_x')!.title).toBe('PARTNER EDIT X');
    expect(disk.transactions.find((t) => t.id === 't_y')!.title).toBe('CLICK EDIT');
    const outbox = syncStateOnDisk().outbox;
    expect(outbox.filter((r) => r.deleted)).toEqual([]);
    expect(outbox.map((r) => r.id)).toEqual(['t_y']);
    await settle(box);
    expect(box.transport!.pushLog.flat().filter((r) => r.deleted)).toEqual([]);

    // "Relaunch" on the same device storage: nothing corrupt was left behind to push.
    root.unmount();
    roots.splice(roots.indexOf(root), 1);
    document.body.innerHTML = '';
    const box2 = newBox();
    mount(box2);
    await waitFor('online after relaunch', online(box2));
    await settle(box2);
    const partner = serverRows('transactions').find((r) => r.id === 't_partner')!;
    const x = serverRows('transactions').find((r) => r.id === 't_x')!;
    const y = serverRows('transactions').find((r) => r.id === 't_y')!;
    expect(partner.deleted).toBe(false);
    expect(partner.deviceId).toBe('dev_B');
    expect(titleOf(x)).toBe('PARTNER EDIT X');
    expect(x.deviceId).toBe('dev_B');
    expect(titleOf(y)).toBe('CLICK EDIT');
    expect(box2.hh!.transactions.some((t) => t.id === 't_partner')).toBe(true);
    expect(box2.transport!.pushLog.flat().filter((r) => r.deleted)).toEqual([]);
  }, 30_000);
});
