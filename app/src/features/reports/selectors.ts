import { parseIsoDate } from '@budget-app/ui';
import { isBillPayment } from '../../data/selectors';
import { dateOnly } from '../../lib/dates';
import { attributedAmount, roundMoney, toCents, touches } from '../../data/split';
import type { HouseholdState } from '../../data/store';
import type { Category, HouseholdMember, TransactionRecord } from '../../data/types';
import { addMonths, listMonths, monthBounds, monthLabel, monthShortLabel, weeksOf } from './months';

// A month in review. Pure derivations over the household state: nothing is
// stored, so the report is always consistent with Activity and Overview.

export interface CategoryReportRow {
  category: Category;
  /** Everyday spend in the category - bills aside, like the budgets. */
  spent: number;
  limit: number;
  /** Share of the month's everyday spend (0-1). */
  share: number;
  count: number;
  prevSpent: number;
  /** Fraction vs last month (to date when the month is incomplete); null when there was nothing last month. */
  vsLastMonth: number | null;
}

export interface MemberReportRow {
  member: HouseholdMember;
  /** What they paid for. */
  paid: number;
  /** What they paid out altogether, attributed (own purchases + their share of shared ones, bills included). */
  attributed: number;
  /** The part of `attributed` that counts against their personal budget - everyday spend, bills aside. */
  budgetSpent: number;
  earned: number;
  /** Share of the month's spend by what they paid (0-1). */
  share: number;
  count: number;
}

export interface MerchantRow {
  title: string;
  count: number;
  total: number;
  categoryId: string;
}

export interface WeekRow {
  startDay: number;
  endDay: number;
  label: string;
  spent: number;
  income: number;
}

export interface DailyEarningsStats {
  total: number;
  avgPerDay: number;
  daysWithIncome: number;
  /** Days that met the daily target; null when no target is set. */
  daysHitTarget: number | null;
  daysCounted: number;
  target: number;
  bestDay: { date: string; amount: number } | null;
}

export interface MonthReport {
  month: string;
  label: string;
  isCurrentMonth: boolean;
  daysInMonth: number;
  daysElapsed: number;
  scope: HouseholdMember | null;
  transactionCount: number;
  empty: boolean;
  income: number;
  /** Everything that went out: everyday spend plus bills. */
  spend: number;
  /** Bill and subscription payments - the required part of `spend`. */
  bills: number;
  billsCount: number;
  /** `spend` minus `bills`: what the categories, weeks and merchants below break down. */
  everyday: number;
  /** income − spend, in whole cents: a month that breaks even to the cent reads as 0, never as −1e-13 "overspent" (audit MON-5). */
  net: number;
  /** net / income; null without income. */
  savingsRate: number | null;
  prev: { month: string; label: string; income: number; spend: number; net: number; toDate: boolean };
  deltas: { income: number | null; spend: number | null; net: number | null };
  byCategory: CategoryReportRow[];
  byMember: MemberReportRow[];
  topMerchants: MerchantRow[];
  byWeek: WeekRow[];
  /** Everyday spend per `byWeek` slice, averaged over the slices that have STARTED: a live month is not dragged down by weeks that haven't happened (audit MF-5). */
  weekAverage: number;
  /** Top purchases with the amount that counts for the scope: the member's SHARE when scoped, the full amount household-wide (product decision: show the share). */
  biggest: Array<{ t: TransactionRecord; amount: number }>;
  dailyEarnings: DailyEarningsStats;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const change = (current: number, previous: number): number | null => (previous > 0 ? (current - previous) / previous : null);

interface Scoped {
  t: TransactionRecord;
  /** Signed amount that counts for the scope (attributed when scoped to a member). */
  amount: number;
}

function scoped(state: HouseholdState, rows: TransactionRecord[], scope: HouseholdMember | null): Scoped[] {
  if (!scope) return rows.map((t) => ({ t, amount: t.amount }));
  return rows.filter((t) => touches(t, scope.id, state.household, state.members)).map((t) => ({ t, amount: attributedAmount(t, scope.id, state.household, state.members) })).filter((x) => x.amount !== 0);
}

const kindOf = (state: HouseholdState, t: TransactionRecord) => state.categories.find((c) => c.id === t.categoryId)?.kind ?? (t.amount > 0 ? 'income' : 'expense');

export function selectMonthReport(state: HouseholdState, month: string, memberId: string | null, now: Date = new Date()): MonthReport {
  const scope = memberId ? state.members.find((m) => m.id === memberId) ?? null : null;
  const bounds = monthBounds(month, now);
  const prevKey = addMonths(month, -1);
  const prevBounds = monthBounds(prevKey, now);
  // A half-finished month is compared to the same stretch of last month, not the whole of it.
  const toDate = bounds.isCurrent && bounds.daysElapsed < bounds.daysInMonth;
  const prevCutoff = toDate ? Math.min(bounds.daysElapsed, prevBounds.daysInMonth) : prevBounds.daysInMonth;

  const rowsThis = scoped(state, state.transactions.filter(bounds.inMonth), scope);
  const rowsPrev = scoped(
    state,
    state.transactions.filter((t) => prevBounds.inMonth(t) && parseIsoDate(t.date).getDate() <= prevCutoff),
    scope,
  );
  const allExpenses = rowsThis.filter((x) => kindOf(state, x.t) === 'expense' && x.amount < 0);
  // Bills are required money and sit on their own line; the breakdowns below are everyday spending.
  const billRows = allExpenses.filter((x) => isBillPayment(x.t));
  const expenses = allExpenses.filter((x) => !isBillPayment(x.t));
  const incomes = rowsThis.filter((x) => kindOf(state, x.t) === 'income' && x.amount > 0);
  const spend = sum(allExpenses.map((x) => -x.amount));
  const bills = sum(billRows.map((x) => -x.amount));
  const everyday = spend - bills;
  const income = sum(incomes.map((x) => x.amount));
  const prevSpend = sum(rowsPrev.filter((x) => kindOf(state, x.t) === 'expense' && x.amount < 0).map((x) => -x.amount));
  const prevIncome = sum(rowsPrev.filter((x) => kindOf(state, x.t) === 'income' && x.amount > 0).map((x) => x.amount));
  const net = roundMoney(income - spend);
  const prevNet = roundMoney(prevIncome - prevSpend);

  const byCategory: CategoryReportRow[] = state.categories
    .filter((c) => c.kind === 'expense')
    .map((category) => {
      const mine = expenses.filter((x) => x.t.categoryId === category.id);
      const spent = sum(mine.map((x) => -x.amount));
      const prevSpent = sum(rowsPrev.filter((x) => x.t.categoryId === category.id && x.amount < 0 && !isBillPayment(x.t)).map((x) => -x.amount));
      return { category, spent, limit: category.limit, share: everyday > 0 ? spent / everyday : 0, count: mine.length, prevSpent, vsLastMonth: change(spent, prevSpent) };
    })
    .filter((r) => r.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  // People is always household-wide: who paid, what landed on each budget, what each earned.
  const monthRows = state.transactions.filter(bounds.inMonth);
  const householdSpend = sum(monthRows.filter((t) => kindOf(state, t) === 'expense' && t.amount < 0).map((t) => -t.amount));
  const byMember: MemberReportRow[] = state.members
    .map((member) => {
      // kind-based like householdSpend below it, so the share denominator and numerator agree.
      const paidRows = monthRows.filter((t) => t.memberId === member.id && kindOf(state, t) === 'expense' && t.amount < 0);
      const paid = sum(paidRows.map((t) => -t.amount));
      const attributed = sum(monthRows.filter((t) => t.amount < 0).map((t) => -attributedAmount(t, member.id, state.household, state.members)));
      const budgetSpent = sum(monthRows.filter((t) => t.amount < 0 && !isBillPayment(t)).map((t) => -attributedAmount(t, member.id, state.household, state.members)));
      const earned = sum(monthRows.filter((t) => t.memberId === member.id && t.amount > 0).map((t) => t.amount));
      return { member, paid, attributed, budgetSpent, earned, share: householdSpend > 0 ? paid / householdSpend : 0, count: paidRows.length };
    })
    .sort((a, b) => b.paid - a.paid);

  const merchants = new Map<string, MerchantRow>();
  for (const x of expenses) {
    const key = x.t.title.trim().toLowerCase();
    if (!key || key === 'purchase') continue;
    const row = merchants.get(key);
    if (row) {
      row.count += 1;
      row.total += -x.amount;
    } else merchants.set(key, { title: x.t.title.trim(), count: 1, total: -x.amount, categoryId: x.t.categoryId });
  }
  const topMerchants = [...merchants.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  const byWeek: WeekRow[] = weeksOf(month).map((w) => {
    const within = (x: Scoped) => {
      const day = parseIsoDate(x.t.date).getDate();
      return day >= w.startDay && day <= w.endDay;
    };
    return { label: w.label, startDay: w.startDay, endDay: w.endDay, spent: sum(expenses.filter(within).map((x) => -x.amount)), income: sum(incomes.filter(within).map((x) => x.amount)) };
  });
  const elapsedSlices = bounds.isCurrent ? byWeek.filter((w) => w.startDay <= bounds.daysElapsed).length : bounds.daysElapsed > 0 ? byWeek.length : 0;
  const weekAverage = elapsedSlices > 0 ? everyday / elapsedSlices : 0;

  // Ranked AND displayed by the scoped amount, so a $100 purchase split 10/90
  // never sits above a personal $50 while showing "$100" (rank/label mismatch).
  const biggest = [...expenses].sort((a, b) => a.amount - b.amount).slice(0, 5);

  const target = state.household.dailyEarningTarget;
  const daysCounted = Math.max(1, bounds.daysElapsed);
  const perDay = new Map<string, number>();
  for (const x of incomes) perDay.set(dateOnly(x.t.date), (perDay.get(dateOnly(x.t.date)) ?? 0) + x.amount);
  let bestDay: DailyEarningsStats['bestDay'] = null;
  for (const [date, amount] of perDay) if (!bestDay || amount > bestDay.amount) bestDay = { date, amount };
  const dailyEarnings: DailyEarningsStats = {
    total: income,
    avgPerDay: income / daysCounted,
    daysWithIncome: perDay.size,
    // Compared in cents: a day that meets the target to the cent is a hit, not a float-dust miss (audit MON-5).
    daysHitTarget: target > 0 ? [...perDay.values()].filter((v) => toCents(v) >= toCents(target)).length : null,
    daysCounted,
    target,
    bestDay,
  };

  return {
    month,
    label: monthLabel(month),
    isCurrentMonth: bounds.isCurrent,
    daysInMonth: bounds.daysInMonth,
    daysElapsed: bounds.daysElapsed,
    scope,
    transactionCount: rowsThis.length,
    empty: rowsThis.length === 0,
    income,
    spend,
    bills,
    billsCount: billRows.length,
    everyday,
    net,
    savingsRate: income > 0 ? net / income : null,
    prev: { month: prevKey, label: toDate ? `${monthShortLabel(prevKey, now)} 1–${prevCutoff}` : monthShortLabel(prevKey, now), income: prevIncome, spend: prevSpend, net: prevNet, toDate },
    // The net divisor is cents-guarded: a previous month that breaks even to the cent
    // leaves float dust in prevNet, and dividing by it renders an astronomical percent.
    deltas: { income: change(income, prevIncome), spend: change(spend, prevSpend), net: Math.round(prevNet * 100) !== 0 ? (net - prevNet) / Math.abs(Math.round(prevNet * 100) / 100) : null },
    byCategory,
    byMember,
    topMerchants,
    byWeek,
    weekAverage,
    biggest,
    dailyEarnings,
  };
}

/** Months with data, earliest → the current month. */
export function selectReportMonths(state: HouseholdState, now: Date = new Date()): string[] {
  return listMonths(state.transactions, now);
}
