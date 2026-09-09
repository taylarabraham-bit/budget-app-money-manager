import type { Frequency } from '../../lib/frequency';

// Paydays: money that arrives on a schedule (salary, regular shifts, a
// retainer). Shapes mirror the planned Supabase `income_schedules` table so
// the local store can be swapped for real queries without touching the
// screens.

export interface IncomeSchedule {
  id: string;
  /** Whose pay it is. */
  memberId: string;
  /** "Salary", "Tutoring", "Shifts". */
  name: string;
  /** Expected amount each time (an estimate when `variable`). */
  amount: number;
  frequency: Frequency;
  /** The next day it is expected, as a local calendar day ("2026-09-01"). Marking it received rolls this forward. */
  nextDate: string;
  /** Day of the month the schedule anchors to (pay on the 31st stays the 31st after short months). Derived from the picked date. */
  anchorDay?: number;
  /** Income category it is logged under. */
  categoryId: string;
  /** Account the pay lands in (accounts feature); income logged from here carries it. */
  accountId?: string;
  /** The amount differs each time (shifts, freelance) - ask for the actual amount when received. */
  variable?: boolean;
  /** Paused paydays stay in the list but are left out of the forecast. */
  paused?: boolean;
  /** Local calendar day it was last marked received. */
  lastReceived?: string;
  note?: string;
  /** ISO datetime it was created. */
  createdAt: string;
}

/** What the add/edit form collects. */
export interface IncomeScheduleInput {
  memberId: string;
  name: string;
  amount: number;
  frequency: Frequency;
  nextDate: string;
  /** The day of the month the schedule is anchored to; the form preserves it when the date wasn't re-picked (QA MF-2). */
  anchorDay?: number;
  categoryId: string;
  /** Empty string = not tracked. */
  accountId?: string;
  variable?: boolean;
  note?: string;
}
