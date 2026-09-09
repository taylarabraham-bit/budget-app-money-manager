import { formatLongDate, formatShortDate } from '../../lib/dates';

// Bill-specific wording on top of the shared calendar helpers (lib/dates) and
// recurrence maths (lib/frequency, shared with paydays). The names below are
// kept so nothing in the bills feature had to change.

export { daysFromNow, daysUntil, isValidIsoDate, startOfDay, toIsoDate, todayIso } from '../../lib/dates';
export { addFrequency } from '../../lib/frequency';

/** "Sep 1" this year, "Sep 1, 2027" otherwise. */
export const formatDueDate = formatShortDate;

/** "Mon, Sep 1, 2026" - for the detail sheet. */
export const formatDueDateLong = formatLongDate;

/** Human due status from the day count: "Overdue by 2 days", "Due today", "Due in 5 days", "Due Sep 14". */
export function dueLabel(days: number, iso: string, now: Date = new Date()): string {
  if (days < 0) return `Overdue by ${-days} ${-days === 1 ? 'day' : 'days'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 14) return `Due in ${days} days`;
  return `Due ${formatDueDate(iso, now)}`;
}
