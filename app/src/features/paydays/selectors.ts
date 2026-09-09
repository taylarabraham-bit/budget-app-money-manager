import { goalPace, monthLimitFor, monthSpendFor } from '../../data/selectors';
import { allocateCents, fromCents, resolveDefaultWeights, roundMoney, toCents } from '../../data/split';
import type { HouseholdState } from '../../data/store';
import type { Goal, HouseholdMember } from '../../data/types';
import { daysUntil, formatShortDate, toIsoDate, todayIso } from '../../lib/dates';
import { OCCURRENCES_PER_MONTH, occurrencesWithin } from '../../lib/frequency';
import type { Bill } from '../bills/types';
import type { IncomeSchedule } from './types';

// Paydays as shown in the list, and the cash-flow forecast that turns
// "limit minus spend" into "what is actually safe to spend before payday":
// what is left of the month's budget, minus the bills due before then, minus
// the savings still needed to keep goals on pace.

export type PaydayBucket = 'expected' | 'today' | 'week' | 'later' | 'paused';

export const PAYDAY_BUCKET_TITLE: Record<PaydayBucket, string> = {
  expected: 'Not yet received',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  paused: 'Paused',
};

export const PAYDAY_BUCKET_ORDER: readonly PaydayBucket[] = ['expected', 'today', 'week', 'later', 'paused'];

export interface PaydayView extends IncomeSchedule {
  /** Days until the next expected date (negative when it has not been marked received yet). */
  days: number;
  bucket: PaydayBucket;
  dueText: string;
  /** Average per month. */
  monthly: number;
  /** Expected occurrences up to today not yet marked received (0 when the next date is ahead). Under option B each one needs its own Received tap - the mirror of a bill's arrearsCount (audit MF-11 / MON-13). */
  awaitingCount: number;
  /** `amount` x `awaitingCount`: what is actually still to come in. */
  awaitingTotal: number;
  /** The 60-occurrence cap bit: `awaitingCount` and `awaitingTotal` are floors - show the count as "60+" (audit MON-7). */
  awaitingTruncated: boolean;
}

/** "Expected Aug 20" (past), "Today", "Tomorrow", "In 5 days", "Sep 14". */
export function payLabel(days: number, iso: string, now: Date = new Date()): string {
  if (days < 0) return `Expected ${formatShortDate(iso, now)}`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 14) return `In ${days} days`;
  return formatShortDate(iso, now);
}

/**
 * "Until payday (Tue) · 3 days", on the day itself "Payday today" / "Last day ·
 * Aug 31", and honestly late once a payday has gone unreceived: "Payday 3 days
 * late" instead of a perpetual "today".
 */
export function horizonText(untilLabel: string, daysUntil: number, paydayLateDays = 0): string {
  if (paydayLateDays > 0) return `Payday ${paydayLateDays} ${paydayLateDays === 1 ? 'day' : 'days'} late - mark it received`;
  if (daysUntil > 0) return `Until ${untilLabel} · ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`;
  return untilLabel.startsWith('payday') ? 'Payday today' : `Last day · ${untilLabel}`;
}

export function paydayBucket(days: number, paused: boolean | undefined): PaydayBucket {
  if (paused) return 'paused';
  if (days < 0) return 'expected';
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  return 'later';
}

export function toPaydayView(schedule: IncomeSchedule, now: Date = new Date()): PaydayView {
  const days = daysUntil(schedule.nextDate, now);
  const awaiting = days <= 0 && !schedule.paused ? occurrencesWithin(schedule.nextDate, schedule.frequency, schedule.nextDate, todayIso(now), { anchorDay: schedule.anchorDay }) : { dates: [], truncated: false };
  const awaitingCount = awaiting.dates.length;
  // A payday several periods behind says so: each one still needs its own Received tap.
  const behind = days < 0 && awaitingCount > 1 ? ` · ${awaiting.truncated ? `${awaitingCount}+` : awaitingCount} not received` : '';
  return {
    ...schedule,
    days,
    bucket: paydayBucket(days, schedule.paused),
    dueText: `${payLabel(days, schedule.nextDate, now)}${behind}`,
    monthly: schedule.amount * OCCURRENCES_PER_MONTH[schedule.frequency],
    awaitingCount,
    awaitingTotal: roundMoney(schedule.amount * awaitingCount),
    awaitingTruncated: awaiting.truncated,
  };
}

/** Active paydays by next date, paused ones last. (`paused` may be stored as an explicit false - compare coerced.) */
export function selectPaydays(schedules: IncomeSchedule[], now: Date = new Date()): PaydayView[] {
  return schedules
    .map((s) => toPaydayView(s, now))
    .sort((a, b) => (!!a.paused === !!b.paused ? (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0) : a.paused ? 1 : -1));
}

export interface PaydayGroup {
  bucket: PaydayBucket;
  title: string;
  items: PaydayView[];
  total: number;
}

export function groupPaydays(views: PaydayView[]): PaydayGroup[] {
  return PAYDAY_BUCKET_ORDER.map((bucket) => {
    const items = views.filter((v) => v.bucket === bucket);
    // A late payday's group total carries every occurrence still to receive, like the bills' overdue group (audit MF-11 / MON-13).
    return { bucket, title: PAYDAY_BUCKET_TITLE[bucket], items, total: roundMoney(items.reduce((acc, v) => acc + (v.awaitingCount > 0 ? v.awaitingTotal : v.amount), 0)) };
  }).filter((g) => g.items.length > 0);
}

export interface PaydaysSummary {
  next: PaydayView | null;
  nextByMember: Record<string, PaydayView | null>;
  monthlyTotal: number;
  monthlyByMember: Record<string, number>;
  activeCount: number;
  pausedCount: number;
}

export function selectPaydaysSummary(schedules: IncomeSchedule[], members: HouseholdMember[], now: Date = new Date()): PaydaysSummary {
  const views = selectPaydays(schedules, now);
  const active = views.filter((v) => !v.paused);
  const nextByMember: Record<string, PaydayView | null> = {};
  const monthlyByMember: Record<string, number> = {};
  for (const m of members) {
    const mine = active.filter((v) => v.memberId === m.id);
    nextByMember[m.id] = mine[0] ?? null;
    monthlyByMember[m.id] = mine.reduce((acc, v) => acc + v.monthly, 0);
  }
  return {
    next: active[0] ?? null,
    nextByMember,
    monthlyTotal: active.reduce((acc, v) => acc + v.monthly, 0),
    monthlyByMember,
    activeCount: active.length,
    pausedCount: views.length - active.length,
  };
}

/** Each member's share of the household's expected monthly income (fractions summing to 1); empty when nobody has income set up. */
export function incomeRatio(schedules: IncomeSchedule[], members: HouseholdMember[]): Record<string, number> {
  const { monthlyByMember, monthlyTotal } = selectPaydaysSummary(schedules, members);
  if (monthlyTotal <= 0) return {};
  const out: Record<string, number> = {};
  for (const m of members) if ((monthlyByMember[m.id] ?? 0) > 0) out[m.id] = monthlyByMember[m.id]! / monthlyTotal;
  return out;
}

// ---- cash flow ----

export interface CashFlowItem {
  id: string;
  kind: 'bill' | 'saving';
  name: string;
  icon: string;
  /** This member's share (or the household total when not scoped). */
  amount: number;
  /** Due date (bills) or the deadline (goals), as a local calendar day. */
  date: string;
  days: number;
  shared?: boolean;
  memberId?: string;
}

export interface CashFlow {
  horizon: 'payday' | 'month';
  /** Last day of the forecast window (local calendar day). */
  until: string;
  untilLabel: string;
  daysUntil: number;
  nextPayday: { schedule: IncomeSchedule; member: HouseholdMember | undefined; date: string; amount: number; days: number; overdueDays: number } | null;
  hasSchedules: boolean;
  /** Pay expected to arrive within the window. */
  expectedIncome: number;
  /** What is left of the monthly budget right now, in whole cents. */
  limitLeft: number;
  /** False when the scope's ceiling is 0 - a member with no personal cap (QA MF-3), or a household whose category limits are all "no limit" (audit MF-4) - so there is nothing to subtract from and `limitLeft`/`safeToSpend` are not meaningful. */
  hasLimit: boolean;
  billsDue: number;
  billsDueItems: CashFlowItem[];
  /** What still needs putting aside before `until` to keep goals on pace. */
  plannedSavings: number;
  savingsItems: CashFlowItem[];
  /** limitLeft - billsDue - plannedSavings, quantized to whole cents so every sign verdict on it agrees (audit MON-5). */
  safeToSpend: number;
  perDay: number;
  /** The 60-occurrence cap cut a bill or income expansion short: `billsDue` / `expectedIncome` are floors (audit MON-7). */
  capped: boolean;
}

export interface CashFlowOptions {
  horizon?: 'payday' | 'month';
  /** Scope to one member (their payday, their share of bills and goals); null = household. */
  memberId: string | null;
  now?: Date;
}

function monthEndIso(now: Date): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/** A bill's charge on the member's budget: their share of a shared bill, all of it when they pay a personal one, 0 otherwise. */
function billShareOf(bill: Bill, memberId: string | null, state: HouseholdState): number {
  if (!memberId) return bill.amount;
  if (bill.shared) {
    const allocation = allocateCents(toCents(bill.amount), resolveDefaultWeights(state.household, state.members), bill.memberId);
    return fromCents(allocation.find((a) => a.memberId === memberId)?.cents ?? 0);
  }
  return bill.memberId === memberId ? bill.amount : 0;
}

function savingsBefore(goal: Goal, days: number, memberId: string | null, now: Date): number {
  const pace = goalPace(goal, now);
  if (!pace || goal.status !== 'active' || !goal.deadlineDate) return 0;
  const contributors = Math.max(1, goal.contributorIds.length);
  if (memberId && !goal.contributorIds.includes(memberId)) return 0;
  // Enough weeks of pace to cover the window, never more than what is left to
  // save. In cents like goalPace: a float-dollar remainder (512.07 - 12.07)
  // carries dust that the ceil turned into an extra dollar (audit MON-4).
  const remainingCents = toCents(goal.target) - toCents(goal.saved);
  const neededCents = Math.min(remainingCents, Math.ceil((pace * Math.max(days, 1)) / 7) * 100);
  return Math.max(0, Math.ceil(neededCents / 100 / (memberId ? contributors : 1)));
}

export function selectCashFlow(state: HouseholdState, bills: Bill[], schedules: IncomeSchedule[], options: CashFlowOptions): CashFlow {
  const now = options.now ?? new Date();
  const memberId = options.memberId;
  const today = todayIso(now);
  const monthEnd = monthEndIso(now);

  const active = schedules.filter((s) => !s.paused && (!memberId || s.memberId === memberId));
  const sortedActive = [...active].sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0));
  const nextSchedule = sortedActive[0];
  const nextPayday: CashFlow['nextPayday'] = nextSchedule
    ? {
        schedule: nextSchedule,
        member: state.members.find((m) => m.id === nextSchedule.memberId),
        date: nextSchedule.nextDate,
        amount: nextSchedule.amount,
        days: Math.max(0, daysUntil(nextSchedule.nextDate, now)),
        // An expected-but-unreceived payday is LATE, not forever "today" - surfaces in copy and a reminder.
        overdueDays: Math.max(0, -daysUntil(nextSchedule.nextDate, now)),
      }
    : null;

  let horizon: CashFlow['horizon'] = options.horizon ?? 'payday';
  let until = monthEnd;
  if (horizon === 'payday' && nextPayday) {
    // An overdue (not yet received) payday collapses the window to today; one past month end stops at month end.
    until = nextPayday.date < today ? today : nextPayday.date > monthEnd ? monthEnd : nextPayday.date;
  } else horizon = 'month';
  const days = Math.max(0, daysUntil(until, now));
  const untilLabel = horizon === 'payday' && nextPayday && nextPayday.date <= monthEnd ? `payday (${new Date(until + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })})` : formatShortDate(until, now);

  // Whether any expansion below hit the occurrence cap (audit MON-7).
  let capped = false;
  const expectedIncome = roundMoney(
    active.reduce((acc, s) => {
      const o = occurrencesWithin(s.nextDate, s.frequency, today, until, { anchorDay: s.anchorDay });
      if (o.truncated) capped = true;
      return acc + o.dates.length * s.amount;
    }, 0),
  );

  const monthLimit = monthLimitFor(state, memberId);
  // A ceiling of 0 means "no cap": a member with no personal limit (QA MF-3), or a
  // household whose category limits are all 0 = "no limit" (audit MF-4). Either way
  // 0 − spend is a deficit that doesn't exist, not a safe-to-spend.
  const hasLimit = monthLimit > 0;
  // Whole cents from here on, so sign verdicts downstream never flip on float dust (audit MON-5).
  const limitLeft = fromCents(toCents(monthLimit) - toCents(monthSpendFor(state, memberId, now)));

  const billsDueItems: CashFlowItem[] = bills
    .filter((b) => !b.paused && b.nextDue <= until)
    .flatMap((b) => {
      const amount = billShareOf(b, memberId, state);
      if (amount <= 0) return [];
      const icon = state.categories.find((c) => c.id === b.categoryId)?.icon ?? '🧾';
      // EVERY occurrence inside the window counts: a weekly bill falling due twice
      // before payday must be paid twice. The income side always expanded
      // occurrences; the bill side counting each bill once overstated
      // safe-to-spend by the missed charges (QA MF-1).
      const o = occurrencesWithin(b.nextDue, b.frequency, b.nextDue, until, { anchorDay: b.anchorDay });
      if (o.truncated) capped = true;
      return o.dates.map((date, i) => ({
        id: i === 0 ? b.id : `${b.id}:${date}`,
        kind: 'bill' as const,
        name: b.name,
        icon,
        amount,
        date,
        days: daysUntil(date, now),
        shared: b.shared,
        memberId: b.memberId,
      }));
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const billsDue = fromCents(billsDueItems.reduce((acc, i) => acc + toCents(i.amount), 0));

  const savingsItems: CashFlowItem[] = state.goals
    .map((g) => ({ g, amount: savingsBefore(g, days, memberId, now) }))
    .filter((x) => x.amount > 0)
    .map(({ g, amount }) => ({ id: g.id, kind: 'saving' as const, name: g.name, icon: g.icon, amount, date: g.deadlineDate!, days: daysUntil(g.deadlineDate!, now) }));
  const plannedSavings = savingsItems.reduce((acc, i) => acc + i.amount, 0);

  const safeToSpend = fromCents(toCents(limitLeft) - toCents(billsDue) - toCents(plannedSavings));
  return {
    horizon,
    until,
    untilLabel,
    daysUntil: days,
    nextPayday,
    hasSchedules: active.length > 0,
    expectedIncome,
    limitLeft,
    hasLimit,
    billsDue,
    billsDueItems,
    plannedSavings,
    savingsItems,
    safeToSpend,
    perDay: days > 0 ? safeToSpend / days : safeToSpend,
    capped,
  };
}
