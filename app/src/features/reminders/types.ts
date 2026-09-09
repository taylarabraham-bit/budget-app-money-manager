import type { LogKind } from '../../components/LogPurchaseProvider';
import type { Route } from '../../navigation';

// Reminders are derived from the current data (bills, budgets, earnings,
// paydays, goals, the partner balance, purchases awaiting confirmation) -
// nothing is stored except which ones were dismissed. Each reminder's id
// embeds its subject and period, so a dismissal expires on its own when the
// subject moves on (a new due date, a new month, a new day).

export type ReminderRule =
  | 'bill-overdue'
  | 'bill-due-today'
  | 'bill-due-tomorrow'
  | 'card-due-soon'
  | 'card-due-tomorrow'
  | 'card-due-today'
  | 'card-payment-missed'
  | 'budget-over'
  | 'budget-near'
  | 'cashflow-negative'
  | 'no-earnings-today'
  | 'pending-approval'
  | 'disputed'
  | 'payday'
  | 'payday-overdue'
  | 'goal-deadline'
  | 'partner-balance';

/** 1 needs attention · 2 today · 3 heads up */
export type ReminderPriority = 1 | 2 | 3;

export type ReminderTarget = { kind: 'route'; route: Route } | { kind: 'log'; log: LogKind };

export interface Reminder {
  /** Stable per subject + period, e.g. "bill-overdue:b_power:2026-08-21". */
  id: string;
  rule: ReminderRule;
  priority: ReminderPriority;
  tone: 'danger' | 'warning' | 'info' | 'success';
  icon: string;
  title: string;
  body: string;
  amount?: number;
  action?: { label: string; target: ReminderTarget };
}

export const PRIORITY_TITLE: Record<ReminderPriority, string> = { 1: 'Needs attention', 2: 'Today', 3: 'Heads up' };

/** What persists: dismissals and the notification preference. */
export interface RemindersState {
  /** Reminder id -> ISO datetime it was dismissed. */
  dismissed: Record<string, string>;
  notificationsEnabled: boolean;
  /** Reminder id -> the local day a native notification was last shown for it. */
  lastNotified: Record<string, string>;
}
