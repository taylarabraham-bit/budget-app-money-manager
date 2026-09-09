import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TransactionRecord } from '../data/types';
import { QuickAddManageDialog } from '../features/quickadd';
import { ErrorBoundary } from './ErrorBoundary';
import { LogPurchaseDialog } from './LogPurchaseDialog';

// The one "log a purchase" dialog for the whole app, opened from anywhere
// (the nav "+", a shopping-list item, a reminder) with an optional prefill
// and a callback for what was saved. A context rather than props because a
// dialog opened from inside another dialog or sub-screen cannot be reached
// by prop drilling.

export type LogKind = 'expense' | 'income';

export interface LogPurchasePrefill {
  kind?: LogKind;
  amount?: number | null;
  categoryId?: string;
  title?: string;
  memberId?: string;
  shared?: boolean;
  note?: string;
  /** "YYYY-MM-DD" - opens the When row on that day (time noon). */
  date?: string;
}

export interface LogPurchaseRequest {
  /** Shorthand for `initial.kind`. */
  kind?: LogKind;
  initial?: LogPurchasePrefill;
  /** Edit an existing entry instead of creating one. */
  editing?: TransactionRecord;
  /** Where it was opened from, for copy in the dialog. */
  source?: 'nav' | 'overview' | 'shopping-list' | 'wish-list' | 'reminder' | 'activity' | 'quick-add';
  onSaved?: (record: TransactionRecord, mode: 'created' | 'updated') => void;
}

export interface LogPurchaseApi {
  open: (request?: LogPurchaseRequest) => void;
  edit: (record: TransactionRecord, onSaved?: LogPurchaseRequest['onSaved']) => void;
  close: () => void;
}

const LogPurchaseContext = createContext<LogPurchaseApi | null>(null);

export function LogPurchaseProvider({ children }: { children: ReactNode }) {
  // null = closed. Every open() stores a fresh object so the dialog re-initialises even for an identical request.
  const [request, setRequest] = useState<LogPurchaseRequest | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const open = useCallback((req: LogPurchaseRequest = {}) => setRequest({ ...req }), []);
  const edit = useCallback((record: TransactionRecord, onSaved?: LogPurchaseRequest['onSaved']) => setRequest({ editing: record, onSaved, source: 'activity' }), []);
  const close = useCallback(() => setRequest(null), []);
  const closeManage = useCallback(() => setManageOpen(false), []);
  const api = useMemo<LogPurchaseApi>(() => ({ open, edit, close }), [open, edit, close]);
  return (
    <LogPurchaseContext.Provider value={api}>
      {children}
      {/* The manager stacks on top; the log dialog stays mounted so what was typed survives.
          Each in its own boundary: a crash inside one closes that dialog, not the whole shell (audit UI-7). */}
      <ErrorBoundary scope="dialog" onReset={close}>
        <LogPurchaseDialog open={request !== null} request={request ?? undefined} onClose={close} onManageFavourites={() => setManageOpen(true)} />
      </ErrorBoundary>
      <ErrorBoundary scope="dialog" onReset={closeManage}>
        <QuickAddManageDialog open={manageOpen} onClose={closeManage} />
      </ErrorBoundary>
    </LogPurchaseContext.Provider>
  );
}

export function useLogPurchase(): LogPurchaseApi {
  const ctx = useContext(LogPurchaseContext);
  if (!ctx) throw new Error('useLogPurchase must be used inside <LogPurchaseProvider>');
  return ctx;
}
