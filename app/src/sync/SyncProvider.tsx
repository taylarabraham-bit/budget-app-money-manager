import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { isNativeShell } from '../data/durable';
import { onStorageAdoption } from '../data/persist';
import { pruneReceipts } from '../data/receipts';
import { HOUSEHOLD_ROW_GUARDS, useHousehold, type HouseholdData } from '../data/store';
import type { Household } from '../data/types';
import { isAccount, isAccountTransfer, useAccounts, type Account, type AccountTransfer } from '../features/accounts';
import { isBill, useBills, type Bill } from '../features/bills';
import { isListItem, useLists, type ListItem } from '../features/lists';
import { isIncomeSchedule, usePaydays, type IncomeSchedule } from '../features/paydays';
import { isQuickAdd, useQuickAdds, type QuickAdd } from '../features/quickadd';
import { isSettlement, useSettlements, type Settlement } from '../features/settle';
import { cursorOf, diffRows, enqueue, groupByCollection, mergeRemote, outboxKey, recordsForAll, toMap, withoutRacedRows, type Outbox, type RowMap } from './engine';
import { loadSyncState, saveSyncState, type RejectedRecord, type SyncState } from './state';
import { MemoryTransport } from './transport-memory';
import { COLLECTIONS, SCHEMA_TAG, type CollectionKey, type Row, type ServerHousehold, type SyncConfig, type SyncRecord, type SyncStatus, type SyncTransport } from './types';

// Orchestrates sync for every store without changing any of them: it reads
// their rows through the public hooks, turns changes into outbox records,
// pushes them when the server is reachable, and applies pulled records back
// through the stores' own replaceAll / hydrate. See engine.ts for the rules.

/** What the first connection decided - the setup wizard branches on this. */
export type ConnectOutcome =
  /** This device adopted the household already on the server. */
  | { outcome: 'joined'; household: ServerHousehold }
  /** The server was empty and this device's data is now the household. */
  | { outcome: 'uploaded' }
  /** The server was empty and this device still shows the sample: nothing uploaded yet, the first real edit (or the wizard's Finish) will be. */
  | { outcome: 'empty' }
  /** Same household on both sides: merged. */
  | { outcome: 'merged' }
  /** Reconnected to the household this device already mirrored. */
  | { outcome: 'reconnected' }
  /** Both sides hold different households: adoptServer() or uploadLocal() must decide. */
  | { outcome: 'needs-choice'; household: ServerHousehold };

export interface SyncApi {
  status: SyncStatus;
  config: SyncConfig | null;
  /** Household this device mirrors (once the first connection is resolved). */
  householdId?: string;
  lastSyncedAt?: string;
  /** Changes waiting to reach the server. */
  pending: number;
  /** Changes the server refused outright (not a network failure) and will not take as they are - parked so everything else keeps flowing (audit SEC-4). */
  rejected: number;
  error?: string;
  /** Minutes this device's clock differs from the server's (signed; only set when it matters). Conflicts resolve by timestamp, so a wrong clock wins/loses unfairly. */
  clockSkewMinutes?: number;
  /** In `needs-choice`: the household the server holds. */
  serverHousehold?: ServerHousehold;
  /** The device adopted a household on its own and still has to be told which member it is (audit OB-1). */
  needsIdentity: boolean;
  /** The member picker was answered (App's dialog or the join wizard). */
  identityChosen: () => void;
  /** Save the server details and start syncing; resolves with what the first connection decided. Rejects with a readable message when the server cannot be reached. */
  connect: (config: SyncConfig) => Promise<ConnectOutcome>;
  /** Stop syncing and forget the server. Data on this device stays; so do its unsent changes, which go through on a reconnect to the same household. */
  disconnect: () => void;
  syncNow: () => Promise<void>;
  /** needs-choice: replace this device's data with the server's household. */
  adoptServer: () => Promise<void>;
  /** needs-choice: make this device's data the household on the server. */
  uploadLocal: () => Promise<void>;
  /** Put the rejected changes back in the queue (after the server or the app was fixed). */
  retryRejected: () => void;
  /** Forget the rejected changes; the server's copies stand. */
  discardRejected: () => void;
}

const SyncContext = createContext<SyncApi | null>(null);

const HOUSEHOLD_COLLECTIONS: readonly CollectionKey[] = ['household', 'members', 'categories', 'transactions', 'goals', 'goalContributions'];
const PUSH_DEBOUNCE_MS = 400;
const REALTIME_DEBOUNCE_MS = 300;
/** Loses every per-row LWW conflict on the server - see uploadAll. */
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

interface UiState {
  status: SyncStatus;
  error?: string;
  lastSyncedAt?: string;
  pending: number;
  rejected: number;
  clockSkewMinutes?: number;
  serverHousehold?: ServerHousehold;
  needsIdentity?: boolean;
}

/** Warn when the device clock is at least this far off the server's (LWW runs on wall clocks - M10). From here on, this device stamps its changes in SERVER time (audit SEC-2). */
const SKEW_WARN_MS = 3 * 60_000;
/** How often the server clock is re-read while syncing. */
const SKEW_SAMPLE_MS = 10 * 60_000;

/** Shape guards per collection: pulled records must parse before they merge (QA SY-5/SY-11). */
const ROW_GUARDS: Record<CollectionKey, (x: unknown) => boolean> = {
  ...HOUSEHOLD_ROW_GUARDS,
  bills: isBill,
  settlements: isSettlement,
  paydays: isIncomeSchedule,
  lists: isListItem,
  quickAdds: isQuickAdd,
  accounts: isAccount,
  accountTransfers: isAccountTransfer,
};

/**
 * Drop pulled records whose data fails the collection's shape guard - a newer
 * build's row this build cannot parse, or a corrupt one. Dropping (not
 * tombstoning) matters twice over: merged into state it would crash renders
 * (QA SY-11), and absorbed into a baseline that the filtered store then
 * doesn't hold, the watcher would diff it into a DELETE that erases the
 * partner's row everywhere (QA SY-5). Tombstones carry no data and pass. A row
 * whose data names another id than the record does is dropped too: merged
 * under the record's key it would be a row the stores could never address.
 */
const parseableRecords = (records: SyncRecord[]): SyncRecord[] => records.filter((r) => r.deleted || r.data == null || (r.data.id === r.id && ROW_GUARDS[r.collection]?.(r.data) === true));

/**
 * `memory://<name>` server URLs run against an in-browser "server" persisted in
 * localStorage - for trying the whole two-device story (join, merge, conflict)
 * on one machine without a real Supabase. Anything else is a Supabase server,
 * whose client (the heaviest dependency in the bundle) loads only when one is
 * actually configured.
 */
const defaultTransport = async (c: SyncConfig): Promise<SyncTransport> => {
  if (c.url.startsWith('memory://')) return new MemoryTransport(`budget-app.sync.memory.${c.url.slice('memory://'.length) || 'default'}`);
  const { SupabaseTransport } = await import('./transport-supabase');
  return new SupabaseTransport(c);
};

const isNetworkError = (e: unknown) => /fetch|network|ECONN|timeout|timed out|Load failed|NetworkError/i.test(e instanceof Error ? e.message : String(e));
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Turn the browser's bare "Failed to fetch" (and the API's key errors) into a sentence a person can act on. */
function readableError(e: unknown, url: string): string {
  const message = messageOf(e);
  // The packaged app runs from an https origin, so a plain http:// server is
  // refused as mixed content before any packet leaves - blaming Tailscale for
  // that would send the user chasing the wrong thing (audit INF-4).
  if (isNetworkError(e) && isNativeShell() && /^http:\/\//i.test(url.trim())) return `Inside the app the server address must start with https:// - use the laptop's tailscale serve address (https://laptop.tail1234.ts.net), not ${url}.`;
  if (isNetworkError(e)) return `Couldn't reach ${url}. Check that this device is on Tailscale and the laptop is awake.`;
  if (/api key|apikey|jwt|401|403|unauthori[sz]ed/i.test(message)) return `The server refused the key (${message}). Copy the anon key again from the laptop's .env.`;
  return message;
}

interface SyncProviderProps {
  children: ReactNode;
  /** Swap the backend (tests use MemoryTransport). Default: Supabase. */
  createTransport?: (config: SyncConfig) => SyncTransport | Promise<SyncTransport>;
  /** How often to pull while the app is visible. Default 30 s. */
  pollMs?: number;
}

export function SyncProvider({ children, createTransport = defaultTransport, pollMs = 30_000 }: SyncProviderProps) {
  const hh = useHousehold();
  const billsStore = useBills();
  const settleStore = useSettlements();
  const paydaysStore = usePaydays();
  const listsStore = useLists();
  const quickStore = useQuickAdds();
  const accountsStore = useAccounts();

  const [initial] = useState(() => {
    const loaded = loadSyncState();
    // A build can carry default server details (app/.env.local); they apply until the user connects or disconnects in Settings.
    const url = import.meta.env.VITE_SUPABASE_URL?.trim();
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
    if (!loaded.config && url && anonKey && !loaded.disconnected) loaded.config = { url, anonKey };
    // A build whose row guards or collections differ from the one that advanced
    // the cursor pulls from the start again: records the older build dropped at
    // the door would otherwise never arrive (audit SYN-3 / SY-10). Idempotent.
    if (loaded.schema !== SCHEMA_TAG) {
      loaded.cursor = undefined;
      loaded.schema = SCHEMA_TAG;
    }
    return loaded;
  });
  const stateRef = useRef<SyncState>(initial);
  const outboxRef = useRef<Outbox>(new Map(initial.outbox.map((r) => [outboxKey(r.collection, r.id), r])));
  const transportRef = useRef<SyncTransport | null>(null);
  const baselineRef = useRef(new Map<CollectionKey, RowMap>());
  // Rows just applied from the server (or adopted from another tab), per collection:
  // the watcher uses them as the next baseline but STILL diffs the live rows against
  // them, so an edit that landed while a pull was applying is enqueued instead of
  // silently absorbed.
  const absorbRef = useRef(new Map<CollectionKey, RowMap>());
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  // A pull asked for orphaned receipt photos to be pruned; the watcher does it
  // against the committed rows (QA SY-8).
  const pruneRef = useRef(false);
  const pushTimer = useRef<number | undefined>(undefined);
  const pullTimer = useRef<number | undefined>(undefined);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const startedRef = useRef(false);
  // Milliseconds this device's clock runs AHEAD of the server's (negative: behind), and when it was last read.
  const skewRef = useRef(0);
  const skewSampledRef = useRef(0);
  // Opening-contribution rows synthesised at load that have been queued or uploaded (audit SY-8).
  const syntheticSentRef = useRef(new Set<string>());

  const [ui, setUi] = useState<UiState>({ status: initial.config ? 'connecting' : 'off', lastSyncedAt: initial.lastSyncedAt, pending: initial.outbox.length, rejected: initial.rejected?.length ?? 0 });
  const patchUi = useCallback((patch: Partial<UiState>) => setUi((u) => ({ ...u, ...patch, pending: outboxRef.current.size, rejected: stateRef.current.rejected?.length ?? 0 })), []);

  // Latest stores for async code (pulls/pushes run outside render).
  const storesRef = useRef({ hh, billsStore, settleStore, paydaysStore, listsStore, quickStore, accountsStore });
  storesRef.current = { hh, billsStore, settleStore, paydaysStore, listsStore, quickStore, accountsStore };

  const persist = useCallback(() => {
    stateRef.current.outbox = [...outboxRef.current.values()];
    saveSyncState(stateRef.current);
  }, []);

  /**
   * The stamp for a change made now. In SERVER time once this clock is known to
   * be materially off: newest-edit-wins on a fast clock froze rows the other phone
   * could never edit again, and on a slow one lost every conflict (audit SEC-2).
   * The server clamps stamps from the future as a second line.
   */
  const stamp = useCallback(() => new Date(Date.now() - (Math.abs(skewRef.current) >= SKEW_WARN_MS ? skewRef.current : 0)).toISOString(), []);

  /** Current rows of every collection, straight from the stores. */
  const live = useMemo<Record<CollectionKey, { rows: Row[]; isSample: boolean }>>(
    () => ({
      household: { rows: [hh.household], isSample: hh.isSample },
      members: { rows: hh.members, isSample: hh.isSample },
      categories: { rows: hh.categories, isSample: hh.isSample },
      transactions: { rows: hh.transactions, isSample: hh.isSample },
      goals: { rows: hh.goals, isSample: hh.isSample },
      goalContributions: { rows: hh.goalContributions, isSample: hh.isSample },
      bills: { rows: billsStore.bills, isSample: billsStore.isSample },
      settlements: { rows: settleStore.settlements, isSample: settleStore.isSample },
      paydays: { rows: paydaysStore.schedules, isSample: paydaysStore.isSample },
      lists: { rows: listsStore.items, isSample: listsStore.isSample },
      quickAdds: { rows: quickStore.quickAdds, isSample: quickStore.isSample },
      accounts: { rows: accountsStore.accounts, isSample: accountsStore.isSample },
      accountTransfers: { rows: accountsStore.transfers, isSample: accountsStore.isSample },
    }),
    [hh.household, hh.members, hh.categories, hh.transactions, hh.goals, hh.goalContributions, hh.isSample, billsStore.bills, billsStore.isSample, settleStore.settlements, settleStore.isSample, paydaysStore.schedules, paydaysStore.isSample, listsStore.items, listsStore.isSample, quickStore.quickAdds, quickStore.isSample, accountsStore.accounts, accountsStore.transfers, accountsStore.isSample],
  );
  const liveRef = useRef(live);
  liveRef.current = live;

  // ---- applying server records to the stores ----

  /** Merge records into the stores. Resolves true when anything was dispatched (and therefore committed). */
  const applyRecords = useCallback((incoming: SyncRecord[], opts: { replace?: boolean } = {}): boolean => {
    // `replace` (a fresh device joining the household on the server): what the
    // server holds IS the household - nothing local survives, including rows in
    // collections the server has no records for. The default merges instead.
    const replace = !!opts.replace;
    const records = parseableRecords(incoming);
    if (records.length === 0 && !replace) return false;
    const groups = groupByCollection(records);
    const outbox = outboxRef.current;
    const { hh: store, billsStore: bills, settleStore: settle, paydaysStore: paydays, listsStore: lists, quickStore: quick, accountsStore: accounts } = storesRef.current;
    // The newest rows this callback can see: a just-applied pull the watcher has
    // not absorbed yet, else the last committed render. An edit dispatched but
    // not yet rendered is invisible to both - the updaters below keep it anyway.
    const snapshotOf = (c: CollectionKey): RowMap => absorbRef.current.get(c) ?? toMap(liveRef.current[c].rows);
    const serverRows = (recs: SyncRecord[] | undefined): Row[] => (recs ?? []).flatMap((r) => (r.deleted || r.data == null ? [] : [r.data]));
    const pickHousehold = (rows: Row[]): Household | undefined => {
      const wanted = stateRef.current.householdId;
      return (rows.find((r) => r.id === wanted) ?? rows[rows.length - 1]) as Household | undefined;
    };
    const dispatches: Array<() => void> = [];

    // Household store: one hydrate for all six collections. The merge over the
    // snapshot decides `changed` and becomes the watcher's baseline; the state
    // itself is written by an updater that re-merges against the true latest
    // rows, skipping records for rows edited since the snapshot - so an edit
    // racing this apply stays in state, differs from the baseline, and is
    // pushed instead of silently lost (QA M12).
    const snapshots = new Map<CollectionKey, RowMap>();
    for (const c of HOUSEHOLD_COLLECTIONS) snapshots.set(c, snapshotOf(c));
    const snapRows = (c: CollectionKey) => [...snapshots.get(c)!.values()];
    const data: HouseholdData = {
      household: (snapRows('household')[0] as Household | undefined) ?? store.household,
      members: snapRows('members') as HouseholdData['members'],
      categories: snapRows('categories') as HouseholdData['categories'],
      transactions: snapRows('transactions') as HouseholdData['transactions'],
      goals: snapRows('goals') as HouseholdData['goals'],
      goalContributions: snapRows('goalContributions') as HouseholdData['goalContributions'],
    };
    // A store still showing the SAMPLE must never merge real rows into it: the
    // commit would promote every sample row to real (13 fake bills, 7 fake
    // reminders after pulling one partner bill - audit SY-2). While a store is
    // sample, what the server sends for it IS its contents.
    const wholesale = replace || (store.isSample && HOUSEHOLD_COLLECTIONS.some((c) => groups.has(c)));
    let changed = replace;
    for (const c of HOUSEHOLD_COLLECTIONS) {
      const recs = groups.get(c);
      if (!recs && !wholesale) continue;
      const merged = wholesale ? { rows: serverRows(recs), changed: true } : mergeRemote(snapRows(c), recs!, outbox, c);
      if (!merged.changed) continue;
      changed = true;
      if (c === 'household') {
        const row = pickHousehold(merged.rows);
        if (row) data.household = row;
      } else {
        (data as unknown as Record<string, Row[]>)[c] = merged.rows;
      }
    }
    if (changed) {
      for (const c of HOUSEHOLD_COLLECTIONS) absorbRef.current.set(c, toMap(c === 'household' ? [data.household] : ((data as unknown as Record<string, Row[]>)[c] ?? [])));
      if (wholesale) {
        dispatches.push(() => store.hydrate(data, { keepReceipts: true }));
      } else {
        dispatches.push(() =>
          store.hydrate(
            (prev) => {
              const next = { ...prev };
              for (const c of HOUSEHOLD_COLLECTIONS) {
                const recs = groups.get(c);
                if (!recs) continue;
                const prevRows = c === 'household' ? [prev.household] : ((prev as unknown as Record<string, Row[]>)[c] ?? []);
                const safe = withoutRacedRows(recs, snapshots.get(c)!, prevRows);
                const merged = mergeRemote(prevRows, safe, new Map(outbox), c);
                if (c === 'household') {
                  const row = pickHousehold(merged.rows);
                  if (row) next.household = row;
                } else {
                  (next as unknown as Record<string, Row[]>)[c] = merged.rows;
                }
              }
              return next;
            },
            { keepReceipts: true },
          ),
        );
      }
      // Entries deleted on the other device leave their photos behind on this one.
      // Prune from the WATCHER (post-commit truth), not from this snapshot merge: a
      // transaction kept by the raced-edit updater is absent from the snapshot, and
      // pruning here deleted its photo while the row lived on (QA SY-8).
      pruneRef.current = true;
    }

    const applyFeature = <T extends Row>(c: CollectionKey, replaceAll: (rows: T[] | ((prev: T[]) => T[])) => void) => {
      const recs = groups.get(c);
      if (!recs && !replace) return;
      // Same rule as the household blob (audit SY-2): a still-sample store takes
      // the server's rows wholesale instead of promoting its sample rows.
      const wholesaleHere = replace || (liveRef.current[c].isSample && !!recs);
      const snapshot = snapshotOf(c);
      const merged = wholesaleHere ? { rows: serverRows(recs), changed: true } : mergeRemote([...snapshot.values()], recs!, outbox, c);
      if (!merged.changed) return;
      absorbRef.current.set(c, toMap(merged.rows));
      if (wholesaleHere) dispatches.push(() => replaceAll(merged.rows as T[]));
      else dispatches.push(() => replaceAll((prev) => mergeRemote(prev, withoutRacedRows(recs!, snapshot, prev), new Map(outbox), c).rows as T[]));
    };
    applyFeature<Bill>('bills', bills.replaceAll);
    applyFeature<Settlement>('settlements', settle.replaceAll);
    applyFeature<IncomeSchedule>('paydays', paydays.replaceAll);
    applyFeature<ListItem>('lists', lists.replaceAll);
    applyFeature<QuickAdd>('quickAdds', quick.replaceAll);
    applyFeature<Account>('accounts', accounts.replaceAllAccounts);
    applyFeature<AccountTransfer>('accountTransfers', accounts.replaceAllTransfers);
    if (dispatches.length === 0) return false;

    // One SYNCHRONOUS commit for everything this batch touches. Dispatched from a
    // promise continuation these updates sat at default priority; a tap that
    // landed before React got to them rendered alone at higher priority, and at
    // that commit the watcher diffed the OLD rows against the rows absorbed
    // above - tombstones for the partner's new rows, their edits reverted,
    // and a nested-update loop into the error boundary (audit SY-1). Flushed
    // here, the rows are committed and on disk before anything else can run.
    flushSync(() => {
      for (const dispatch of dispatches) dispatch();
    });
    return true;
  }, []);

  // ---- network operations, serialised ----

  const exclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chainRef.current.then(fn, fn);
    chainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      patchUi({ status: isNetworkError(e) ? 'offline' : 'error', error: messageOf(e) });
    },
    [patchUi],
  );

  const applySkew = useCallback(
    (skew: number) => {
      skewRef.current = skew;
      patchUi({ clockSkewMinutes: Math.abs(skew) >= SKEW_WARN_MS ? Math.round(skew / 60_000) : undefined });
    },
    [patchUi],
  );

  /** Read the server's clock (when it can say) and remember how far this device's is off (audit SEC-2). */
  const sampleSkew = useCallback(
    async (force = false) => {
      const transport = transportRef.current;
      if (!transport?.serverTime) return;
      if (!force && Date.now() - skewSampledRef.current < SKEW_SAMPLE_MS) return;
      const before = Date.now();
      const iso = await transport.serverTime();
      if (transportRef.current !== transport || !iso) return;
      const serverNow = Date.parse(iso);
      if (Number.isNaN(serverNow)) return;
      const after = Date.now();
      skewSampledRef.current = after;
      // The server read its clock somewhere inside the round trip: take the middle.
      applySkew(Math.round((before + after) / 2) - serverNow);
    },
    [applySkew],
  );

  /** Fallback for a server that cannot tell the time: after a push, the newest FRESHLY-STORED server stamp ≈ server "now". */
  const noteSkew = useCallback(
    (stored: SyncRecord[], sent: SyncRecord[]) => {
      if (transportRef.current?.serverTime) return; // sampled directly instead
      if (stateRef.current.config?.url.startsWith('memory://')) return; // the test server's clock is synthetic
      // Only rows this push actually won carry a refreshed synced_at. A push where
      // every row loses LWW (a reconnect-merge) echoes old stamps - treating those
      // as "server now" told healthy devices their clock was hours off (QA SY-13).
      // Stamps compare as instants, not text: the server echoes a different
      // textual form of the same moment (audit SY-9).
      const sentStamp = new Map(sent.map((r) => [outboxKey(r.collection, r.id), Date.parse(r.updatedAt)]));
      let newest = '';
      for (const r of stored) if (r.syncedAt && Date.parse(r.updatedAt) === sentStamp.get(outboxKey(r.collection, r.id)) && r.syncedAt > newest) newest = r.syncedAt;
      const serverNow = newest ? Date.parse(newest) : NaN;
      if (Number.isNaN(serverNow)) return;
      applySkew(Date.now() - serverNow);
    },
    [applySkew],
  );

  const flush = useCallback(async () => {
    const transport = transportRef.current;
    const st = stateRef.current;
    if (!transport || !st.householdId || outboxRef.current.size === 0) return;
    const batch = [...outboxRef.current.values()].filter((r) => r.householdId === st.householdId);
    if (batch.length === 0) return;
    let stored: SyncRecord[];
    try {
      stored = await transport.push(batch);
    } catch (e) {
      // Unreachable: the whole batch waits for the network. REFUSED (a row the
      // server will not store - an unsupported character, say): retrying the same
      // batch for ever used to stop every later edit behind it, so push one by one
      // and park the rows that fail on their own (audit SEC-4).
      if (isNetworkError(e) || transportRef.current !== transport) throw e;
      stored = [];
      const parked: RejectedRecord[] = [];
      for (const rec of batch) {
        try {
          stored.push(...(await transport.push([rec])));
        } catch (e2) {
          if (isNetworkError(e2)) throw e2;
          parked.push({ record: rec, error: messageOf(e2) });
        }
        if (transportRef.current !== transport) return;
      }
      if (parked.length) {
        const parkedKeys = new Set(parked.map((p) => outboxKey(p.record.collection, p.record.id)));
        st.rejected = [...(st.rejected ?? []).filter((p) => !parkedKeys.has(outboxKey(p.record.collection, p.record.id))), ...parked];
      }
    }
    // Disconnected (or rebound) while the push was in flight: the response belongs
    // to a session the user ended - don't apply or re-patch anything (QA SY-14).
    if (transportRef.current !== transport) return;
    noteSkew(stored, batch);
    for (const rec of batch) if (outboxRef.current.get(outboxKey(rec.collection, rec.id)) === rec) outboxRef.current.delete(outboxKey(rec.collection, rec.id));
    applyRecords(stored); // the server's view wins where our edit was older
    st.lastSyncedAt = new Date().toISOString();
    persist();
    patchUi({ lastSyncedAt: st.lastSyncedAt });
  }, [applyRecords, noteSkew, persist, patchUi]);

  // resolveBinding is defined below; pull needs it for the replaced-household path.
  const resolveRef = useRef<(() => Promise<ConnectOutcome>) | null>(null);
  // A cursor whose records have been dispatched to the stores but not yet committed
  // and saved. It is persisted from a passive effect AFTER the stores' layout-effect
  // saves ran, so a kill between "cursor durable" and "data durable" can no longer
  // skip those records forever (QA SY-6). In-memory queries use it right away.
  const pendingCursorRef = useRef<string | null>(null);

  /** Resolves true when the pull UNBOUND the device (household tombstone) - the caller must not paint "online" over the choice that resolveBinding just put up (audit SYN-2). */
  const pull = useCallback(async (): Promise<boolean> => {
    const transport = transportRef.current;
    const st = stateRef.current;
    if (!transport || !st.householdId) return false;
    const result = await transport.pull(st.householdId, pendingCursorRef.current ?? st.cursor);
    if (transportRef.current !== transport || stateRef.current.householdId !== st.householdId) return false; // disconnected/rebound mid-pull (QA SY-14)
    // The household this device mirrors was replaced server-side (tombstoned by the
    // other phone's "upload this device's data"): none of its records apply any more.
    // Unbind and decide again instead of syncing into a void forever (QA SY-10).
    if (result.records.some((r) => r.collection === 'household' && r.id === st.householdId && r.deleted)) {
      st.householdId = undefined;
      st.cursor = undefined;
      pendingCursorRef.current = null;
      persist();
      await resolveRef.current?.();
      return true;
    }
    const nextCursor = result.cursor ?? cursorOf(result.records, pendingCursorRef.current ?? st.cursor);
    // Held back until the records it stands for are on disk (QA SY-6): set BEFORE
    // the apply, so the passive effect of that very commit - which runs after the
    // stores' layout-effect saves - is what persists it (audit SYN-9). When nothing
    // needed applying (the overlap window re-read rows already here) it is final now.
    if (nextCursor) pendingCursorRef.current = nextCursor;
    const changed = result.records.length > 0 && applyRecords(result.records);
    if (!changed && pendingCursorRef.current) {
      st.cursor = pendingCursorRef.current;
      pendingCursorRef.current = null;
    }
    st.lastSyncedAt = new Date().toISOString();
    persist();
    patchUi({ lastSyncedAt: st.lastSyncedAt });
    return false;
  }, [applyRecords, persist, patchUi]);

  const sync = useCallback(
    () =>
      exclusive(async () => {
        if (!transportRef.current) return;
        if (!stateRef.current.householdId) {
          // Connected but unbound: a fresh install opened before the server was
          // reachable, or a sample device waiting for a household to appear.
          // Nothing re-resolved this until a full restart, so the card stayed on
          // "not reachable" and the device never joined (audit SY-7). Decide again.
          if (!stateRef.current.config || stateRef.current.disconnected) return;
          try {
            const outcome = await resolveRef.current?.();
            if (stateRef.current.householdId) {
              await flush();
              const unbound = await pull();
              if (!unbound) patchUi({ status: 'online', error: undefined });
            } else if (outcome && outcome.outcome !== 'needs-choice') {
              patchUi({ status: 'online', error: undefined });
            }
          } catch (e) {
            fail(e);
          }
          return;
        }
        patchUi({ status: 'syncing', error: undefined });
        void sampleSkew().catch(() => undefined);
        // Push and pull fail independently: one poisoned outbox record must not
        // stop the device from RECEIVING the partner's changes too (QA SY-12).
        let flushError: unknown = null;
        try {
          await flush();
        } catch (e) {
          flushError = e;
        }
        let unbound: boolean;
        try {
          unbound = await pull();
        } catch (e) {
          fail(flushError ?? e);
          return;
        }
        if (flushError) fail(flushError);
        else if (!unbound) patchUi({ status: 'online', error: undefined });
      }),
    [exclusive, flush, pull, patchUi, fail, sampleSkew],
  );

  const schedulePush = useCallback(() => {
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => void sync(), PUSH_DEBOUNCE_MS);
  }, [sync]);

  const schedulePull = useCallback(() => {
    if (pullTimer.current) window.clearTimeout(pullTimer.current);
    pullTimer.current = window.setTimeout(() => void sync(), REALTIME_DEBOUNCE_MS);
  }, [sync]);

  /**
   * Everything currently on the device counts as known-to-the-server from here -
   * except the opening-contribution rows the store synthesised when it loaded:
   * those exist on this device only, and primed as "known" they were never pushed,
   * so a joiner derived a lower goal total and the two phones ping-ponged
   * goal.saved for ever (audit SY-8). They are queued instead.
   */
  const primeBaselines = useCallback(() => {
    const st = stateRef.current;
    const synthetic = new Set(storesRef.current.hh.syntheticContributionIds.filter((id) => !syntheticSentRef.current.has(id)));
    for (const c of COLLECTIONS) {
      const { rows, isSample } = liveRef.current[c];
      const known = c === 'goalContributions' && synthetic.size ? rows.filter((r) => !synthetic.has(r.id)) : rows;
      baselineRef.current.set(c, isSample ? new Map() : toMap(known));
    }
    if (st.householdId && synthetic.size && !liveRef.current.goalContributions.isSample) {
      const rows = liveRef.current.goalContributions.rows.filter((r) => synthetic.has(r.id));
      if (rows.length && enqueue(outboxRef.current, st.householdId, st.deviceId, 'goalContributions', { upserts: rows, deletes: [] }, stamp())) {
        for (const r of rows) syntheticSentRef.current.add(r.id);
        persist();
        patchUi({});
      }
    }
  }, [persist, patchUi, stamp]);

  const bind = useCallback(
    (householdId: string) => {
      const st = stateRef.current;
      const url = st.config?.url;
      if (st.householdId !== householdId || (url !== undefined && st.serverUrl !== url)) {
        st.householdId = householdId;
        st.cursor = undefined;
        pendingCursorRef.current = null;
        // Unsent edits for THIS household survive a disconnect and a reconnect:
        // Disconnect used to throw them away, and the reconnect merge then reverted
        // them to the server's copies with no message (audit SY-4 / SYN-5). Rows of
        // any other household are dropped - that is a different life.
        for (const [k, r] of outboxRef.current) if (r.householdId !== householdId) outboxRef.current.delete(k);
      }
      st.serverUrl = url;
      primeBaselines();
      unsubscribeRef.current?.();
      unsubscribeRef.current = transportRef.current?.subscribe?.(householdId, schedulePull) ?? null;
      persist();
      patchUi({ serverHousehold: undefined });
    },
    [persist, patchUi, schedulePull, primeBaselines],
  );

  /**
   * Push every row this device holds (first upload). The caller picks the
   * `updatedAt` stamp: `stamp()` when this device's data should win
   * (an empty server, or the user chose "upload this device's"), EPOCH_ISO
   * when the server's copies must win every conflict (reconnect merge).
   */
  const uploadAll = useCallback(
    async (householdId: string, updatedAt: string) => {
      const transport = transportRef.current;
      if (!transport) return;
      const collections = new Map<CollectionKey, Row[]>();
      for (const c of COLLECTIONS) if (!liveRef.current[c].isSample) collections.set(c, liveRef.current[c].rows);
      const records = recordsForAll(householdId, stateRef.current.deviceId, collections, updatedAt);
      if (records.length) {
        const stored = await transport.push(records);
        if (transportRef.current !== transport) return; // disconnected mid-upload (QA SY-14)
        for (const id of storesRef.current.hh.syntheticContributionIds) syntheticSentRef.current.add(id);
        noteSkew(stored, records);
        applyRecords(stored);
      }
    },
    [applyRecords, noteSkew],
  );

  const adopt = useCallback(
    async (server: ServerHousehold) => {
      const transport = transportRef.current;
      if (!transport) return;
      const st = stateRef.current;
      const result = await transport.pull(server.id);
      // Joining REPLACES this device's data with the household on the server, so
      // nothing is touched until the pull proves it actually carries one.
      const hasHousehold = result.records.some((r) => r.collection === 'household' && r.id === server.id && !r.deleted && r.data != null);
      if (!hasHousehold) {
        st.householdId = undefined;
        throw new Error("The server doesn't have that household's data yet. Finish setting up on the first device, then try joining again.");
      }
      st.householdId = server.id;
      st.cursor = undefined;
      outboxRef.current.clear();
      // The cursor follows the same rule as a pull's: persisted once the rows are on disk (audit SYN-9).
      pendingCursorRef.current = result.cursor ?? null;
      applyRecords(result.records, { replace: true });
      st.lastSyncedAt = new Date().toISOString();
      bind(server.id);
      patchUi({ lastSyncedAt: st.lastSyncedAt });
    },
    [applyRecords, bind, patchUi],
  );

  /** Work out which household this device mirrors, or ask the user when it is ambiguous. */
  const resolveBinding = useCallback(async (): Promise<ConnectOutcome> => {
    const transport = transportRef.current;
    if (!transport) throw new Error('Not connected');
    const st = stateRef.current;
    const local = liveRef.current.household;
    const localId = storesRef.current.hh.household.id;
    await transport.ping();
    await sampleSkew(true).catch(() => undefined);
    // A binding and cursor made against another server mean nothing here: decide
    // again from scratch (audit SY-5).
    if (st.householdId && st.serverUrl !== undefined && st.serverUrl !== st.config?.url) {
      st.householdId = undefined;
      st.cursor = undefined;
      pendingCursorRef.current = null;
      persist();
    }
    const households = await transport.listHouseholds();
    if (st.householdId && st.householdId === localId && !local.isSample) {
      if (households.some((h) => h.id === localId)) {
        bind(localId); // reconnecting to the household we already mirror
        return { outcome: 'reconnected' };
      }
      // The server no longer holds the household this device mirrors (wiped and
      // rebuilt, restored from an older backup): binding to it blindly kept the
      // device "Connected" while its edits went nowhere a partner could join, and
      // a fresh phone then started a second household (audit SY-5). Decide like
      // a first connection instead; the old cursor is meaningless too.
      st.householdId = undefined;
      st.cursor = undefined;
      pendingCursorRef.current = null;
      persist();
    }
    const server = households.find((h) => h.id === localId) ?? households[0];
    if (!server) {
      if (local.isSample) {
        // Empty server, sample data here: stay connected but UNBOUND. The sample's mock id
        // is shared by every fresh install and must never become a server household; the
        // household-id effect re-resolves the moment real data exists (sample adoption
        // mints a fresh id, Start fresh always did). Connected all the same - the card
        // used to sit on "Connecting…" until the wizard finished (audit OB-10).
        st.householdId = undefined;
        persist();
        patchUi({ status: 'online', error: undefined });
        return { outcome: 'empty' };
      }
      // Empty server: this device's data becomes the household. Upload FIRST, bind
      // after - binding persists "the server knows everything", so a failed or
      // partial first upload must leave the device unbound and retryable, not
      // permanently convinced there is nothing left to send (QA SY-2).
      await uploadAll(localId, stamp());
      bind(localId);
      return { outcome: 'uploaded' };
    }
    if (local.isSample) {
      await adopt(server); // a fresh device joins the household on the server
      // Adopted without the join wizard's "Which of you is this phone?": until
      // someone answers, everything would log as members[0] - the partner's
      // identity on the second phone (audit OB-1). App surfaces the picker.
      st.needsIdentity = true;
      persist();
      patchUi({ needsIdentity: true });
      return { outcome: 'joined', household: server };
    }
    if (server.id === localId) {
      // Same household on both sides (e.g. both started from the sample). We cannot
      // date this device's pre-sync rows individually, so they are pushed with an
      // epoch stamp: anything the server already holds (the partner's edits included)
      // wins the per-row LWW, while rows the server has never seen still land.
      // The server's winners come straight back via the push result and the pull.
      // Upload before binding for the same reason as the empty-server branch (QA SY-2).
      // Edits still in the outbox keep their real stamps and go up in the caller's
      // flush right after, beating the server's older copies (audit SY-4).
      await uploadAll(localId, EPOCH_ISO);
      bind(localId);
      return { outcome: 'merged' };
    }
    st.householdId = undefined;
    persist();
    patchUi({ status: 'needs-choice', serverHousehold: server, error: undefined });
    return { outcome: 'needs-choice', household: server };
  }, [bind, adopt, uploadAll, persist, patchUi, sampleSkew, stamp]);
  resolveRef.current = resolveBinding;

  const start = useCallback(
    (config: SyncConfig) =>
      exclusive(async (): Promise<ConnectOutcome> => {
        transportRef.current = await createTransport(config);
        patchUi({ status: 'connecting', error: undefined });
        let outcome: ConnectOutcome;
        try {
          outcome = await resolveBinding();
        } catch (e) {
          fail(e);
          throw new Error(readableError(e, config.url));
        }
        if (stateRef.current.householdId) {
          // Bound: a first round trip that fails is not a failed connection - the
          // poll retries it. Reporting it as one made the join step say "Couldn't
          // connect" over a device that had in fact joined (audit SYN-10).
          try {
            await flush();
            const unbound = await pull();
            if (!unbound) patchUi({ status: 'online', error: undefined });
          } catch (e) {
            fail(e);
          }
        }
        return outcome;
      }),
    [exclusive, createTransport, resolveBinding, flush, pull, patchUi, fail],
  );

  // ---- public actions ----

  const connect = useCallback(
    async (config: SyncConfig) => {
      stateRef.current.config = { url: config.url.trim(), anonKey: config.anonKey.trim() };
      stateRef.current.disconnected = undefined;
      persist();
      return start(stateRef.current.config);
    },
    [persist, start],
  );

  const disconnect = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    transportRef.current = null;
    const st = stateRef.current;
    st.config = undefined;
    st.disconnected = true;
    st.householdId = undefined;
    st.cursor = undefined;
    pendingCursorRef.current = null;
    // The outbox stays: unsent edits go through on a reconnect to the same
    // household (bind() drops them for any other) - audit SY-4 / SYN-5.
    persist();
    patchUi({ status: 'off', error: undefined, serverHousehold: undefined, clockSkewMinutes: undefined });
  }, [persist, patchUi]);

  const adoptServer = useCallback(
    () =>
      exclusive(async () => {
        const server = ui.serverHousehold;
        if (!server || !transportRef.current) return;
        patchUi({ status: 'syncing', error: undefined });
        try {
          await adopt(server);
          patchUi({ status: 'online' });
        } catch (e) {
          // Keep the choice on screen and let the caller know: swallowing here made
          // onboarding finish as "joined" after a failed join, and un-rendered the
          // needs-choice buttons with no retry path (QA SY-9).
          patchUi({ status: 'needs-choice', serverHousehold: server, error: messageOf(e) });
          throw new Error(readableError(e, stateRef.current.config?.url ?? ''));
        }
      }),
    [exclusive, ui.serverHousehold, adopt, patchUi],
  );

  const uploadLocal = useCallback(
    () =>
      exclusive(async () => {
        const transport = transportRef.current;
        if (!transport) return;
        const rejected = ui.serverHousehold;
        patchUi({ status: 'syncing', error: undefined });
        try {
          const localId = storesRef.current.hh.household.id;
          // Upload before binding: a partial first upload must stay retryable (QA SY-2).
          await uploadAll(localId, stamp());
          bind(localId);
          await pull();
          // The dialog promised the server household "is replaced". Tombstone it FIRST:
          // that row is what a device still bound to it pulls to unbind and re-resolve
          // instead of staying "online" forever while its pushes go into a void (QA
          // SY-10). Only then remove the rest - a tombstone that could not be written
          // leaves the old rows standing rather than a void (audit SY-11). Best effort:
          // failing just leaves dead rows behind (listHouseholds orders by recency).
          if (rejected && rejected.id !== localId) {
            try {
              await transport.push([{ householdId: rejected.id, collection: 'household', id: rejected.id, data: null, updatedAt: stamp(), deleted: true, deviceId: stateRef.current.deviceId }]);
              await transport.deleteHousehold?.(rejected.id);
            } catch {
              // best effort
            }
          }
          patchUi({ status: 'online' });
        } catch (e) {
          // Same contract as adoptServer: keep the choice, surface the failure (QA SY-9).
          patchUi({ status: 'needs-choice', serverHousehold: rejected, error: messageOf(e) });
          throw new Error(readableError(e, stateRef.current.config?.url ?? ''));
        }
      }),
    [exclusive, ui.serverHousehold, bind, uploadAll, pull, patchUi, stamp],
  );

  const retryRejected = useCallback(() => {
    const st = stateRef.current;
    for (const p of st.rejected ?? []) {
      const key = outboxKey(p.record.collection, p.record.id);
      if (!outboxRef.current.has(key)) outboxRef.current.set(key, p.record);
    }
    st.rejected = undefined;
    persist();
    patchUi({});
    if (transportRef.current) schedulePush();
  }, [persist, patchUi, schedulePush]);

  const discardRejected = useCallback(() => {
    stateRef.current.rejected = undefined;
    persist();
    patchUi({});
  }, [persist, patchUi]);

  // ---- effects ----

  // Start syncing on load when a server is configured.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (stateRef.current.config) void start(stateRef.current.config).catch(() => undefined);
  }, [start]);

  // Another tab's blob is being adopted by a store (QA M7): its rows are the new
  // baseline, so the diff at that commit finds only what changed HERE since - not
  // the whole stale blob. Diffing it as local edits tombstoned the partner's new
  // rows and re-stamped their edits with this tab's clock (audit SY-3 / SYN-4).
  useEffect(
    () =>
      onStorageAdoption((_key, rows) => {
        for (const [c, list] of Object.entries(rows)) if ((COLLECTIONS as readonly string[]).includes(c)) absorbRef.current.set(c as CollectionKey, toMap(list as readonly Row[]));
      }),
    [],
  );

  // Turn store changes into outbox records. A LAYOUT effect: the outbox entry is
  // persisted in the same synchronous commit flush as the edit itself, so a tab
  // killed right after an edit cannot leave a durable store row with no outbox
  // record - the edit would never sync (QA SY-7). Outbox records carry the full
  // row data, so persisting them even ahead of the household blob is safe.
  const primedRef = useRef(false);
  useLayoutEffect(() => {
    const st = stateRef.current;
    const bound = !!st.householdId && st.householdId === hh.household.id;
    if (!primedRef.current) {
      // First render: what the device holds is what the server already knows (the outbox carries anything unsent).
      primedRef.current = true;
      primeBaselines();
      return;
    }
    let added = 0;
    for (const c of COLLECTIONS) {
      const { rows, isSample } = live[c];
      const absorbed = absorbRef.current.get(c);
      if (absorbed) {
        // The server-applied (or tab-adopted) rows become the baseline - and the diff
        // below still runs, so a local edit that raced the pull is pushed rather than lost.
        absorbRef.current.delete(c);
        baselineRef.current.set(c, absorbed);
      }
      if (!bound || isSample) {
        // Never clobber a baseline absorbed in this very pass: if a pull applied while
        // this collection still looked sample/unbound, wiping the absorbed rows would
        // make the next pass diff the whole pulled dataset as local edits (QA SY-1).
        if (!absorbed) baselineRef.current.set(c, isSample ? new Map() : toMap(rows));
        continue;
      }
      const base = baselineRef.current.get(c) ?? new Map<string, Row>();
      const diff = diffRows(base, rows);
      if (diff.upserts.length || diff.deletes.length) added += enqueue(outboxRef.current, st.householdId!, st.deviceId, c, diff, stamp());
      baselineRef.current.set(c, toMap(rows));
    }
    if (added) {
      persist();
      patchUi({});
      if (transportRef.current) schedulePush();
    }
  }, [live, hh.household.id, persist, patchUi, schedulePush, primeBaselines, stamp]);

  // Passive follow-up to the watcher: runs AFTER the stores' layout-effect saves,
  // so what it records as done really is on disk.
  useEffect(() => {
    // The pulled records this cursor stands for are committed and saved: it is safe
    // to never pull them again (QA SY-6).
    if (pendingCursorRef.current) {
      stateRef.current.cursor = pendingCursorRef.current;
      pendingCursorRef.current = null;
      persist();
    }
    if (pruneRef.current) {
      pruneRef.current = false;
      // The committed transaction rows - including any the raced-edit updater kept (QA SY-8).
      void pruneReceipts(live.transactions.rows.map((t) => t.id));
    }
  }, [live, persist]);

  // The device's household changed underneath us (Start fresh, backup import, sample
  // adoption): decide again. Also covers the connected-but-unbound state a sample
  // device sits in until it grows real data.
  useEffect(() => {
    const st = stateRef.current;
    if (!transportRef.current) return;
    const unboundReal = !st.householdId && !!st.config && !st.disconnected && !liveRef.current.household.isSample;
    if (!unboundReal && (!st.householdId || st.householdId === hh.household.id)) return;
    st.householdId = undefined;
    persist();
    void exclusive(async () => {
      try {
        await resolveBinding();
        if (stateRef.current.householdId) {
          await flush();
          const unbound = await pull();
          if (!unbound) patchUi({ status: 'online' });
        }
      } catch (e) {
        fail(e);
      }
    });
    // hh.isSample is a dependency because sample adoption flips it one render AFTER the
    // household id changes - without it, the connected-but-unbound resolve never fires.
  }, [hh.household.id, hh.isSample, exclusive, resolveBinding, flush, pull, persist, patchUi, fail]);

  // Keep pulling while visible; catch up when the app comes back or the network returns.
  useEffect(() => {
    const tick = () => {
      // Unbound-but-configured devices tick too, so they re-resolve when the
      // network or the app comes back (audit SY-7); sync() no-ops for the rest.
      const st = stateRef.current;
      if (document.visibilityState === 'visible' && transportRef.current && (st.householdId || (st.config && !st.disconnected))) void sync();
    };
    const interval = window.setInterval(tick, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', tick);
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
      if (pullTimer.current) window.clearTimeout(pullTimer.current);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [pollMs, sync]);

  const identityChosen = useCallback(() => {
    const st = stateRef.current;
    if (!st.needsIdentity) return;
    st.needsIdentity = undefined;
    persist();
    patchUi({ needsIdentity: false });
  }, [persist, patchUi]);

  const value = useMemo<SyncApi>(
    () => ({
      status: ui.status,
      config: stateRef.current.config ?? null,
      householdId: stateRef.current.householdId,
      lastSyncedAt: ui.lastSyncedAt,
      pending: ui.pending,
      rejected: ui.rejected,
      error: ui.error,
      clockSkewMinutes: ui.clockSkewMinutes,
      serverHousehold: ui.serverHousehold,
      connect,
      disconnect,
      syncNow: sync,
      adoptServer,
      uploadLocal,
      retryRejected,
      discardRejected,
      needsIdentity: ui.needsIdentity ?? !!stateRef.current.needsIdentity,
      identityChosen,
    }),
    [ui, connect, disconnect, sync, adoptServer, uploadLocal, retryRejected, discardRejected, identityChosen],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncApi {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
