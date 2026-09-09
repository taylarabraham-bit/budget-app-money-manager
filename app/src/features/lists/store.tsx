import { createContext, useCallback, useEffect, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEYS, isId, isNumber, isRecord, isString, noteStorageAdoption, readStored, removeStored, validRows, writeStored , subscribeStored } from '../../data/persist';
import { useHousehold } from '../../data/store';
import { newId } from '../../lib/ids';
import { sampleListItems } from './mock';
import type { ListItem, ListItemInput, ListKind } from './types';

export interface ListsStore {
  items: ListItem[];
  isSample: boolean;
  addItem: (input: ListItemInput) => ListItem;
  updateItem: (id: string, patch: Partial<ListItemInput>) => void;
  removeItem: (id: string) => void;
  /** Tick / untick. Unticking a bought item forgets the link; the purchase itself stays in Activity. */
  toggleChecked: (id: string, checked?: boolean) => void;
  /** Removes every checked item in the list; returns how many went. */
  clearChecked: (list: ListKind) => number;
  /** Link a logged purchase: checked + checkedAt + transactionId. */
  markBought: (ids: string[], transactionId: string) => void;
  /** Wish -> shopping ("Add to shopping list") or back. */
  moveToList: (id: string, list: ListKind) => void;
  linkGoal: (id: string, goalId: string) => void;
  replaceAll: (items: ListItem[] | ((prev: ListItem[]) => ListItem[])) => void;
  resetToSample: () => void;
}

const ListsContext = createContext<ListsStore | null>(null);

const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const opt = (x: unknown, guard: (v: unknown) => boolean) => x === undefined || guard(x);
/** Only a web URL reaches an href: a synced or imported `javascript:` link would otherwise land in `<a target="_blank">` unchecked (audit SEC-3). */
const HTTP_URL = /^https?:\/\//i;
const isHttpUrl = (x: unknown): x is string => isString(x) && HTTP_URL.test(x);

/**
 * The sync and backup door for list items. Every optional field is
 * type-checked too: ShoppingRow slices `checkedAt` and WishSheet links `url`,
 * so one malformed row used to brick the Lists tab on every device rather
 * than be dropped here (audit SEC-3); ids follow the one shared rule (audit SEC-5).
 */
export function isListItem(x: unknown): x is ListItem {
  return (
    isRecord(x) &&
    isId(x.id) &&
    (x.list === 'shopping' || x.list === 'wish') &&
    isString(x.name) &&
    isId(x.addedBy) &&
    isString(x.createdAt) &&
    opt(x.estimatedAmount, isNumber) &&
    opt(x.categoryId, isId) &&
    opt(x.checked, isBool) &&
    opt(x.checkedAt, isString) &&
    opt(x.transactionId, isId) &&
    (x.priority === undefined || x.priority === 'low' || x.priority === 'medium' || x.priority === 'high') &&
    opt(x.url, isHttpUrl) &&
    opt(x.goalId, isId) &&
    opt(x.note, isString)
  );
}

const readItems = (x: unknown): ListItem[] | null => (Array.isArray(x) ? validRows(x, isListItem) : null);

const cleanUrl = (url: string | undefined) => {
  const u = url?.trim();
  return u ? (HTTP_URL.test(u) ? u : `https://${u}`) : undefined;
};

export function ListsProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const { currentMemberId } = useHousehold();
  const stored = useRef<ListItem[] | null | undefined>(undefined);
  if (stored.current === undefined) stored.current = persist ? readStored(STORAGE_KEYS.lists, readItems) : null;
  const [items, setItems] = useState<ListItem[]>(() => stored.current ?? sampleListItems());
  const [isSample, setIsSample] = useState(stored.current == null);

  // Another tab on this device wrote the lists (QA M7): adopt its copy instead of clobbering it on our next save.
  useEffect(() => {
    if (!persist) return;
    return subscribeStored(STORAGE_KEYS.lists, () => {
      const fresh = readStored(STORAGE_KEYS.lists, readItems);
      if (!fresh) return;
      noteStorageAdoption(STORAGE_KEYS.lists, { lists: fresh }); // (audit SY-3)
      setItems(fresh);
      setIsSample(false);
    });
  }, [persist]);
  const ref = useRef(items);
  ref.current = items;

  const commit = useCallback(
    (update: (prev: ListItem[]) => ListItem[]) => {
      setItems((prev) => {
        const next = update(prev);
        if (persist) writeStored(STORAGE_KEYS.lists, next);
        return next;
      });
      setIsSample(false);
    },
    [persist],
  );

  const addItem = useCallback(
    (input: ListItemInput) => {
      const item: ListItem = {
        id: newId('li'),
        list: input.list,
        name: input.name.trim() || 'Something',
        estimatedAmount: input.estimatedAmount && input.estimatedAmount > 0 ? input.estimatedAmount : undefined,
        categoryId: input.categoryId || undefined,
        addedBy: input.addedBy ?? currentMemberId,
        createdAt: new Date().toISOString(),
        priority: input.list === 'wish' ? input.priority ?? 'medium' : undefined,
        url: cleanUrl(input.url),
        note: input.note?.trim() || undefined,
      };
      commit((prev) => [...prev, item]);
      return item;
    },
    [commit, currentMemberId],
  );

  const updateItem = useCallback<ListsStore['updateItem']>(
    (id, patch) =>
      commit((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const next: ListItem = { ...i };
          if (patch.name !== undefined) next.name = patch.name.trim() || i.name;
          if (patch.estimatedAmount !== undefined) next.estimatedAmount = patch.estimatedAmount && patch.estimatedAmount > 0 ? patch.estimatedAmount : undefined;
          if (patch.categoryId !== undefined) next.categoryId = patch.categoryId || undefined;
          if (patch.priority !== undefined) next.priority = patch.priority;
          if (patch.url !== undefined) next.url = cleanUrl(patch.url);
          if (patch.note !== undefined) next.note = patch.note.trim() || undefined;
          if (patch.list !== undefined) next.list = patch.list;
          return next;
        }),
      ),
    [commit],
  );

  const removeItem = useCallback((id: string) => commit((prev) => prev.filter((i) => i.id !== id)), [commit]);

  const toggleChecked = useCallback<ListsStore['toggleChecked']>(
    (id, checked) =>
      commit((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const next = checked ?? !i.checked;
          return next ? { ...i, checked: true, checkedAt: new Date().toISOString() } : { ...i, checked: undefined, checkedAt: undefined, transactionId: undefined };
        }),
      ),
    [commit],
  );

  const clearChecked = useCallback(
    (list: ListKind) => {
      const count = ref.current.filter((i) => i.list === list && i.checked).length;
      commit((prev) => prev.filter((i) => !(i.list === list && i.checked)));
      return count;
    },
    [commit],
  );

  const markBought = useCallback(
    (ids: string[], transactionId: string) => {
      const at = new Date().toISOString();
      commit((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, checked: true, checkedAt: at, transactionId } : i)));
    },
    [commit],
  );

  const moveToList = useCallback((id: string, list: ListKind) => commit((prev) => prev.map((i) => (i.id === id ? { ...i, list, checked: undefined, checkedAt: undefined, transactionId: undefined } : i))), [commit]);

  const linkGoal = useCallback((id: string, goalId: string) => commit((prev) => prev.map((i) => (i.id === id ? { ...i, goalId } : i))), [commit]);

  const replaceAll = useCallback((next: ListItem[] | ((prev: ListItem[]) => ListItem[])) => commit((prev) => (typeof next === 'function' ? next(prev) : next).filter(isListItem)), [commit]);

  const resetToSample = useCallback(() => {
    removeStored(STORAGE_KEYS.lists);
    setItems(sampleListItems());
    setIsSample(true);
  }, []);

  const value = useMemo<ListsStore>(
    () => ({ items, isSample, addItem, updateItem, removeItem, toggleChecked, clearChecked, markBought, moveToList, linkGoal, replaceAll, resetToSample }),
    [items, isSample, addItem, updateItem, removeItem, toggleChecked, clearChecked, markBought, moveToList, linkGoal, replaceAll, resetToSample],
  );

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useLists(): ListsStore {
  const ctx = useContext(ListsContext);
  if (!ctx) throw new Error('useLists must be used inside <ListsProvider>');
  return ctx;
}
