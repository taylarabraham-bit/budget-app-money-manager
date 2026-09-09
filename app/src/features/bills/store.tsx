import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEYS, isId, isNumber, isRecord, isString, noteStorageAdoption, readStored, removeStored, validRows, writeStored , subscribeStored } from '../../data/persist';
import { roundMoney } from '../../data/split';
import { newId } from '../../lib/ids';
import { dayOfMonth, isMonthBased } from '../../lib/frequency';
import { addFrequency, isValidIsoDate, todayIso } from './dates';
import { sampleBills } from './mock';
import { BILL_FREQUENCIES, type Bill, type BillInput } from './types';

// Self-contained bills store. Lives beside the household store (not inside
// it) so the household data layer can move to Supabase on its own schedule;
// this one keeps bills in localStorage until a `bills` table exists. Sample
// bills are shown until the first edit, and only then written to storage, so
// the relative sample dates never go stale on disk.

export interface PaidResult {
  bill: Bill;
  /** The due date that was just settled. */
  paidDue: string;
}

export interface BillsStore {
  bills: Bill[];
  /** True when the list is the built-in sample, not the user's own bills. */
  isSample: boolean;
  addBill: (input: BillInput) => Bill;
  updateBill: (id: string, patch: Partial<BillInput> & Pick<Partial<Bill>, 'paused'>) => void;
  removeBill: (id: string) => void;
  /** Record a payment: stamps `lastPaid` and rolls `nextDue` forward one period. */
  markPaid: (id: string, paidOn?: string) => PaidResult | null;
  setPaused: (id: string, paused: boolean) => void;
  /** Replace the whole list (backup import), or merge via an updater (sync applies - never discards an edit racing them). Saved immediately. */
  replaceAll: (bills: Bill[] | ((prev: Bill[]) => Bill[])) => void;
  /** Throw away this device's bills and show the sample list again. */
  resetToSample: () => void;
}

const BillsContext = createContext<BillsStore | null>(null);

const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const opt = (x: unknown, guard: (v: unknown) => boolean) => x === undefined || guard(x);
/** A real local calendar day: anything else steps occurrence expansion into garbage up to the cap (audit MON-2). */
const isIsoDay = (x: unknown): x is string => isString(x) && isValidIsoDate(x);
// anchorDay 1-31 or absent: 0 from a corrupt row would make the monthly step a
// fixed point (never advances) and blow up occurrence expansion.
const isAnchorDay = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 31;

/**
 * The sync and backup door for bills. Every field a screen dereferences is
 * type-checked, optional ones included, so a malformed row is dropped here
 * rather than crashing a render (audit SEC-3); ids follow the one shared rule
 * (audit SEC-5).
 */
export function isBill(x: unknown): x is Bill {
  return (
    isRecord(x) &&
    isId(x.id) &&
    isString(x.name) &&
    isNumber(x.amount) &&
    isIsoDay(x.nextDue) &&
    isId(x.categoryId) &&
    isId(x.memberId) &&
    (x.kind === 'subscription' || x.kind === 'bill') &&
    BILL_FREQUENCIES.includes(x.frequency as Bill['frequency']) &&
    isString(x.createdAt) &&
    opt(x.accountId, isId) &&
    opt(x.shared, isBool) &&
    opt(x.note, isString) &&
    opt(x.lastPaid, isIsoDay) &&
    opt(x.paused, isBool) &&
    opt(x.anchorDay, isAnchorDay)
  );
}

/** The row-merge behind updateBill, exported so MF-2's anchor rule is testable without a provider. */
export function applyBillPatch(b: Bill, patch: Parameters<BillsStore['updateBill']>[1]): Bill {
  const next: Bill = { ...b, ...patch };
  if (patch.name !== undefined) next.name = patch.name.trim() || b.name;
  if (patch.amount !== undefined) next.amount = roundMoney(Math.abs(patch.amount));
  if (patch.note !== undefined) next.note = patch.note.trim() || undefined;
  if (patch.shared !== undefined) next.shared = patch.shared || undefined;
  if (patch.accountId !== undefined) next.accountId = patch.accountId || undefined;
  // Only a date the user actually changed re-anchors the schedule. The edit form
  // always sends nextDue, so re-deriving on every save turned any amount edit on
  // a clamped month-end date (Sep 30 with anchor 31) into a permanent drift back
  // to the low day (QA MF-2). An explicit patch.anchorDay (the form's own
  // derivation) wins over both.
  if (patch.anchorDay === undefined && patch.nextDue !== undefined && patch.nextDue !== b.nextDue) next.anchorDay = dayOfMonth(patch.nextDue);
  // A week-based schedule never consults its anchor, so the anchor goes stale as
  // the weeks roll (created on the 31st, now due on the 21st). The moment the
  // bill turns month-based it must anchor on the day it is due NOW - the form's
  // carried-over anchor is the stale one, so this beats it (audit MF-1).
  if (patch.frequency !== undefined && isMonthBased(patch.frequency) && !isMonthBased(b.frequency)) next.anchorDay = dayOfMonth(next.nextDue);
  return next;
}

const readBills = (x: unknown): Bill[] | null => (Array.isArray(x) ? validRows(x, isBill) : null);

export function BillsProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const stored = useRef<Bill[] | null | undefined>(undefined);
  if (stored.current === undefined) stored.current = persist ? readStored(STORAGE_KEYS.bills, readBills) : null;
  const [bills, setBills] = useState<Bill[]>(() => stored.current ?? sampleBills());
  const [isSample, setIsSample] = useState(stored.current == null);

  // Another tab on this device wrote the bills (QA M7): adopt its copy instead of clobbering it on our next save.
  useEffect(() => {
    if (!persist) return;
    return subscribeStored(STORAGE_KEYS.bills, () => {
      const fresh = readStored(STORAGE_KEYS.bills, readBills);
      if (!fresh) return;
      noteStorageAdoption(STORAGE_KEYS.bills, { bills: fresh }); // (audit SY-3)
      setBills(fresh);
      setIsSample(false);
    });
  }, [persist]);
  // Latest list for actions that need to read a bill synchronously (state
  // updaters run lazily, so they cannot return values to the caller).
  const billsRef = useRef(bills);
  billsRef.current = bills;

  // Every mutation goes through here so storage and state never disagree.
  const commit = useCallback(
    (update: (prev: Bill[]) => Bill[]) => {
      setBills((prev) => {
        const next = update(prev);
        if (persist) writeStored(STORAGE_KEYS.bills, next);
        return next;
      });
      setIsSample(false);
    },
    [persist],
  );

  const addBill = useCallback(
    (input: BillInput) => {
      const bill: Bill = {
        id: newId('b'),
        name: input.name.trim() || (input.kind === 'subscription' ? 'Subscription' : 'Bill'),
        amount: roundMoney(Math.abs(input.amount)),
        frequency: input.frequency,
        nextDue: input.nextDue,
        anchorDay: input.anchorDay ?? dayOfMonth(input.nextDue),
        kind: input.kind,
        categoryId: input.categoryId,
        memberId: input.memberId,
        shared: input.shared || undefined,
        accountId: input.accountId || undefined,
        note: input.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      commit((prev) => [bill, ...prev]);
      return bill;
    },
    [commit],
  );

  const updateBill = useCallback<BillsStore['updateBill']>((id, patch) => commit((prev) => prev.map((b) => (b.id === id ? applyBillPatch(b, patch) : b))), [commit]);

  const removeBill = useCallback((id: string) => commit((prev) => prev.filter((b) => b.id !== id)), [commit]);

  const setPaused = useCallback((id: string, paused: boolean) => commit((prev) => prev.map((b) => (b.id === id ? { ...b, paused: paused || undefined } : b))), [commit]);

  const markPaid = useCallback<BillsStore['markPaid']>(
    (id, paidOn = todayIso()) => {
      const current = billsRef.current.find((b) => b.id === id);
      if (!current) return null;
      // Legacy rows predate anchorDay: backfill from the current due date so the anchor is explicit (and synced) from here on.
      const anchorDay = current.anchorDay ?? dayOfMonth(current.nextDue);
      // One tap pays ONE occurrence (product decision, 2026-08-29): a bill several
      // periods behind advances one step per payment, each logging its own
      // transaction - never a single tap silently swallowing missed charges.
      const updated: Bill = { ...current, anchorDay, lastPaid: paidOn, nextDue: addFrequency(current.nextDue, current.frequency, anchorDay) };
      // Advance the ref eagerly: a second call in the same React batch must see
      // this payment, or both would settle the same occurrence (QA7 B-4).
      billsRef.current = billsRef.current.map((b) => (b.id === id ? updated : b));
      commit((prev) => prev.map((b) => (b.id === id ? updated : b)));
      return { bill: updated, paidDue: current.nextDue };
    },
    [commit],
  );

  const replaceAll = useCallback((next: Bill[] | ((prev: Bill[]) => Bill[])) => commit((prev) => (typeof next === 'function' ? next(prev) : next).filter(isBill)), [commit]);

  const resetToSample = useCallback(() => {
    removeStored(STORAGE_KEYS.bills);
    setBills(sampleBills());
    setIsSample(true);
  }, []);

  const value = useMemo<BillsStore>(
    () => ({ bills, isSample, addBill, updateBill, removeBill, markPaid, setPaused, replaceAll, resetToSample }),
    [bills, isSample, addBill, updateBill, removeBill, markPaid, setPaused, replaceAll, resetToSample],
  );

  return <BillsContext.Provider value={value}>{children}</BillsContext.Provider>;
}

export function useBills(): BillsStore {
  const ctx = useContext(BillsContext);
  if (!ctx) throw new Error('useBills must be used inside <BillsProvider>');
  return ctx;
}
