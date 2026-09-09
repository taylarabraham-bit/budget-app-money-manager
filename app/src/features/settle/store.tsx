import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEYS, isId, isNumber, isRecord, isString, noteStorageAdoption, readStored, removeStored, validRows, writeStored , subscribeStored } from '../../data/persist';
import { roundMoney, toCents } from '../../data/split';
import { nowIsoDateTime } from '../../lib/dates';
import { newId } from '../../lib/ids';
import { sampleSettlements } from './mock';
import { SETTLEMENT_METHODS, type Settlement, type SettlementInput } from './types';

// Self-contained settlements store, beside the household store like bills.
// The balance itself is never stored: it is derived from the current shared
// purchases and these payments (see selectors.ts), so it self-corrects when a
// purchase is edited or deleted. Sample payments show until the first edit.

export interface SettlementsStore {
  settlements: Settlement[];
  /** True when the list is the built-in sample, not the user's own payments. */
  isSample: boolean;
  /** Record a payment; null when the input is unusable (zero amount, same member on both sides). */
  addSettlement: (input: SettlementInput) => Settlement | null;
  removeSettlement: (id: string) => void;
  /** Replace the whole list (backup import, first-run setup), or merge via an updater (sync applies). */
  replaceAll: (settlements: Settlement[] | ((prev: Settlement[]) => Settlement[])) => void;
  /** Throw away this device's payments and show the sample list again. */
  resetToSample: () => void;
}

const SettlementsContext = createContext<SettlementsStore | null>(null);

/** The sync and backup door for settle-up payments; ids (own and both members') follow the one shared rule (audit SEC-5). */
export function isSettlement(x: unknown): x is Settlement {
  return (
    isRecord(x) &&
    isId(x.id) &&
    isId(x.fromMemberId) &&
    isId(x.toMemberId) &&
    x.fromMemberId !== x.toMemberId &&
    isNumber(x.amount) &&
    // At least one whole cent: a 0.004 row would render as "$0.00 paid" and move nothing.
    toCents(x.amount) > 0 &&
    isString(x.date) &&
    isString(x.createdAt) &&
    (x.method === undefined || SETTLEMENT_METHODS.includes(x.method as Settlement['method'] & string)) &&
    (x.note === undefined || isString(x.note))
  );
}

const readSettlements = (x: unknown): Settlement[] | null => (Array.isArray(x) ? validRows(x, isSettlement) : null);

export function SettlementsProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const stored = useRef<Settlement[] | null | undefined>(undefined);
  if (stored.current === undefined) stored.current = persist ? readStored(STORAGE_KEYS.settlements, readSettlements) : null;
  const [settlements, setSettlements] = useState<Settlement[]>(() => stored.current ?? sampleSettlements());
  const [isSample, setIsSample] = useState(stored.current == null);

  // Another tab on this device wrote the settle-up history (QA M7): adopt its copy instead of clobbering it on our next save.
  useEffect(() => {
    if (!persist) return;
    return subscribeStored(STORAGE_KEYS.settlements, () => {
      const fresh = readStored(STORAGE_KEYS.settlements, readSettlements);
      if (!fresh) return;
      noteStorageAdoption(STORAGE_KEYS.settlements, { settlements: fresh }); // (audit SY-3)
      setSettlements(fresh);
      setIsSample(false);
    });
  }, [persist]);

  // Every mutation goes through here so storage and state never disagree.
  const commit = useCallback(
    (update: (prev: Settlement[]) => Settlement[]) => {
      setSettlements((prev) => {
        const next = update(prev);
        if (persist) writeStored(STORAGE_KEYS.settlements, next);
        return next;
      });
      setIsSample(false);
    },
    [persist],
  );

  const addSettlement = useCallback<SettlementsStore['addSettlement']>(
    (input) => {
      // Whole cents: what gets recorded must equal what the dialog previewed,
      // and a sub-cent entry (0.004) rounds to nothing and is rejected.
      const amount = roundMoney(Math.abs(input.amount));
      if (!(amount > 0) || input.fromMemberId === input.toMemberId) return null;
      const settlement: Settlement = {
        id: newId('s'),
        fromMemberId: input.fromMemberId,
        toMemberId: input.toMemberId,
        amount,
        date: input.date ?? nowIsoDateTime(),
        method: input.method,
        note: input.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      commit((prev) => [settlement, ...prev]);
      return settlement;
    },
    [commit],
  );

  const removeSettlement = useCallback((id: string) => commit((prev) => prev.filter((s) => s.id !== id)), [commit]);

  const replaceAll = useCallback((next: Settlement[] | ((prev: Settlement[]) => Settlement[])) => commit((prev) => (typeof next === 'function' ? next(prev) : next).filter(isSettlement)), [commit]);

  const resetToSample = useCallback(() => {
    removeStored(STORAGE_KEYS.settlements);
    setSettlements(sampleSettlements());
    setIsSample(true);
  }, []);

  const value = useMemo<SettlementsStore>(
    () => ({ settlements, isSample, addSettlement, removeSettlement, replaceAll, resetToSample }),
    [settlements, isSample, addSettlement, removeSettlement, replaceAll, resetToSample],
  );

  return <SettlementsContext.Provider value={value}>{children}</SettlementsContext.Provider>;
}

export function useSettlements(): SettlementsStore {
  const ctx = useContext(SettlementsContext);
  if (!ctx) throw new Error('useSettlements must be used inside <SettlementsProvider>');
  return ctx;
}
