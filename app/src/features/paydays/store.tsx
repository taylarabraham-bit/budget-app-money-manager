import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEYS, isId, isNumber, isRecord, isString, noteStorageAdoption, readStored, removeStored, validRows, writeStored , subscribeStored } from '../../data/persist';
import { roundMoney } from '../../data/split';
import { isValidIsoDate, todayIso } from '../../lib/dates';
import { FREQUENCIES, addFrequency, dayOfMonth, isMonthBased } from '../../lib/frequency';
import { newId } from '../../lib/ids';
import { sampleSchedules } from './mock';
import type { IncomeSchedule, IncomeScheduleInput } from './types';

// Self-contained paydays store, beside the household store like bills.
// Sample paydays show until the first edit and are only then written, so
// their relative dates never go stale on disk.

export interface ReceivedResult {
  schedule: IncomeSchedule;
  /** The expected date that was just received. */
  receivedDue: string;
  amount: number;
}

export interface PaydaysStore {
  schedules: IncomeSchedule[];
  /** True when the list is the built-in sample, not the user's own paydays. */
  isSample: boolean;
  addSchedule: (input: IncomeScheduleInput) => IncomeSchedule;
  updateSchedule: (id: string, patch: Partial<IncomeScheduleInput> & { paused?: boolean }) => void;
  removeSchedule: (id: string) => void;
  setPaused: (id: string, paused: boolean) => void;
  /** Stamps `lastReceived` and rolls `nextDate` one period past the day it arrived. The caller logs the income. */
  markReceived: (id: string, options?: { receivedOn?: string; amount?: number }) => ReceivedResult | null;
  replaceAll: (schedules: IncomeSchedule[] | ((prev: IncomeSchedule[]) => IncomeSchedule[])) => void;
  resetToSample: () => void;
}

const PaydaysContext = createContext<PaydaysStore | null>(null);

const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const opt = (x: unknown, guard: (v: unknown) => boolean) => x === undefined || guard(x);
/** A real local calendar day: anything else steps occurrence expansion into garbage up to the cap (audit MON-2). */
const isIsoDay = (x: unknown): x is string => isString(x) && isValidIsoDate(x);
// Same rule as bills: anchorDay 1-31 or absent, so a corrupt 0 can never make the schedule a fixed point.
const isAnchorDay = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 31;

/** The sync and backup door for paydays: same rules as isBill (audit SEC-3, SEC-5, MON-2). */
export function isIncomeSchedule(x: unknown): x is IncomeSchedule {
  return (
    isRecord(x) &&
    isId(x.id) &&
    isId(x.memberId) &&
    isString(x.name) &&
    isNumber(x.amount) &&
    FREQUENCIES.includes(x.frequency as IncomeSchedule['frequency']) &&
    isIsoDay(x.nextDate) &&
    isId(x.categoryId) &&
    isString(x.createdAt) &&
    opt(x.accountId, isId) &&
    opt(x.variable, isBool) &&
    opt(x.paused, isBool) &&
    opt(x.lastReceived, isIsoDay) &&
    opt(x.note, isString) &&
    opt(x.anchorDay, isAnchorDay)
  );
}

/** The row-merge behind updateSchedule, exported so MF-2's anchor rule is testable without a provider. */
export function applySchedulePatch(s: IncomeSchedule, patch: Parameters<PaydaysStore['updateSchedule']>[1]): IncomeSchedule {
  const next: IncomeSchedule = { ...s, ...patch };
  if (patch.name !== undefined) next.name = patch.name.trim() || s.name;
  if (patch.amount !== undefined) next.amount = roundMoney(Math.abs(patch.amount));
  if (patch.note !== undefined) next.note = patch.note.trim() || undefined;
  if (patch.accountId !== undefined) next.accountId = patch.accountId || undefined;
  if (patch.variable !== undefined) next.variable = patch.variable || undefined;
  if (patch.paused !== undefined) next.paused = patch.paused || undefined;
  // Same rule as bills: only a genuinely changed date re-anchors (QA MF-2).
  if (patch.anchorDay === undefined && patch.nextDate !== undefined && patch.nextDate !== s.nextDate) next.anchorDay = dayOfMonth(patch.nextDate);
  // Same rule as bills: turning a week-based schedule month-based re-anchors on the day it is due now (audit MF-1).
  if (patch.frequency !== undefined && isMonthBased(patch.frequency) && !isMonthBased(s.frequency)) next.anchorDay = dayOfMonth(next.nextDate);
  return next;
}

const readSchedules = (x: unknown): IncomeSchedule[] | null => (Array.isArray(x) ? validRows(x, isIncomeSchedule) : null);

export function PaydaysProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const stored = useRef<IncomeSchedule[] | null | undefined>(undefined);
  if (stored.current === undefined) stored.current = persist ? readStored(STORAGE_KEYS.paydays, readSchedules) : null;
  const [schedules, setSchedules] = useState<IncomeSchedule[]>(() => stored.current ?? sampleSchedules());
  const [isSample, setIsSample] = useState(stored.current == null);

  // Another tab on this device wrote the paydays (QA M7): adopt its copy instead of clobbering it on our next save.
  useEffect(() => {
    if (!persist) return;
    return subscribeStored(STORAGE_KEYS.paydays, () => {
      const fresh = readStored(STORAGE_KEYS.paydays, readSchedules);
      if (!fresh) return;
      noteStorageAdoption(STORAGE_KEYS.paydays, { paydays: fresh }); // (audit SY-3)
      setSchedules(fresh);
      setIsSample(false);
    });
  }, [persist]);
  const ref = useRef(schedules);
  ref.current = schedules;

  const commit = useCallback(
    (update: (prev: IncomeSchedule[]) => IncomeSchedule[]) => {
      setSchedules((prev) => {
        const next = update(prev);
        if (persist) writeStored(STORAGE_KEYS.paydays, next);
        return next;
      });
      setIsSample(false);
    },
    [persist],
  );

  const addSchedule = useCallback(
    (input: IncomeScheduleInput) => {
      const schedule: IncomeSchedule = {
        id: newId('p'),
        memberId: input.memberId,
        name: input.name.trim() || 'Pay',
        amount: roundMoney(Math.abs(input.amount)),
        frequency: input.frequency,
        nextDate: input.nextDate,
        anchorDay: input.anchorDay ?? dayOfMonth(input.nextDate),
        categoryId: input.categoryId,
        accountId: input.accountId || undefined,
        variable: input.variable || undefined,
        note: input.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      commit((prev) => [schedule, ...prev]);
      return schedule;
    },
    [commit],
  );

  const updateSchedule = useCallback<PaydaysStore['updateSchedule']>((id, patch) => commit((prev) => prev.map((s) => (s.id === id ? applySchedulePatch(s, patch) : s))), [commit]);

  const removeSchedule = useCallback((id: string) => commit((prev) => prev.filter((s) => s.id !== id)), [commit]);

  const setPaused = useCallback((id: string, paused: boolean) => commit((prev) => prev.map((s) => (s.id === id ? { ...s, paused: paused || undefined } : s))), [commit]);

  const markReceived = useCallback<PaydaysStore['markReceived']>(
    (id, options) => {
      const current = ref.current.find((s) => s.id === id);
      if (!current) return null;
      const receivedOn = options?.receivedOn ?? todayIso();
      const amount = roundMoney(Math.abs(options?.amount ?? current.amount));
      // Legacy rows predate anchorDay: backfill from the current date so the anchor is explicit (and synced) from here on.
      const anchorDay = current.anchorDay ?? dayOfMonth(current.nextDate);
      // Same rule as bills (product decision, 2026-08-29): one "received" logs ONE
      // occurrence and advances one step - missed paydays each get their own
      // income row instead of vanishing behind a single catch-up tap.
      const updated: IncomeSchedule = { ...current, anchorDay, lastReceived: receivedOn, nextDate: addFrequency(current.nextDate, current.frequency, anchorDay) };
      // Advance the ref eagerly: a second call in the same React batch must see
      // this receipt, or both would settle the same occurrence (QA7 B-4).
      ref.current = ref.current.map((s) => (s.id === id ? updated : s));
      commit((prev) => prev.map((s) => (s.id === id ? updated : s)));
      return { schedule: updated, receivedDue: current.nextDate, amount };
    },
    [commit],
  );

  const replaceAll = useCallback((next: IncomeSchedule[] | ((prev: IncomeSchedule[]) => IncomeSchedule[])) => commit((prev) => (typeof next === 'function' ? next(prev) : next).filter(isIncomeSchedule)), [commit]);

  const resetToSample = useCallback(() => {
    removeStored(STORAGE_KEYS.paydays);
    setSchedules(sampleSchedules());
    setIsSample(true);
  }, []);

  const value = useMemo<PaydaysStore>(
    () => ({ schedules, isSample, addSchedule, updateSchedule, removeSchedule, setPaused, markReceived, replaceAll, resetToSample }),
    [schedules, isSample, addSchedule, updateSchedule, removeSchedule, setPaused, markReceived, replaceAll, resetToSample],
  );

  return <PaydaysContext.Provider value={value}>{children}</PaydaysContext.Provider>;
}

export function usePaydays(): PaydaysStore {
  const ctx = useContext(PaydaysContext);
  if (!ctx) throw new Error('usePaydays must be used inside <PaydaysProvider>');
  return ctx;
}
