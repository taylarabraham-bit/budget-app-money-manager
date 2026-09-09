import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEYS, isId, isNumber, isRecord, isString, noteStorageAdoption, readStored, removeStored, subscribeStored, validRows, writeStored } from '../../data/persist';
import { roundMoney } from '../../data/split';
import { nowIsoDateTime } from '../../lib/dates';
import { newId } from '../../lib/ids';
import { sampleAccounts, sampleTransfers } from './mock';
import { ACCOUNT_KINDS, KIND_LABEL, type Account, type AccountInput, type AccountTransfer, type TransferInput } from './types';

// Self-contained accounts store, beside the household store like bills and
// paydays. One blob holds both arrays (accounts + transfers) so a card
// payment and the account it came from save atomically; sync treats them as
// two collections, exactly like the household blob's six. Sample accounts
// show until the first edit and are only then written, so their relative
// dates never go stale on disk.

export interface AccountsStore {
  accounts: Account[];
  transfers: AccountTransfer[];
  /** True when the lists are the built-in sample, not the user's own accounts. */
  isSample: boolean;
  addAccount: (input: AccountInput) => Account;
  updateAccount: (id: string, patch: Partial<AccountInput> & { archived?: boolean }) => void;
  /** Removes the account. History that pointed at it stays (loose ids); transfers keep their other end's balance right. */
  removeAccount: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  /** Records a move between accounts (or in/out of them). Null when the input is unusable (no ends, same ends, or a zero amount). */
  addTransfer: (input: TransferInput) => AccountTransfer | null;
  removeTransfer: (id: string) => void;
  /** Replace the whole list (backup import), or merge via an updater (sync applies - never discards an edit racing them). Saved immediately. */
  replaceAllAccounts: (accounts: Account[] | ((prev: Account[]) => Account[])) => void;
  replaceAllTransfers: (transfers: AccountTransfer[] | ((prev: AccountTransfer[]) => AccountTransfer[])) => void;
  /** Throw away this device's accounts and show the sample list again. */
  resetToSample: () => void;
}

interface AccountsState {
  accounts: Account[];
  transfers: AccountTransfer[];
}

const AccountsContext = createContext<AccountsStore | null>(null);

const isInt = (x: unknown, min: number, max: number): boolean => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

// Ids (own and foreign) follow the one shared rule (audit SEC-5).
export function isAccount(x: unknown): x is Account {
  return (
    isRecord(x) &&
    isId(x.id) &&
    isString(x.name) &&
    ACCOUNT_KINDS.includes(x.kind as Account['kind']) &&
    isNumber(x.openingBalance) &&
    isString(x.createdAt) &&
    (x.memberId === undefined || isId(x.memberId)) &&
    (x.note === undefined || isString(x.note)) &&
    (x.archived === undefined || typeof x.archived === 'boolean') &&
    // Credit terms feed the interest maths: a corrupt rate or day must drop the
    // row at the door (same rule as bills' anchorDay), not NaN a projection.
    (x.apr === undefined || (isNumber(x.apr) && x.apr >= 0 && x.apr <= 100)) &&
    (x.creditLimit === undefined || isNumber(x.creditLimit)) &&
    (x.statementDay === undefined || isInt(x.statementDay, 1, 31)) &&
    (x.dueDaysAfterStatement === undefined || isInt(x.dueDaysAfterStatement, 0, 90)) &&
    (x.minPaymentPercent === undefined || (isNumber(x.minPaymentPercent) && x.minPaymentPercent >= 0 && x.minPaymentPercent <= 100)) &&
    (x.minPaymentFloor === undefined || isNumber(x.minPaymentFloor))
  );
}

export function isAccountTransfer(x: unknown): x is AccountTransfer {
  return (
    isRecord(x) &&
    isId(x.id) &&
    isNumber(x.amount) &&
    isString(x.date) &&
    isString(x.createdAt) &&
    (x.fromAccountId === undefined || isId(x.fromAccountId)) &&
    (x.toAccountId === undefined || isId(x.toAccountId)) &&
    // A transfer with neither end says nothing about any balance.
    (isId(x.fromAccountId) || isId(x.toAccountId)) &&
    (x.memberId === undefined || isId(x.memberId)) &&
    (x.note === undefined || isString(x.note))
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const pctOrUndefined = (v: number) => (Number.isFinite(v) && v > 0 ? round2(Math.min(100, v)) : undefined);
const positiveMoneyOrUndefined = (v: number) => (Number.isFinite(v) && v > 0 ? roundMoney(v) : undefined);
const intOrUndefined = (v: number, min: number, max: number) => (Number.isFinite(v) && Number.isInteger(v) && v >= min && v <= max ? v : undefined);

/**
 * The row-merge behind updateAccount (and, on a fresh base row, addAccount),
 * exported so the write-boundary rules are testable without a provider:
 * money quantized to whole cents, rates to 2 dp, out-of-range terms dropped,
 * and credit terms scrubbed from rows that are not credit cards.
 */
export function applyAccountPatch(a: Account, patch: Partial<AccountInput> & { archived?: boolean }): Account {
  const next: Account = { ...a, ...patch };
  if (patch.name !== undefined) next.name = patch.name.trim() || a.name;
  if (patch.note !== undefined) next.note = patch.note.trim() || undefined;
  if (patch.memberId !== undefined) next.memberId = patch.memberId || undefined;
  if (patch.archived !== undefined) next.archived = patch.archived || undefined;
  if (patch.openingBalance !== undefined) next.openingBalance = roundMoney(patch.openingBalance);
  if (patch.apr !== undefined) next.apr = Number.isFinite(patch.apr) && patch.apr >= 0 ? round2(Math.min(100, patch.apr)) : undefined;
  if (patch.creditLimit !== undefined) next.creditLimit = positiveMoneyOrUndefined(patch.creditLimit);
  if (patch.statementDay !== undefined) next.statementDay = intOrUndefined(patch.statementDay, 1, 31);
  if (patch.dueDaysAfterStatement !== undefined) next.dueDaysAfterStatement = intOrUndefined(patch.dueDaysAfterStatement, 0, 90);
  if (patch.minPaymentPercent !== undefined) next.minPaymentPercent = pctOrUndefined(patch.minPaymentPercent);
  if (patch.minPaymentFloor !== undefined) next.minPaymentFloor = positiveMoneyOrUndefined(patch.minPaymentFloor);
  if (next.kind === 'credit') {
    // A card's balance is what is OWED - always positive.
    next.openingBalance = roundMoney(Math.abs(next.openingBalance));
  } else {
    next.apr = undefined;
    next.creditLimit = undefined;
    next.statementDay = undefined;
    next.dueDaysAfterStatement = undefined;
    next.minPaymentPercent = undefined;
    next.minPaymentFloor = undefined;
  }
  return next;
}

/**
 * The write-boundary rules behind addTransfer, exported for tests: a move
 * needs two distinct ends (or one end and the outside world) and real money;
 * amounts land as whole positive cents and dates never in the future.
 */
export function buildTransfer(input: TransferInput, now: string = nowIsoDateTime()): AccountTransfer | null {
  const fromAccountId = input.fromAccountId || undefined;
  const toAccountId = input.toAccountId || undefined;
  const amount = roundMoney(Math.abs(input.amount));
  if ((!fromAccountId && !toAccountId) || fromAccountId === toAccountId || !(amount > 0)) return null;
  return {
    id: newId('at'),
    fromAccountId,
    toAccountId,
    amount,
    date: input.date && input.date <= now ? input.date : now,
    memberId: input.memberId || undefined,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
}

const readState = (x: unknown): AccountsState | null => (isRecord(x) ? { accounts: validRows(x.accounts, isAccount), transfers: validRows(x.transfers, isAccountTransfer) } : null);

const sampleState = (): AccountsState => ({ accounts: sampleAccounts(), transfers: sampleTransfers() });

export function AccountsProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const stored = useRef<AccountsState | null | undefined>(undefined);
  if (stored.current === undefined) stored.current = persist ? readStored(STORAGE_KEYS.accounts, readState) : null;
  const [state, setState] = useState<AccountsState>(() => stored.current ?? sampleState());
  const [isSample, setIsSample] = useState(stored.current == null);

  // Another tab on this device wrote the accounts (QA M7): adopt its copy instead of clobbering it on our next save.
  useEffect(() => {
    if (!persist) return;
    return subscribeStored(STORAGE_KEYS.accounts, () => {
      const fresh = readStored(STORAGE_KEYS.accounts, readState);
      if (!fresh) return;
      noteStorageAdoption(STORAGE_KEYS.accounts, { accounts: fresh.accounts, accountTransfers: fresh.transfers }); // (audit SY-3)
      setState(fresh);
      setIsSample(false);
    });
  }, [persist]);
  const ref = useRef(state);
  ref.current = state;

  const commit = useCallback(
    (update: (prev: AccountsState) => AccountsState) => {
      setState((prev) => {
        const next = update(prev);
        if (persist) writeStored(STORAGE_KEYS.accounts, next);
        return next;
      });
      setIsSample(false);
    },
    [persist],
  );

  const addAccount = useCallback(
    (input: AccountInput) => {
      const base: Account = { id: newId('a'), name: KIND_LABEL[input.kind], kind: input.kind, openingBalance: 0, createdAt: new Date().toISOString() };
      const account = applyAccountPatch(base, input);
      commit((prev) => ({ ...prev, accounts: [...prev.accounts, account] }));
      return account;
    },
    [commit],
  );

  const updateAccount = useCallback<AccountsStore['updateAccount']>(
    (id, patch) => commit((prev) => ({ ...prev, accounts: prev.accounts.map((a) => (a.id === id ? applyAccountPatch(a, patch) : a)) })),
    [commit],
  );

  const removeAccount = useCallback((id: string) => commit((prev) => ({ ...prev, accounts: prev.accounts.filter((a) => a.id !== id) })), [commit]);

  const setArchived = useCallback((id: string, archived: boolean) => commit((prev) => ({ ...prev, accounts: prev.accounts.map((a) => (a.id === id ? { ...a, archived: archived || undefined } : a)) })), [commit]);

  const addTransfer = useCallback<AccountsStore['addTransfer']>(
    (input) => {
      const transfer = buildTransfer(input);
      if (!transfer) return null;
      commit((prev) => ({ ...prev, transfers: [transfer, ...prev.transfers] }));
      return transfer;
    },
    [commit],
  );

  const removeTransfer = useCallback((id: string) => commit((prev) => ({ ...prev, transfers: prev.transfers.filter((t) => t.id !== id) })), [commit]);

  const replaceAllAccounts = useCallback<AccountsStore['replaceAllAccounts']>(
    (next) => commit((prev) => ({ ...prev, accounts: (typeof next === 'function' ? next(prev.accounts) : next).filter(isAccount) })),
    [commit],
  );

  const replaceAllTransfers = useCallback<AccountsStore['replaceAllTransfers']>(
    (next) => commit((prev) => ({ ...prev, transfers: (typeof next === 'function' ? next(prev.transfers) : next).filter(isAccountTransfer) })),
    [commit],
  );

  const resetToSample = useCallback(() => {
    removeStored(STORAGE_KEYS.accounts);
    setState(sampleState());
    setIsSample(true);
  }, []);

  const value = useMemo<AccountsStore>(
    () => ({
      accounts: state.accounts,
      transfers: state.transfers,
      isSample,
      addAccount,
      updateAccount,
      removeAccount,
      setArchived,
      addTransfer,
      removeTransfer,
      replaceAllAccounts,
      replaceAllTransfers,
      resetToSample,
    }),
    [state, isSample, addAccount, updateAccount, removeAccount, setArchived, addTransfer, removeTransfer, replaceAllAccounts, replaceAllTransfers, resetToSample],
  );

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsStore {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error('useAccounts must be used inside <AccountsProvider>');
  return ctx;
}
