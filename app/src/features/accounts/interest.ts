import { parseIsoDate } from '@budget-app/ui';
import { toIsoDate } from '../../lib/dates';

// Credit-card interest estimates. All money in and out of these helpers is
// INTEGER CENTS; rates are yearly percentages (20.99 for 20.99% p.a.). They
// are deliberately estimates: real cards charge daily interest on average
// daily balances and revoke the interest-free period on new purchases once a
// balance is carried, so every screen using these says "≈" and links the
// caveat. Everything here is pure - "today" comes in as a calendar day.

export const DAYS_PER_YEAR = 365;

/** Simple daily accrual (ACT/365) on a carried balance over `days`. 0 when nothing is carried or the card charges nothing. */
export function interestOverDaysCents(carriedCents: number, aprPercent: number, days: number): number {
  if (!(carriedCents > 0) || !(aprPercent > 0) || !(days > 0)) return 0;
  return Math.round((carriedCents * aprPercent * days) / (100 * DAYS_PER_YEAR));
}

/** One month's interest on a carried balance - the quick APR/12 estimate. */
export function monthlyInterestCents(carriedCents: number, aprPercent: number): number {
  if (!(carriedCents > 0) || !(aprPercent > 0)) return 0;
  return Math.round((carriedCents * aprPercent) / 1200);
}

/**
 * The card's minimum payment on `owedCents`: the greater of the percentage
 * and the floor, never more than what is owed. `null` when the card has
 * neither rule (there is no minimum to compute).
 */
export function minPaymentCents(owedCents: number, percent?: number, floorCents?: number): number | null {
  const pct = percent && percent > 0 ? Math.round((owedCents * percent) / 100) : 0;
  const floor = floorCents && floorCents > 0 ? floorCents : 0;
  if (pct === 0 && floor === 0) return null;
  if (!(owedCents > 0)) return 0;
  return Math.min(owedCents, Math.max(pct, floor));
}

export interface PayoffProjection {
  /** Whole months until the balance reaches zero. */
  months: number;
  /** Total interest paid along the way. */
  interestCents: number;
}

/** Longest projection worth showing (50 years); anything slower reads as "never". */
const MAX_PAYOFF_MONTHS = 600;

/** Below this a card asks for the whole balance, and the rounded minimum would otherwise stall against rounded interest (audit MF-8). */
const TAIL_CENTS = 100;

/**
 * Paying a fixed amount every month: interest accrues first (APR/12 on the
 * running balance), then the payment lands. `null` when it never clears -
 * the payment does not beat the month's interest - so the screen can say
 * "that payment never pays it off" instead of a made-up number.
 */
export function payoffWithFixedPayment(owedCents: number, aprPercent: number, paymentCents: number): PayoffProjection | null {
  if (!(owedCents > 0)) return { months: 0, interestCents: 0 };
  if (!(paymentCents > 0)) return null;
  let owed = owedCents;
  let interest = 0;
  let months = 0;
  while (owed > 0 && months < MAX_PAYOFF_MONTHS) {
    const accrued = monthlyInterestCents(owed, aprPercent);
    if (paymentCents <= accrued) return null;
    owed += accrued;
    interest += accrued;
    owed -= Math.min(paymentCents, owed);
    months += 1;
  }
  return owed <= 0 ? { months, interestCents: interest } : null;
}

/**
 * Paying only the card's minimum, recomputed each month as the balance falls
 * (the classic "minimum payments take years" illustration). `null` when the
 * card has no minimum rule or the minimum never beats the interest. A
 * percent-only minimum decays the balance geometrically; once it is under a
 * dollar the month's payment is the whole tail, so the projection ends
 * instead of the integer maths stalling there and reading as "never".
 */
export function payoffWithMinimumOnly(owedCents: number, aprPercent: number, percent?: number, floorCents?: number): PayoffProjection | null {
  if (!(owedCents > 0)) return { months: 0, interestCents: 0 };
  let owed = owedCents;
  let interest = 0;
  let months = 0;
  while (owed > 0 && months < MAX_PAYOFF_MONTHS) {
    const accrued = monthlyInterestCents(owed, aprPercent);
    owed += accrued;
    interest += accrued;
    const min = minPaymentCents(owed, percent, floorCents);
    if (min == null) return null;
    const pay = owed <= TAIL_CENTS ? owed : Math.min(min, owed);
    if (pay <= accrued) return null;
    owed -= pay;
    months += 1;
  }
  return owed <= 0 ? { months, interestCents: interest } : null;
}

// ---- statement dates ----

export interface CardCycle {
  /** Close of the statement the current payment window belongs to (may be past), as a local calendar day. */
  statementDate: string;
  /** Pay-by day for that statement: close + `dueDaysAfterStatement`. In the past only when `overdue`. */
  dueDate: string;
  /** True when that statement has already closed - the due date is live now. */
  closed: boolean;
  /** The window was missed: the due date has passed with no payment logged since the close (QA7 R-5). */
  overdue: boolean;
}

/** `statementDay` clamped into a real day of the month (31 → Feb 28). Month may be out of range; Date normalises it. */
function dayInMonth(year: number, monthIndex: number, day: number): Date {
  const max = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(1, day), max));
}

/**
 * Where the card is in its cycle on `today`. The deadline that matters is the
 * EARLIEST still-unexpired due date across recent statement closes - with a
 * long grace period (44-day interest-free cards) an older statement's due date
 * is still live after the next statement has already closed, and taking only
 * the most recent close silently shadowed the real deadline (QA7 A-4). When
 * every closed statement's window has expired and no payment was logged since
 * the newest close, that missed window is reported as `overdue` instead of
 * rolling silently to the next cycle (QA7 R-5); a logged payment means it was
 * handled, and the next cycle is what's ahead.
 */
export function currentCardCycle(statementDay: number, dueDaysAfterStatement: number, today: string, lastPaymentOn?: string): CardCycle {
  const now = parseIsoDate(today);
  const grace = Math.max(0, Math.floor(dueDaysAfterStatement));
  const cycleAt = (monthOffset: number) => {
    const close = dayInMonth(now.getFullYear(), now.getMonth() + monthOffset, statementDay);
    const due = new Date(close.getFullYear(), close.getMonth(), close.getDate() + grace);
    return { close: toIsoDate(close), due: toIsoDate(due) };
  };
  // Every close that has happened, newest first - far enough back that even a
  // 90-day grace (the validator's cap) is still in view.
  const past = [0, -1, -2, -3, -4].map(cycleAt).filter((c) => c.close <= today);
  const live = past.filter((c) => c.due >= today).sort((a, b) => (a.due < b.due ? -1 : 1))[0];
  if (live) return { statementDate: live.close, dueDate: live.due, closed: true, overdue: false };
  const missed = past[0];
  if (missed && !(lastPaymentOn !== undefined && lastPaymentOn >= missed.close)) {
    return { statementDate: missed.close, dueDate: missed.due, closed: true, overdue: true };
  }
  const next = [0, 1].map(cycleAt).find((c) => c.close > today) ?? cycleAt(1);
  return { statementDate: next.close, dueDate: next.due, closed: false, overdue: false };
}
