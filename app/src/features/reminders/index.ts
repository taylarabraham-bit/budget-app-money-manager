// Reminders derived from the data: bills, budgets, cash flow, earnings,
// approvals, paydays, goal deadlines, the partner balance. Wire-up: wrap the
// app in <RemindersProvider> (inside the household, bills, paydays and
// settlements providers), put <RemindersButton /> in the header actions,
// render <RemindersDialog /> once in App and <ReminderAlert /> on Overview.
export { RemindersProvider, useReminders } from './store';
export { RemindersButton } from './RemindersButton';
export { RemindersDialog } from './RemindersDialog';
export { ReminderAlert } from './ReminderAlert';
export { selectReminders } from './rules';
export { notificationPermission, NOTIFY_RULES } from './notifications';
export type { Reminder, ReminderRule, ReminderPriority, ReminderTarget, RemindersState } from './types';
export { PRIORITY_TITLE } from './types';
