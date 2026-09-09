import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nowIsoDateTime } from '../lib/dates';
import { newId } from '../lib/ids';
import * as mock from './mock';
import { STORAGE_KEYS, cleanText, isId, isNumber, isRecord, isString, noteStorageAdoption, onStorageProblem, readStored, removeStored, subscribeStored, uniqueById, validRows, writeStored } from './persist';
import { clearReceipts, deleteReceipt } from './receipts';
import { fromCents, normaliseSplit, roundMoney, splitShares, toCents } from './split';
import type {
  Category,
  CategoryInput,
  Goal,
  GoalContribution,
  GoalContributionInput,
  Household,
  HouseholdMember,
  HouseholdPatch,
  NewGoalInput,
  NewMemberInput,
  NewTransactionInput,
  SplitShare,
  TransactionRecord,
} from './types';

// The household store. All of the household's data lives in one
// `HouseholdData` object so multi-entity changes (paying into a goal, removing
// a member) update and save atomically. It is hydrated from localStorage on
// start and saved after every edit; until the first edit the built-in sample
// household is shown and nothing is written, so the sample's relative dates
// never go stale on disk. `hydrate` / the persist helpers are the seam a
// Supabase adapter replaces later.

/** Everything that belongs to the household (what gets saved, exported, synced). */
export interface HouseholdData {
  household: Household;
  members: HouseholdMember[];
  categories: Category[];
  transactions: TransactionRecord[];
  goals: Goal[];
  /** Ledger of deposits into goals; goal.saved is the running total. */
  goalContributions: GoalContribution[];
}

/** The data plus device-level state (who is using this device). */
export interface HouseholdState extends HouseholdData {
  currentMemberId: string;
}

interface HouseholdStore extends HouseholdState {
  addTransaction: (input: NewTransactionInput) => TransactionRecord;
  updateTransaction: (id: string, patch: Partial<Omit<TransactionRecord, 'id'>>) => void;
  removeTransaction: (id: string) => void;
  /** Partner confirms a shared purchase; clears `pending` once nobody is left to confirm. */
  confirmTransaction: (id: string, memberId: string) => void;
  /** Keep the record but flag it; it leaves the settle-up balance until resolved (confirm, make personal, or delete). */
  disputeTransaction: (id: string, memberId: string, reason?: string) => void;
  addGoal: (input: NewGoalInput) => Goal;
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) => void;
  removeGoal: (id: string) => void;
  /** Adds money to a goal; completes it automatically when the target is reached. */
  contributeToGoal: (input: GoalContributionInput) => void;
  addMember: (input: NewMemberInput) => HouseholdMember;
  updateMember: (id: string, patch: Partial<NewMemberInput>) => void;
  /** Removes the member; their past transactions and goal contributions stay (attributed by id). The signed-in member cannot be removed. */
  removeMember: (id: string) => void;
  /** Who is using this device; remembered per device, not part of the household data. */
  setCurrentMember: (id: string) => void;
  updateHousehold: (patch: HouseholdPatch) => void;
  /** New categories are expense categories with a household-wide monthly limit. */
  addCategory: (input: CategoryInput) => Category;
  updateCategory: (id: string, patch: Partial<CategoryInput>) => void;
  /** True until the first edit: the built-in sample household is showing and nothing is saved yet. */
  isSample: boolean;
  /** ISO datetime of the last successful save on this device. */
  savedAt?: string;
  /** The last save failed (storage blocked or full); edits live in memory only until it succeeds. */
  storageError: boolean;
  /** Ledger rows this device synthesised when it loaded (a pre-ledger goal's opening contribution): the server has never seen them, so sync treats them as unsent rather than as known (audit SY-8). */
  syntheticContributionIds: readonly string[];
  /** Replace everything (backup import, first-run setup, a server read). An updater form merges against the true latest state, so sync applies never discard an edit racing them. Saved immediately. */
  hydrate: (data: HouseholdData | ((prev: HouseholdData) => HouseholdData), options?: { currentMemberId?: string; /** Keep this device's receipt photos (a sync pull of the same rows); default clears them. */ keepReceipts?: boolean }) => void;
  /** Throw away this device's household data and show the sample household again. */
  resetToSample: () => void;
}

const StoreContext = createContext<HouseholdStore | null>(null);

const CATEGORY_COLORS: Array<Category['color']> = ['primary', 'coral', 'violet', 'sky', 'lime', 'rose', 'amber'];

// ---- persistence ----

export interface PersistedHousehold extends HouseholdData {
  version: 1;
  savedAt: string;
  /** Opening-contribution rows synthesised by THIS read (a pre-ledger goal): they exist nowhere else yet, so sync must push them (audit SY-8). */
  syntheticContributionIds?: string[];
}

// Ids - the row's own and every foreign key - must fit ID_RULE: an id from a
// backup or the server reaches native file paths and a hand-built server query
// (audit SEC-5). Mock and newId() ids all fit.
const isMember = (x: unknown): x is HouseholdMember => isRecord(x) && isId(x.id) && isString(x.name) && isString(x.color) && isString(x.role) && isNumber(x.monthlyLimit);
const isCategory = (x: unknown): x is Category =>
  isRecord(x) && isId(x.id) && isString(x.name) && isString(x.icon) && isString(x.color) && isNumber(x.limit) && (x.kind === 'expense' || x.kind === 'income');
const isIdArray = (x: unknown): x is string[] => Array.isArray(x) && x.every(isId);
const isSplitShare = (x: unknown): x is SplitShare => isRecord(x) && isId(x.memberId) && isNumber(x.amount);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const opt = (x: unknown, guard: (v: unknown) => boolean) => x === undefined || guard(x);
// The optional fields are checked too: the UI dereferences them (needsApprovalFrom.includes,
// split.map, disputed.byMemberId), so a malformed one from a backup or a sync pull must drop
// the row here rather than white-screen a render later.
const isTransaction = (x: unknown): x is TransactionRecord =>
  isRecord(x) &&
  isId(x.id) &&
  isString(x.title) &&
  isNumber(x.amount) &&
  isString(x.date) &&
  isId(x.categoryId) &&
  isId(x.memberId) &&
  opt(x.note, isString) &&
  opt(x.shared, isBool) &&
  opt(x.split, (v) => Array.isArray(v) && v.every(isSplitShare)) &&
  opt(x.loggedBy, isId) &&
  opt(x.recurring, isBool) &&
  opt(x.pending, isBool) &&
  opt(x.needsApprovalFrom, isIdArray) &&
  opt(x.disputed, (v) => isRecord(v) && isId(v.byMemberId) && isString(v.at) && opt(v.reason, isString)) &&
  opt(x.hasReceipt, isBool) &&
  opt(x.accountId, isId);
const isGoal = (x: unknown): x is Goal =>
  isRecord(x) &&
  isId(x.id) &&
  isString(x.name) &&
  isString(x.icon) &&
  isNumber(x.target) &&
  isNumber(x.saved) &&
  isIdArray(x.contributorIds) &&
  opt(x.deadlineDate, isString) &&
  opt(x.lastContributionAt, isString) &&
  (x.status === 'active' || x.status === 'completed' || x.status === 'paused');
const isContribution = (x: unknown): x is GoalContribution => isRecord(x) && isId(x.id) && isId(x.goalId) && isId(x.memberId) && isNumber(x.amount) && isString(x.date);
// defaultSplit is validated too: it feeds the split allocator, and an Infinity
// share from a corrupt/synced row would turn every default-split purchase NaN.
const isHousehold = (x: unknown): x is Household =>
  isRecord(x) &&
  isId(x.id) &&
  isString(x.name) &&
  isString(x.currency) &&
  isNumber(x.dailyEarningTarget) &&
  opt(x.defaultSplit, (v) => isRecord(v) && (v.mode === 'equal' || v.mode === 'ratio') && opt(v.shares, (s) => isRecord(s) && Object.values(s).every(isNumber)));

/** Per-collection row guards for the household stores, keyed the way sync names its
 * collections. Sync validates PULLED records with these before merging: a malformed
 * row from the server must be dropped at the door, not rendered into a crash - and
 * never absorbed into a baseline it would later be "deleted" from (QA SY-5/SY-11). */
export const HOUSEHOLD_ROW_GUARDS = {
  household: isHousehold,
  members: isMember,
  categories: isCategory,
  transactions: isTransaction,
  goals: isGoal,
  goalContributions: isContribution,
} as const;

/** Accept a saved blob, dropping any individual rows that no longer fit the shape. */
export function readPersistedHousehold(x: unknown): PersistedHousehold | null {
  if (!isRecord(x) || x.version !== 1 || !isString(x.savedAt) || !isHousehold(x.household)) return null;
  // One row per id: a duplicated id in a blob would make the server's upsert reject the whole first upload (audit SEC-4).
  const members = uniqueById(validRows(x.members, isMember));
  if (members.length === 0) return null; // nobody to log purchases as: treat as corrupt
  const goalContributions = uniqueById(validRows(x.goalContributions, isContribution));
  const goals = uniqueById(validRows(x.goals, isGoal));
  // A goal with a remembered total but no ledger rows (data older than the ledger,
  // or an import that lost its rows) gets an opening row here, so the ledger is
  // complete and the first real contribution can never wipe the stored figure.
  // The id is DETERMINISTIC: two tabs or two devices adopting the same blob
  // synthesise the same row, which merges over sync instead of double-counting.
  // The ids are reported so sync pushes them: primed into the baseline as
  // "known to the server", a joiner never received them and derived a lower
  // total, and the two phones ping-ponged goal.saved for ever (audit SY-8).
  const synthesised: string[] = [];
  for (const g of goals) {
    if (toCents(g.saved) > 0 && !goalContributions.some((c) => c.goalId === g.id)) {
      const id = `gc_opening_${g.id}`;
      goalContributions.push({ id, goalId: g.id, memberId: g.contributorIds[0] ?? members[0]!.id, amount: g.saved, date: x.savedAt });
      synthesised.push(id);
    }
  }
  return {
    version: 1,
    savedAt: x.savedAt,
    household: x.household,
    members,
    categories: uniqueById(validRows(x.categories, isCategory)),
    transactions: uniqueById(validRows(x.transactions, isTransaction)),
    goals: reconcileGoalSaved(goals, goalContributions),
    goalContributions,
    ...(synthesised.length ? { syntheticContributionIds: synthesised } : null),
  };
}

const readSession = (x: unknown): { currentMemberId: string } | null => (isRecord(x) && x.version === 1 && isString(x.currentMemberId) ? { currentMemberId: x.currentMemberId } : null);

/**
 * `goal.saved` is derived from the contributions ledger (in cents, so an
 * exact-cent completion actually completes - QA DR-3). The ledger is
 * append-only and merges cleanly across devices, while the stored `saved`
 * scalar is a last-write-wins row: without this, two phones contributing while
 * one is offline silently lose one contribution from the total (QA SY-3).
 * Goals with no ledger rows (older data) keep their stored figure.
 */
function reconcileGoalSaved(goals: Goal[], contributions: GoalContribution[]): Goal[] {
  const cents = new Map<string, number>();
  for (const c of contributions) cents.set(c.goalId, (cents.get(c.goalId) ?? 0) + toCents(c.amount));
  let changed = false;
  const next = goals.map((g) => {
    if (!cents.has(g.id)) return g;
    const saved = fromCents(cents.get(g.id)!);
    const status = g.status === 'active' && toCents(saved) >= toCents(g.target) ? 'completed' : g.status;
    if (saved === g.saved && status === g.status) return g;
    changed = true;
    return { ...g, saved, status };
  });
  return changed ? next : goals;
}

/** Free text as the store keeps it: trimmed, and without the characters the server would reject (audit SEC-4). */
const text = (s: string) => cleanText(s.trim());

function sampleData(): HouseholdData {
  return {
    household: mock.household,
    members: mock.members,
    categories: mock.categories,
    transactions: mock.transactions,
    goals: mock.goals,
    goalContributions: mock.goalContributions,
  };
}

// ---- provider ----

export function HouseholdProvider({ children }: { children: ReactNode }) {
  // Read storage once, before the first render (StrictMode may run initialisers twice; reads are harmless).
  const stored = useRef<PersistedHousehold | null | undefined>(undefined);
  if (stored.current === undefined) stored.current = readStored(STORAGE_KEYS.household, readPersistedHousehold);

  // Seed with the DATA fields only: the persisted envelope's version/savedAt riding
  // along in state made every later save spread the load-time savedAt over the fresh
  // one, so the stored stamp never moved again after a reload (QA DR-2).
  const [data, setData] = useState<HouseholdData>(() => {
    const s = stored.current;
    return s ? { household: s.household, members: s.members, categories: s.categories, transactions: s.transactions, goals: s.goals, goalContributions: s.goalContributions } : sampleData();
  });
  const [meta, setMeta] = useState<{ isSample: boolean; savedAt?: string; storageError: boolean }>(() => ({
    isSample: stored.current == null,
    savedAt: stored.current?.savedAt,
    storageError: false,
  }));
  const [sessionMemberId, setSessionMemberId] = useState<string>(() => readStored(STORAGE_KEYS.session, readSession)?.currentMemberId ?? mock.currentMemberId);
  const syntheticRef = useRef<readonly string[]>(stored.current?.syntheticContributionIds ?? []);

  // Set by every edit; the save effect below only writes when it is true, so
  // the untouched sample household is never written to disk.
  const dirty = useRef(false);
  // Counts commits, not renders. The save effect is keyed on THIS, not on `data`:
  // when a discrete tap renders ahead of a still-pending lower-priority update
  // (an edit dispatched after an await, a sync pull's hydrate), React rebases the
  // queue on every render and hands `data` out as a fresh object each time - the
  // effect fired, setMeta re-rendered, the rebase produced another object, and 54
  // nested commits later React threw "Maximum update depth exceeded" (audit SY-1).
  // A primitive that only moves per commit cannot loop.
  const [commitTick, setCommitTick] = useState(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  // A LAYOUT effect: the blob is on disk in the same commit flush, before paint and
  // before the sync provider's passive effects persist anything (the pull cursor)
  // that assumes this data is durable (QA SY-6/SY-7 ordering).
  useLayoutEffect(() => {
    if (!dirty.current) return;
    const savedAt = new Date().toISOString();
    // Envelope fields LAST so a fresh savedAt always wins any stray key in data (QA DR-2).
    const ok = writeStored(STORAGE_KEYS.household, { ...dataRef.current, version: 1, savedAt } satisfies PersistedHousehold);
    // Once saved, the synthesised opening rows are ordinary persisted rows.
    if (ok) syntheticRef.current = [];
    setMeta((m) => {
      const next = { isSample: false, savedAt: ok ? savedAt : m.savedAt, storageError: !ok };
      return m.isSample === next.isSample && m.savedAt === next.savedAt && m.storageError === next.storageError ? m : next;
    });
  }, [commitTick]);

  // Any store's failed write (bills, paydays, lists...) surfaces through the same banner.
  useEffect(() => onStorageProblem(() => setMeta((m) => (m.storageError ? m : { ...m, storageError: true }))), []);

  // Another tab on this device wrote the household (QA M7): adopt its copy instead of
  // clobbering it wholesale on our next save. dirty stays false so this state is not
  // immediately re-written (a real edit sets it again).
  useEffect(
    () =>
      subscribeStored(STORAGE_KEYS.household, () => {
        const fresh = readStored(STORAGE_KEYS.household, readPersistedHousehold);
        if (!fresh) return;
        dirty.current = false;
        const next = { household: fresh.household, members: fresh.members, categories: fresh.categories, transactions: fresh.transactions, goals: fresh.goals, goalContributions: fresh.goalContributions };
        // Sync takes these rows as its new baseline instead of diffing them as edits made here (audit SY-3).
        noteStorageAdoption(STORAGE_KEYS.household, { household: [next.household], members: next.members, categories: next.categories, transactions: next.transactions, goals: next.goals, goalContributions: next.goalContributions });
        setData(next);
        setMeta((m) => ({ ...m, isSample: false, savedAt: fresh.savedAt }));
      }),
    [],
  );

  // Who is using this device: the remembered member if they still exist, else the first member.
  const currentMemberId = data.members.some((m) => m.id === sessionMemberId) ? sessionMemberId : data.members[0]?.id ?? sessionMemberId;
  const currentRef = useRef(currentMemberId);
  currentRef.current = currentMemberId;

  /** Every edit goes through here so saving is one rule in one place. */
  const isSampleRef = useRef(meta.isSample);
  isSampleRef.current = meta.isSample;

  /** Write exactly what the updater returns - used by hydrate(), whose data carries its own household id. */
  const commitRaw = useCallback((update: (prev: HouseholdData) => HouseholdData) => {
    dirty.current = true;
    setData((prev) => {
      const next = update(prev);
      // Every commit (edits, sync merges, imports) keeps goal totals true to the ledger (QA SY-3/DR-3).
      const goals = reconcileGoalSaved(next.goals, next.goalContributions);
      return goals === next.goals ? next : { ...next, goals };
    });
    setCommitTick((t) => t + 1); // same lane as the data update: they commit together (audit SY-1)
    // isSample flips in the SAME commit as the data (the save effect used to flip it
    // one render later). The sync watcher runs on this commit and treats "sample"
    // collections as having no baseline - the one-render lag made a joining device
    // diff the entire pulled household as its own fresh edits and re-stamp every
    // row, silently beating the partner's genuinely newer copies (QA SY-1).
    setMeta((m) => (m.isSample ? { ...m, isSample: false } : m));
  }, []);

  const commit = useCallback(
    (update: (prev: HouseholdData) => HouseholdData) => {
      // Editing the sample adopts it as this household's own data - under its own id.
      // The mock id is identical in every fresh install, so it must never survive
      // adoption (two installs would collide in the same server household).
      const adoptId = isSampleRef.current ? newId('hh') : null;
      commitRaw((prev) => {
        const next = update(prev);
        return adoptId ? { ...next, household: { ...next.household, id: adoptId } } : next;
      });
    },
    [commitRaw],
  );

  // -- transactions --

  const addTransaction = useCallback(
    (input: NewTransactionInput) => {
      const { household: hh, members: ms } = dataRef.current;
      const isExpense = input.kind !== 'income';
      // Whole cents at the write boundary: AmountInput can pass "12.345" through,
      // and every compare downstream assumes cent-quantized amounts.
      const total = roundMoney(Math.abs(input.amount));
      // A custom split implies shared; a shared purchase without one uses the household default.
      const shared = isExpense && (!!input.shared || (input.split?.length ?? 0) > 0);
      const record: TransactionRecord = {
        id: newId('t'),
        title: text(input.title) || (isExpense ? 'Purchase' : 'Income'),
        amount: isExpense ? -total : total,
        date: input.date && input.date <= nowIsoDateTime() ? input.date : nowIsoDateTime(),
        categoryId: input.categoryId,
        memberId: input.memberId,
        note: text(input.note ?? '') || undefined,
        shared: shared || undefined,
        split: shared ? normaliseSplit(input.split, total, ms, input.memberId) : undefined,
        loggedBy: currentRef.current,
        recurring: input.recurring,
        accountId: input.accountId || undefined,
      };
      // With approval on, the other people in the split confirm ad-hoc shared purchases (never bill payments).
      if (shared && hh.requireApproval && !input.recurring) {
        const needs = splitShares(record, hh, ms)
          .filter((s) => s.amount > 0 && s.memberId !== currentRef.current)
          .map((s) => s.memberId);
        if (needs.length > 0) {
          record.pending = true;
          record.needsApprovalFrom = needs;
        }
      }
      commit((prev) => ({ ...prev, transactions: [record, ...prev.transactions] }));
      return record;
    },
    [commit],
  );

  const updateTransaction = useCallback<HouseholdStore['updateTransaction']>(
    (id, patch) =>
      commit((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) => {
          if (t.id !== id) return t;
          const next: TransactionRecord = { ...t, ...patch };
          if (patch.amount !== undefined) next.amount = roundMoney(patch.amount);
          if (patch.title !== undefined) next.title = text(patch.title) || t.title;
          if (patch.note !== undefined) next.note = text(patch.note ?? '') || undefined;
          // "Make personal": nothing about the split, approval or dispute applies any more.
          if (patch.shared === false) {
            next.shared = undefined;
            next.split = undefined;
            next.needsApprovalFrom = undefined;
            next.disputed = undefined;
            if (t.needsApprovalFrom?.length || t.disputed) next.pending = undefined;
          }
          // Editing the money of a shared purchase needs the partner's approval again -
          // whether it was still pending or already confirmed. Without this, an edit
          // after logging (or after confirmation) would land on the balance unreviewed.
          const materialChange =
            (patch.amount !== undefined && patch.amount !== t.amount) ||
            (patch.split !== undefined && JSON.stringify(patch.split) !== JSON.stringify(t.split)) ||
            (patch.shared === true && !t.shared) ||
            (patch.memberId !== undefined && patch.memberId !== t.memberId);
          if (materialChange && next.shared && !next.recurring && next.amount < 0 && prev.household.requireApproval) {
            const editor = currentRef.current;
            const needs = splitShares(next, prev.household, prev.members)
              .filter((s) => s.amount > 0 && s.memberId !== editor)
              .map((s) => s.memberId);
            next.needsApprovalFrom = needs.length > 0 ? needs : undefined;
            next.pending = needs.length > 0 ? true : undefined;
            next.disputed = undefined;
          }
          return next;
        }),
      })),
    [commit],
  );

  const confirmTransaction = useCallback(
    (id: string, memberId: string) =>
      commit((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) => {
          if (t.id !== id || !t.needsApprovalFrom?.includes(memberId)) return t;
          const rest = t.needsApprovalFrom.filter((m) => m !== memberId);
          const disputed = t.disputed?.byMemberId === memberId ? undefined : t.disputed;
          return rest.length > 0 ? { ...t, needsApprovalFrom: rest, disputed } : { ...t, needsApprovalFrom: undefined, disputed: undefined, pending: undefined };
        }),
      })),
    [commit],
  );

  const disputeTransaction = useCallback(
    (id: string, memberId: string, reason?: string) =>
      commit((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) => (t.id === id ? { ...t, pending: true, disputed: { byMemberId: memberId, reason: text(reason ?? '') || undefined, at: nowIsoDateTime() } } : t)),
      })),
    [commit],
  );

  const removeTransaction = useCallback(
    (id: string) => {
      commit((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));
      // The photo lives in IndexedDB (or the native receipts dir), keyed by the id. Deliberately not
      // awaited: the store API is synchronous, and a photo that outlives its row is pruned by the
      // next sync pull's orphan sweep (QA SY-8), so a failed delete costs nothing (audit SYN-10).
      void deleteReceipt(id).catch(() => undefined);
    },
    [commit],
  );

  // -- goals --

  const addGoal = useCallback(
    (input: NewGoalInput) => {
      const saved = roundMoney(Math.max(0, input.saved ?? 0));
      const target = roundMoney(Math.max(1, input.target));
      const goal: Goal = {
        id: newId('g'),
        name: text(input.name) || 'New goal',
        icon: text(input.icon) || '🎯',
        target,
        saved,
        deadlineDate: input.deadlineDate || undefined,
        contributorIds: input.contributorIds,
        status: saved >= target ? 'completed' : 'active',
        lastContributionAt: saved > 0 ? nowIsoDateTime() : undefined,
      };
      const opening: GoalContribution | null =
        saved > 0 ? { id: newId('gc'), goalId: goal.id, memberId: input.contributorIds[0] ?? currentRef.current, amount: saved, date: nowIsoDateTime() } : null;
      commit((prev) => ({ ...prev, goals: [goal, ...prev.goals], goalContributions: opening ? [opening, ...prev.goalContributions] : prev.goalContributions }));
      return goal;
    },
    [commit],
  );

  const updateGoal = useCallback<HouseholdStore['updateGoal']>(
    (id, patch) =>
      commit((prev) => ({
        ...prev,
        goals: prev.goals.map((g) =>
          g.id === id
            ? {
                ...g,
                ...patch,
                ...(patch.target !== undefined ? { target: roundMoney(Math.max(1, patch.target)) } : null),
                ...(patch.name !== undefined ? { name: text(patch.name) || g.name } : null),
                ...(patch.icon !== undefined ? { icon: text(patch.icon) || g.icon } : null),
              }
            : g,
        ),
      })),
    [commit],
  );

  const removeGoal = useCallback(
    (id: string) => commit((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id), goalContributions: prev.goalContributions.filter((c) => c.goalId !== id) })),
    [commit],
  );

  const contributeToGoal = useCallback(
    (input: GoalContributionInput) => {
      // Whole cents; a sub-cent entry (0.004) rounds to nothing and is rejected.
      const amount = roundMoney(Math.abs(input.amount));
      if (!(amount > 0)) return;
      const entry: GoalContribution = { id: newId('gc'), goalId: input.goalId, memberId: input.memberId, amount, date: nowIsoDateTime() };
      // The ledger is the source of truth; commitRaw's reconcile derives `saved` (in
      // cents) and flips active goals to completed at the target (QA SY-3/DR-3).
      commit((prev) => ({
        ...prev,
        goalContributions: [entry, ...prev.goalContributions],
        goals: prev.goals.map((g) => {
          if (g.id !== input.goalId) return g;
          const contributorIds = g.contributorIds.includes(input.memberId) ? g.contributorIds : [...g.contributorIds, input.memberId];
          return { ...g, contributorIds, status: g.status === 'paused' ? 'active' : g.status, lastContributionAt: entry.date };
        }),
      }));
    },
    [commit],
  );

  // -- members --

  const addMember = useCallback(
    (input: NewMemberInput) => {
      const member: HouseholdMember = {
        id: newId('m'),
        name: text(input.name) || 'New member',
        color: input.color,
        role: input.role,
        monthlyLimit: roundMoney(Math.max(0, input.monthlyLimit)),
      };
      commit((prev) => ({ ...prev, members: [...prev.members, member] }));
      return member;
    },
    [commit],
  );

  const updateMember = useCallback<HouseholdStore['updateMember']>(
    (id, patch) =>
      commit((prev) => ({
        ...prev,
        members: prev.members.map((m) => {
          if (m.id !== id) return m;
          const next: HouseholdMember = { ...m, ...patch };
          if (patch.name !== undefined) next.name = text(patch.name) || m.name;
          if (patch.monthlyLimit !== undefined) next.monthlyLimit = roundMoney(Math.max(0, patch.monthlyLimit));
          return next;
        }),
      })),
    [commit],
  );

  const removeMember = useCallback(
    (id: string) => {
      if (id === currentRef.current) return;
      commit((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.id !== id),
        goals: prev.goals.map((g) => (g.contributorIds.includes(id) ? { ...g, contributorIds: g.contributorIds.filter((c) => c !== id) } : g)),
        // A purchase awaiting the removed member could never be confirmed again:
        // scrub them from approvals and resolve their disputes, clearing pending
        // when nothing is left to wait for (QA UX-3).
        transactions: prev.transactions.map((t) => {
          const needs = t.needsApprovalFrom?.includes(id) ? t.needsApprovalFrom.filter((m) => m !== id) : t.needsApprovalFrom;
          const disputed = t.disputed?.byMemberId === id ? undefined : t.disputed;
          if (needs === t.needsApprovalFrom && disputed === t.disputed) return t;
          const stillPending = (needs?.length ?? 0) > 0 || !!disputed;
          return { ...t, needsApprovalFrom: needs?.length ? needs : undefined, disputed, pending: stillPending ? true : undefined };
        }),
      }));
    },
    [commit],
  );

  const setCurrentMember = useCallback((id: string) => {
    setSessionMemberId(id);
    writeStored(STORAGE_KEYS.session, { version: 1, currentMemberId: id });
  }, []);

  // -- household + categories --

  const updateHousehold = useCallback(
    (patch: HouseholdPatch) =>
      commit((prev) => ({
        ...prev,
        household: {
          ...prev.household,
          ...patch,
          name: patch.name !== undefined ? text(patch.name) || prev.household.name : prev.household.name,
          currency: patch.currency !== undefined ? patch.currency.trim().toUpperCase() || prev.household.currency : prev.household.currency,
          dailyEarningTarget: patch.dailyEarningTarget !== undefined ? roundMoney(Math.max(0, patch.dailyEarningTarget)) : prev.household.dailyEarningTarget,
        },
      })),
    [commit],
  );

  const addCategory = useCallback(
    (input: CategoryInput) => {
      const category: Category = {
        id: newId('c'),
        name: text(input.name) || 'New category',
        icon: text(input.icon) || '🏷️',
        color: input.color ?? CATEGORY_COLORS[dataRef.current.categories.length % CATEGORY_COLORS.length]!,
        limit: roundMoney(Math.max(0, input.limit)),
        kind: 'expense',
      };
      // Keep expense categories together, ahead of income ones.
      commit((prev) => ({ ...prev, categories: [...prev.categories.filter((c) => c.kind === 'expense'), category, ...prev.categories.filter((c) => c.kind !== 'expense')] }));
      return category;
    },
    [commit],
  );

  const updateCategory = useCallback<HouseholdStore['updateCategory']>(
    (id, patch) =>
      commit((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => {
          if (c.id !== id) return c;
          const next: Category = { ...c, ...patch };
          if (patch.name !== undefined) next.name = text(patch.name) || c.name;
          if (patch.icon !== undefined) next.icon = text(patch.icon) || c.icon;
          // Whole cents like addCategory: a 450.005 limit carried sub-cent dust into every safe-to-spend figure (audit MON-3).
          if (patch.limit !== undefined) next.limit = roundMoney(Math.max(0, patch.limit));
          return next;
        }),
      })),
    [commit],
  );

  // -- whole-dataset operations --

  const hydrate = useCallback<HouseholdStore['hydrate']>(
    (next, options) => {
      commitRaw(typeof next === 'function' ? next : () => next);
      // Photos belong to the entries being replaced (backup import, setup) unless the caller says the rows are the same ones (sync).
      if (!options?.keepReceipts) void clearReceipts();
      if (options?.currentMemberId) setCurrentMember(options.currentMemberId);
    },
    [commitRaw, setCurrentMember],
  );

  const resetToSample = useCallback(() => {
    dirty.current = false;
    removeStored(STORAGE_KEYS.household);
    removeStored(STORAGE_KEYS.session);
    setData(sampleData());
    setSessionMemberId(mock.currentMemberId);
    setMeta({ isSample: true, savedAt: undefined, storageError: false });
    void clearReceipts();
  }, []);

  const value = useMemo<HouseholdStore>(
    () => ({
      ...data,
      currentMemberId,
      isSample: meta.isSample,
      savedAt: meta.savedAt,
      storageError: meta.storageError,
      syntheticContributionIds: syntheticRef.current,
      addTransaction,
      updateTransaction,
      removeTransaction,
      confirmTransaction,
      disputeTransaction,
      addGoal,
      updateGoal,
      removeGoal,
      contributeToGoal,
      addMember,
      updateMember,
      removeMember,
      setCurrentMember,
      updateHousehold,
      addCategory,
      updateCategory,
      hydrate,
      resetToSample,
    }),
    [
      data,
      currentMemberId,
      meta,
      addTransaction,
      updateTransaction,
      removeTransaction,
      confirmTransaction,
      disputeTransaction,
      addGoal,
      updateGoal,
      removeGoal,
      contributeToGoal,
      addMember,
      updateMember,
      removeMember,
      setCurrentMember,
      updateHousehold,
      addCategory,
      updateCategory,
      hydrate,
      resetToSample,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useHousehold(): HouseholdStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useHousehold must be used inside <HouseholdProvider>');
  return ctx;
}
