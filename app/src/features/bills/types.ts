// Subscriptions & recurring bills. Shapes mirror the planned Supabase `bills`
// table so the local store can be swapped for real queries without touching
// the screen.

import { FREQUENCIES, OCCURRENCES_PER_MONTH, type Frequency } from '../../lib/frequency';

/** Recurrence shared with paydays - see lib/frequency.ts. */
export type BillFrequency = Frequency;
export { FREQUENCY_LABEL, FREQUENCY_SUFFIX } from '../../lib/frequency';

/**
 * Every recurring charge is a bill. `subscription` tags the ones that are a
 * service you could cancel (Netflix, gym) so the household can line them up by
 * cost and decide what is worth keeping; `bill` is the default (rent, power).
 */
export type BillKind = 'subscription' | 'bill';

export interface Bill {
  id: string;
  /** "Netflix", "Rent", "Car insurance". */
  name: string;
  /** Positive amount in the household currency, charged every `frequency`. */
  amount: number;
  frequency: BillFrequency;
  /**
   * The next date it is due, as a local calendar day ("2026-09-01"). The user
   * picks this; marking the bill paid rolls it forward by one `frequency`.
   */
  nextDue: string;
  /**
   * Day of the month the schedule is anchored to (31 for "due on the 31st"),
   * so a clamp to a short month (Feb 28) rolls back to the 31st afterwards.
   * Derived from the picked due date; absent on rows from before it existed.
   */
  anchorDay?: number;
  kind: BillKind;
  /** Household category it is spent from (one of the store's expense categories). */
  categoryId: string;
  /** Household member who pays it. */
  memberId: string;
  /** Shared household cost (split) vs personal. */
  shared?: boolean;
  /** Account it is paid from (accounts feature); payments logged from here carry it. */
  accountId?: string;
  note?: string;
  /** Local calendar day it was last marked paid. */
  lastPaid?: string;
  /** Paused bills stay in the list but are left out of totals and reminders. */
  paused?: boolean;
  /** ISO datetime it was created. */
  createdAt: string;
}

/** What the add/edit form collects. */
export interface BillInput {
  name: string;
  amount: number;
  frequency: BillFrequency;
  nextDue: string;
  /** The day of the month the schedule is anchored to; the form preserves it when the date wasn't re-picked (QA MF-2). */
  anchorDay?: number;
  kind: BillKind;
  categoryId: string;
  memberId: string;
  shared?: boolean;
  /** Empty string = not tracked. */
  accountId?: string;
  note?: string;
}

export const BILL_FREQUENCIES: readonly BillFrequency[] = FREQUENCIES;

/** How many times a bill of each frequency is charged in an average month. */
export const CHARGES_PER_MONTH: Record<BillFrequency, number> = OCCURRENCES_PER_MONTH;

export const KIND_LABEL: Record<BillKind, string> = {
  subscription: 'Subscription',
  bill: 'Bill',
};
