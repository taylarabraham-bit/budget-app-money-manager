import { roundMoney } from '../../data/split';
import { occurrencesWithin } from '../../lib/frequency';
import { daysUntil, dueLabel, todayIso } from './dates';
import { CHARGES_PER_MONTH, type Bill, type BillKind } from './types';

// Pure derivations over the bills list. Everything the screen shows comes
// from here so the numbers agree with each other.

/** Which section of the list a bill belongs to, by how soon it is due. */
export type DueBucket = 'overdue' | 'today' | 'week' | 'month' | 'later' | 'paused';

export const BUCKET_TITLE: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'Next 7 days',
  month: 'Next 30 days',
  later: 'Later',
  paused: 'Paused',
};

export const BUCKET_ORDER: readonly DueBucket[] = ['overdue', 'today', 'week', 'month', 'later', 'paused'];

/** A bill plus everything the list needs to show about its due date. */
export interface BillView extends Bill {
  /** Days until due; negative when overdue. */
  days: number;
  bucket: DueBucket;
  /** "Due in 3 days", "Overdue by 2 days". */
  dueText: string;
  /** Cost normalised to one month, for totals. */
  monthly: number;
  /** Unpaid occurrences due by today (0 when the next due is ahead). Under option B each one owes its own payment. */
  arrearsCount: number;
  /** `amount` x `arrearsCount`: what catching up actually costs (QA7 B-1). */
  arrearsTotal: number;
  /** The 60-occurrence cap bit: `arrearsCount` and `arrearsTotal` are floors - show the count as "60+" (audit MON-7). */
  arrearsTruncated: boolean;
}

export type BillFilter = 'all' | BillKind;

/** Average monthly cost of a bill, whatever its frequency. */
export function monthlyEquivalent(bill: Pick<Bill, 'amount' | 'frequency'>): number {
  return bill.amount * CHARGES_PER_MONTH[bill.frequency];
}

export function bucketFor(days: number, paused: boolean | undefined): DueBucket {
  if (paused) return 'paused';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'later';
}

export function toBillView(bill: Bill, now: Date = new Date()): BillView {
  const days = daysUntil(bill.nextDue, now);
  // One tap pays ONE occurrence, so a bill N periods behind genuinely owes N
  // payments - cash flow already counts every one, and these fields let the
  // bills surfaces agree with it instead of quoting 1x (QA7 B-1).
  const arrears = days <= 0 && !bill.paused ? occurrencesWithin(bill.nextDue, bill.frequency, bill.nextDue, todayIso(now), { anchorDay: bill.anchorDay }) : { dates: [], truncated: false };
  const arrearsCount = arrears.dates.length;
  return {
    ...bill,
    days,
    bucket: bucketFor(days, bill.paused),
    dueText: bill.paused ? 'Paused' : dueLabel(days, bill.nextDue, now),
    monthly: monthlyEquivalent(bill),
    arrearsCount,
    arrearsTotal: roundMoney(bill.amount * arrearsCount),
    arrearsTruncated: arrears.truncated,
  };
}

/** Bills matching the filter, soonest due first, paused ones last. */
export function selectBills(bills: Bill[], filter: BillFilter = 'all', now: Date = new Date()): BillView[] {
  return bills
    .filter((b) => filter === 'all' || b.kind === filter)
    .map((b) => toBillView(b, now))
    .sort((a, b) => {
      if (!!a.paused !== !!b.paused) return a.paused ? 1 : -1;
      if (a.nextDue !== b.nextDue) return a.nextDue < b.nextDue ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export interface BillGroup {
  bucket: DueBucket;
  title: string;
  items: BillView[];
  /** Sum of the amounts actually due in this group (not monthly-normalised). */
  total: number;
}

/** The sorted list split into due-date sections, in display order, empty sections dropped. */
export function groupByDue(views: BillView[]): BillGroup[] {
  const groups = new Map<DueBucket, BillGroup>();
  for (const v of views) {
    let g = groups.get(v.bucket);
    if (!g) {
      g = { bucket: v.bucket, title: BUCKET_TITLE[v.bucket], items: [], total: 0 };
      groups.set(v.bucket, g);
    }
    g.items.push(v);
    // An overdue bill's group total carries every missed occurrence.
    g.total = roundMoney(g.total + (v.arrearsCount > 0 ? v.arrearsTotal : v.amount));
  }
  return BUCKET_ORDER.map((b) => groups.get(b)).filter((g): g is BillGroup => !!g);
}

export interface BillsSummary {
  /** Active bills, normalised to a monthly cost. */
  monthlyTotal: number;
  subscriptionsMonthly: number;
  billsMonthly: number;
  activeCount: number;
  pausedCount: number;
  /** Active bills past their due date, most overdue first. */
  overdue: BillView[];
  /** Every missed occurrence across the overdue bills - what catching up costs (QA7 B-1). */
  overdueTotal: number;
  /** Active bills due today or within the next 7 days (overdue ones excluded), soonest first. */
  dueSoon: BillView[];
  dueSoonTotal: number;
  /** Overdue + due soon: what needs attention this week, in due order. */
  attention: BillView[];
  attentionTotal: number;
}

export function selectBillsSummary(bills: Bill[], now: Date = new Date()): BillsSummary {
  const views = selectBills(bills, 'all', now);
  const active = views.filter((v) => !v.paused);
  const overdue = active.filter((v) => v.days < 0);
  const dueSoon = active.filter((v) => v.days >= 0 && v.days <= 7);
  const attention = [...overdue, ...dueSoon];
  const sum = (xs: number[]) => roundMoney(xs.reduce((a, b) => a + b, 0));
  const owed = (v: BillView) => (v.arrearsCount > 0 ? v.arrearsTotal : v.amount);
  return {
    monthlyTotal: sum(active.map((v) => v.monthly)),
    subscriptionsMonthly: sum(active.filter((v) => v.kind === 'subscription').map((v) => v.monthly)),
    billsMonthly: sum(active.filter((v) => v.kind === 'bill').map((v) => v.monthly)),
    activeCount: active.length,
    pausedCount: views.length - active.length,
    overdue,
    overdueTotal: sum(overdue.map(owed)),
    dueSoon,
    dueSoonTotal: sum(dueSoon.map((v) => v.amount)),
    attention,
    attentionTotal: sum(attention.map(owed)),
  };
}
