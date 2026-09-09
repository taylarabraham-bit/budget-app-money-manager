import { parseIsoDate } from '@budget-app/ui';

// Calendar-day helpers shared by screens. Dates the user picks (goal
// deadlines, bill due dates) are LOCAL calendar days stored as "YYYY-MM-DD";
// everything here works in local Date components, never UTC.

const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as "YYYY-MM-DD". The year pads to 4 digits so a mistyped
 * ancient year still yields a well-formed, correctly-sorting key ("0202-03"). */
export function toIsoDate(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Today's local calendar day. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

/** The calendar day `days` days from now (negative for the past). */
export function daysFromNow(days: number, now: Date = new Date()): string {
  const d = startOfDay(now);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** First of next month as a local calendar day. */
export function firstOfNextMonth(now: Date = new Date()): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

/** "2026-09-01" -> true when it is a real calendar day. */
export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = parseIsoDate(iso);
  return !Number.isNaN(d.getTime()) && toIsoDate(d) === iso;
}

/** Whole days from today until `iso`: 0 today, 1 tomorrow, negative when past. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.round((startOfDay(parseIsoDate(iso)).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** "Sep 1" this year, "Sep 1, 2027" otherwise. */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Mon, Sep 1, 2026". */
export function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Days left in the current month, counting today. */
export function daysLeftInMonth(now: Date = new Date()): number {
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.round((nextMonth.getTime() - startOfDay(now).getTime()) / DAY_MS));
}

// ---- date-times (local, minute precision, the format transactions use) ----

/** Local ISO datetime to the minute: "2026-08-23T17:12:00". */
export function toIsoDateTime(d: Date): string {
  return `${toIsoDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

export function nowIsoDateTime(now: Date = new Date()): string {
  return toIsoDateTime(now);
}

/** "2026-08-21" + "19:30" -> "2026-08-21T19:30:00"; the time defaults to noon. */
export function combineDateTime(isoDate: string, hhmm = '12:00'): string {
  const time = /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '12:00';
  return `${isoDate}T${time}:00`;
}

/** "HH:MM" of a Date, for a time field. */
export function toHhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Never later than `now`; returns the input otherwise. */
export function clampToNow(isoDateTime: string, now: Date = new Date()): string {
  const limit = toIsoDateTime(now);
  return isoDateTime > limit ? limit : isoDateTime;
}

/** "2026-08" of an ISO date or datetime. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** "2026-08-23T17:12:00" -> "2026-08-23". */
export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}
