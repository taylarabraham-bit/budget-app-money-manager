import { parseIsoDate } from '@budget-app/ui';
import { monthKeyOf, toIsoDate } from '../../lib/dates';
import type { TransactionRecord } from '../../data/types';

// Month keys ("2026-08") and the calendar maths the report needs.

export const monthKey = (d: Date): string => monthKeyOf(toIsoDate(d));

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y!, m! - 1 + n, 1));
}

/** "August 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Aug" / "Aug 2025" (year only when it differs from `now`). */
export function monthShortLabel(key: string, now: Date = new Date()): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-US', y === now.getFullYear() ? { month: 'short' } : { month: 'short', year: 'numeric' });
}

export interface MonthBounds {
  key: string;
  start: Date;
  /** Exclusive. */
  end: Date;
  daysInMonth: number;
  /** Days of the month that have happened (all of them for past months, 0 for future ones). */
  daysElapsed: number;
  isCurrent: boolean;
  inMonth: (t: Pick<TransactionRecord, 'date'>) => boolean;
}

export function monthBounds(key: string, now: Date = new Date()): MonthBounds {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y!, m! - 1, 1);
  const end = new Date(y!, m!, 1);
  const daysInMonth = new Date(y!, m!, 0).getDate();
  const isCurrent = monthKey(now) === key;
  const daysElapsed = isCurrent ? now.getDate() : now >= end ? daysInMonth : 0;
  return {
    key,
    start,
    end,
    daysInMonth,
    daysElapsed,
    isCurrent,
    inMonth: (t) => {
      const d = parseIsoDate(t.date);
      return d >= start && d < end;
    },
  };
}

export interface WeekSlice {
  /** "1–7", "8–14", … */
  label: string;
  startDay: number;
  endDay: number;
}

/** Fixed 7-day chunks from the 1st. */
export function weeksOf(key: string): WeekSlice[] {
  const { daysInMonth } = monthBounds(key);
  const out: WeekSlice[] = [];
  for (let start = 1; start <= daysInMonth; start += 7) {
    const end = Math.min(start + 6, daysInMonth);
    out.push({ label: `${start}–${end}`, startDay: start, endDay: end });
  }
  return out;
}

/** Every month from the earliest transaction to the current month, oldest first. */
export function listMonths(transactions: Pick<TransactionRecord, 'date'>[], now: Date = new Date()): string[] {
  const current = monthKey(now);
  let earliest = current;
  for (const t of transactions) {
    const k = monthKeyOf(t.date);
    if (k < earliest) earliest = k;
  }
  // Never further back than the 240-month cap can span: a mistyped ancient year
  // ("0202-03") must not push the CURRENT month off the end of the list.
  const floor = addMonths(current, -239);
  if (earliest < floor) earliest = floor;
  const out: string[] = [];
  let k = earliest;
  while (k <= current) {
    out.push(k);
    k = addMonths(k, 1);
  }
  return out;
}
