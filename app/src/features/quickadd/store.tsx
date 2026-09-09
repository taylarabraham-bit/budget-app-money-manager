import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEYS, isId, isNumber, isRecord, isString, noteStorageAdoption, readStored, removeStored, validRows, writeStored , subscribeStored } from '../../data/persist';
import { newId } from '../../lib/ids';
import { sampleQuickAdds } from './mock';
import type { QuickAdd, QuickAddInput, QuickAddKind } from './types';

export interface QuickAddStore {
  quickAdds: QuickAdd[];
  isSample: boolean;
  /** Adds a favourite; an existing one with the same title, amount and kind is returned instead of duplicated. */
  addQuickAdd: (input: QuickAddInput) => QuickAdd;
  updateQuickAdd: (id: string, patch: Partial<QuickAddInput>) => void;
  removeQuickAdd: (id: string) => void;
  /** Bumps usage so the most-used chips come first. */
  touchQuickAdd: (id: string) => void;
  replaceAll: (quickAdds: QuickAdd[] | ((prev: QuickAdd[]) => QuickAdd[])) => void;
  resetToSample: () => void;
}

const QuickAddContext = createContext<QuickAddStore | null>(null);

const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const opt = (x: unknown, guard: (v: unknown) => boolean) => x === undefined || guard(x);

/** The sync and backup door for favourites: every optional field checked (audit SEC-3), ids under the one shared rule (audit SEC-5). */
export function isQuickAdd(x: unknown): x is QuickAdd {
  return (
    isRecord(x) &&
    isId(x.id) &&
    isString(x.title) &&
    isNumber(x.amount) &&
    (x.kind === 'expense' || x.kind === 'income') &&
    isId(x.categoryId) &&
    isNumber(x.useCount) &&
    isString(x.createdAt) &&
    opt(x.shared, isBool) &&
    opt(x.icon, isString) &&
    opt(x.memberId, isId) &&
    opt(x.lastUsedAt, isString)
  );
}

const readQuickAdds = (x: unknown): QuickAdd[] | null => (Array.isArray(x) ? validRows(x, isQuickAdd) : null);

const sameShortcut = (a: Pick<QuickAdd, 'title' | 'amount' | 'kind'>, b: Pick<QuickAdd, 'title' | 'amount' | 'kind'>) =>
  a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && Math.round(a.amount * 100) === Math.round(b.amount * 100) && a.kind === b.kind;

/** Chips for the dialog: the given kind, most recently used first, then most used. */
export function selectQuickAdds(quickAdds: QuickAdd[], kind: QuickAddKind, limit = 8): QuickAdd[] {
  return quickAdds
    .filter((q) => q.kind === kind)
    .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || b.useCount - a.useCount || a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

export function QuickAddProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const stored = useRef<QuickAdd[] | null | undefined>(undefined);
  if (stored.current === undefined) stored.current = persist ? readStored(STORAGE_KEYS.quickAdds, readQuickAdds) : null;
  const [quickAdds, setQuickAdds] = useState<QuickAdd[]>(() => stored.current ?? sampleQuickAdds());
  const [isSample, setIsSample] = useState(stored.current == null);

  // Another tab on this device wrote the favourites (QA M7): adopt its copy instead of clobbering it on our next save.
  useEffect(() => {
    if (!persist) return;
    return subscribeStored(STORAGE_KEYS.quickAdds, () => {
      const fresh = readStored(STORAGE_KEYS.quickAdds, readQuickAdds);
      if (!fresh) return;
      noteStorageAdoption(STORAGE_KEYS.quickAdds, { quickAdds: fresh }); // (audit SY-3)
      setQuickAdds(fresh);
      setIsSample(false);
    });
  }, [persist]);
  const ref = useRef(quickAdds);
  ref.current = quickAdds;

  const commit = useCallback(
    (update: (prev: QuickAdd[]) => QuickAdd[]) => {
      setQuickAdds((prev) => {
        const next = update(prev);
        if (persist) writeStored(STORAGE_KEYS.quickAdds, next);
        return next;
      });
      setIsSample(false);
    },
    [persist],
  );

  const addQuickAdd = useCallback(
    (input: QuickAddInput) => {
      const existing = ref.current.find((q) => sameShortcut(q, input));
      if (existing) return existing;
      const quickAdd: QuickAdd = {
        id: newId('q'),
        title: input.title.trim() || 'Favourite',
        amount: Math.abs(input.amount),
        kind: input.kind,
        categoryId: input.categoryId,
        shared: input.shared || undefined,
        icon: input.icon?.trim() || undefined,
        // Empty means "whoever is logging" - never store '' where the guard expects an id.
        memberId: input.memberId || undefined,
        useCount: 0,
        createdAt: new Date().toISOString(),
      };
      commit((prev) => [quickAdd, ...prev]);
      return quickAdd;
    },
    [commit],
  );

  const updateQuickAdd = useCallback<QuickAddStore['updateQuickAdd']>(
    (id, patch) =>
      commit((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const next: QuickAdd = { ...q, ...patch };
          if (patch.title !== undefined) next.title = patch.title.trim() || q.title;
          if (patch.amount !== undefined) next.amount = Math.abs(patch.amount);
          if (patch.icon !== undefined) next.icon = patch.icon.trim() || undefined;
          if (patch.shared !== undefined) next.shared = patch.shared || undefined;
          if (patch.memberId !== undefined) next.memberId = patch.memberId || undefined;
          return next;
        }),
      ),
    [commit],
  );

  const removeQuickAdd = useCallback((id: string) => commit((prev) => prev.filter((q) => q.id !== id)), [commit]);

  const touchQuickAdd = useCallback((id: string) => commit((prev) => prev.map((q) => (q.id === id ? { ...q, useCount: q.useCount + 1, lastUsedAt: new Date().toISOString() } : q))), [commit]);

  const replaceAll = useCallback((next: QuickAdd[] | ((prev: QuickAdd[]) => QuickAdd[])) => commit((prev) => (typeof next === 'function' ? next(prev) : next).filter(isQuickAdd)), [commit]);

  const resetToSample = useCallback(() => {
    removeStored(STORAGE_KEYS.quickAdds);
    setQuickAdds(sampleQuickAdds());
    setIsSample(true);
  }, []);

  const value = useMemo<QuickAddStore>(
    () => ({ quickAdds, isSample, addQuickAdd, updateQuickAdd, removeQuickAdd, touchQuickAdd, replaceAll, resetToSample }),
    [quickAdds, isSample, addQuickAdd, updateQuickAdd, removeQuickAdd, touchQuickAdd, replaceAll, resetToSample],
  );

  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>;
}

export function useQuickAdds(): QuickAddStore {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error('useQuickAdds must be used inside <QuickAddProvider>');
  return ctx;
}
