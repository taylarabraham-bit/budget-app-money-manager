import { parseIsoDate } from '@budget-app/ui';
import { isValidIsoDate, toIsoDate } from './dates';

// Recurrence shared by bills (money going out on a schedule) and paydays
// (money coming in on one). Dates are local calendar days ("YYYY-MM-DD").

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export const FREQUENCIES: readonly Frequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};

/** Suffix after an amount: "$15.49/mo". */
export const FREQUENCY_SUFFIX: Record<Frequency, string> = {
  weekly: '/wk',
  fortnightly: '/2 wks',
  monthly: '/mo',
  quarterly: '/qtr',
  yearly: '/yr',
};

/** Monthly, quarterly and yearly schedules step by calendar month and aim at `anchorDay`; weekly and fortnightly ones step by days and ignore it. */
export const isMonthBased = (frequency: Frequency): boolean => frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly';

/** How many times something of each frequency happens in an average month. */
export const OCCURRENCES_PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** The day of the month of a local calendar day ("2026-01-31" -> 31). */
export function dayOfMonth(iso: string): number {
  return parseIsoDate(iso).getDate();
}

/**
 * The date one `frequency` after `iso`. Month-based frequencies aim for
 * `anchorDay` (the day of the month the schedule is anchored to - e.g. rent
 * due on the 31st), clamped to the end of shorter months (Jan 31 -> Feb 28)
 * WITHOUT the clamp becoming permanent: with the anchor passed in, Feb 28
 * is followed by Mar 31 again. Without `anchorDay` the day of `iso` is used,
 * which re-introduces drift after a clamp - callers that roll a stored date
 * forward should pass the schedule's anchor.
 */
export function addFrequency(iso: string, frequency: Frequency, anchorDay?: number): string {
  const d = parseIsoDate(iso);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      return toIsoDate(d);
    case 'fortnightly':
      d.setDate(d.getDate() + 14);
      return toIsoDate(d);
    case 'monthly':
    case 'quarterly':
    case 'yearly': {
      const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
      const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
      // Clamp below at 1: a malformed anchor (0 from a corrupt row) would otherwise
      // resolve to the last day of the PREVIOUS month and the step would never advance.
      const day = Math.min(Math.max(1, anchorDay ?? d.getDate()), daysInMonth(target.getFullYear(), target.getMonth()));
      return toIsoDate(new Date(target.getFullYear(), target.getMonth(), day));
    }
  }
}

// Marking a bill paid / a payday received advances exactly ONE step via
// addFrequency (product decision, 2026-08-29): each missed occurrence gets its own
// tap and its own logged transaction. The old catch-up helper
// (nextOccurrenceAfter, which skipped past every missed period at once) was
// removed with its last callers - see git history if that trade-off returns.

/** Every surface expands at most this many occurrences, so they agree with each other; `truncated` says when the cap bit. */
export const OCCURRENCE_CAP = 60;

export interface Occurrences {
  dates: string[];
  /** True when the window held more occurrences than the cap and the tail was left out: any count or total built on `dates` understates (audit MON-7). */
  truncated: boolean;
}

/** The occurrences of a schedule whose next date is `first` that fall within [from, to] (inclusive), capped, plus whether the cap cut the window short. */
export function occurrencesWithin(first: string, frequency: Frequency, from: string, to: string, opts: { cap?: number; anchorDay?: number } = {}): Occurrences {
  // A malformed start ("" or an unpadded "2026-8-25" from a hand-edited backup) yields
  // nothing - stepping from it used to emit the whole cap of garbage dates (audit MON-2).
  if (!isValidIsoDate(first)) return { dates: [], truncated: false };
  const cap = opts.cap ?? OCCURRENCE_CAP;
  const anchor = opts.anchorDay ?? dayOfMonth(first);
  const dates: string[] = [];
  let d = first;
  // The cap limits EMITTED occurrences: skipping stale pre-window dates must not
  // starve the window (a schedule a year stale still has to reach it). The step
  // bound is a separate backstop so nothing can spin regardless of input.
  let steps = 0;
  while (d <= to && dates.length < cap && steps < 6000) {
    if (d >= from) dates.push(d);
    d = addFrequency(d, frequency, anchor);
    steps += 1;
  }
  // Stopped by the cap (or the backstop) with the window still open: more were due.
  return { dates, truncated: d <= to };
}

/** The occurrences of a schedule whose next date is `first` that fall within [from, to] (inclusive), capped. */
export function occurrencesBetween(first: string, frequency: Frequency, from: string, to: string, opts: { cap?: number; anchorDay?: number } = {}): string[] {
  return occurrencesWithin(first, frequency, from, to, opts).dates;
}
