import type { TrendPoint } from '@budget-app/ui';
import { parseIsoDate } from '@budget-app/ui';
import { daysLeftInMonth, daysUntil } from '../lib/dates';
import { attributedAmount, fromCents, isShared, roundMoney, shareOf, toCents, touches } from './split';
import type { HouseholdState } from './store';
import type { Category, Goal, GoalContribution, HouseholdMember, TransactionRecord } from './types';

// Per-person figures are ATTRIBUTED: a member's spend is their own purchases
// plus their share of every shared purchase, whoever paid (see split.ts).
// Household-wide figures are unchanged - the members' shares add up to the
// household total.
//
// Bills are REQUIRED money: they are paid before anything else, so a bill
// payment (a `recurring` expense, logged by "Mark as paid") never counts
// against a category limit or a personal budget. Budgets are for everything
// after the bills; safe-to-spend already keeps the bills still due aside.

/** A bill or subscription payment - required, so kept out of every budget. */
export const isBillPayment = (t: Pick<TransactionRecord, 'recurring' | 'amount'>): boolean => !!t.recurring && t.amount < 0;

export interface BudgetRow {
  category: Category;
  spent: number;
  limit: number;
  ratio: number;
  /** True when the category has no monthly limit (limit 0) - never "over". */
  unlimited: boolean;
}

export interface OverviewData {
  scope: HouseholdMember | null;
  dateLabel: string;
  monthLabel: string;
  daysLeftInMonth: number;
  todayEarnings: number;
  earningsChange: number | null;
  weekSpend: number;
  weekSpendChange: number | null;
  safeToSpend: number;
  /** This month's everyday spend - bills aside. */
  monthSpend: number;
  monthLimit: number;
  /** Bill payments this month (attributed when scoped). Required money, shown beside the budgets rather than inside them. */
  monthBills: number;
  earningsTrend: TrendPoint[];
  budgets: BudgetRow[];
  overBudget: BudgetRow[];
  nearestGoal: Goal | undefined;
  recent: TransactionRecord[];
  /** When scoped to a member: their share of each shared row in `recent`, by transaction id. */
  recentShares: Record<string, number>;
}

/** A transaction with the amount that counts for the current scope (attributed when scoped to a member). */
interface Scoped {
  t: TransactionRecord;
  amount: number;
}

function scopeTransactions(state: HouseholdState, scope: HouseholdMember | null): Scoped[] {
  if (!scope) return state.transactions.map((t) => ({ t, amount: t.amount }));
  return state.transactions
    .map((t) => ({ t, amount: attributedAmount(t, scope.id, state.household, state.members) }))
    .filter((x) => x.amount !== 0 || x.t.memberId === scope.id);
}

// Whole days ago: 0 today, 1 yesterday - the mirror of daysUntil.
const dayIndex = (iso: string, now: Date) => -daysUntil(iso, now);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const change = (current: number, previous: number): number | null => (previous > 0 ? (current - previous) / previous : null);

export function selectOverview(state: HouseholdState, memberId: string | null, now: Date = new Date()): OverviewData {
  const scope = memberId ? state.members.find((m) => m.id === memberId) ?? null : null;
  const inScope = scopeTransactions(state, scope);
  // A transaction whose category no longer resolves still counts (by its amount's sign), matching Activity and the report.
  const byKind = (kind: 'income' | 'expense') => inScope.filter((x) => (state.categories.find((c) => c.id === x.t.categoryId)?.kind ?? (x.t.amount > 0 ? 'income' : 'expense')) === kind);
  // Sign filters match monthSpendFor/the report: a wrong-signed row in a category
  // (import/sync damage only) must be ignored, not SUBTRACTED from the other side.
  const income = byKind('income').filter((x) => x.amount > 0);
  const allExpenses = byKind('expense').filter((x) => x.amount < 0);
  // Everyday spending is what the budgets and the week-on-week comparison measure; bills come off the top.
  const expenses = allExpenses.filter((x) => !isBillPayment(x.t));
  const billPayments = allExpenses.filter((x) => isBillPayment(x.t));

  const age = (x: Scoped) => dayIndex(x.t.date, now);
  const incomeOnDay = (d: number) => sum(income.filter((x) => age(x) === d).map((x) => x.amount));
  const spendBetween = (from: number, to: number) => sum(expenses.filter((x) => age(x) >= from && age(x) <= to).map((x) => -x.amount));

  const todayEarnings = incomeOnDay(0);
  const yesterdayEarnings = incomeOnDay(1);
  const weekSpend = spendBetween(0, 6);
  const prevWeekSpend = spendBetween(7, 13);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const inMonth = (x: Scoped) => parseIsoDate(x.t.date) >= monthStart && parseIsoDate(x.t.date) < nextMonth;
  const monthExpenses = expenses.filter(inMonth);
  const monthSpend = sum(monthExpenses.map((x) => -x.amount));
  const monthBills = sum(billPayments.filter(inMonth).map((x) => -x.amount));

  const expenseCategories = state.categories.filter((c) => c.kind === 'expense');
  const budgets: BudgetRow[] = expenseCategories
    .map((category) => {
      const spent = sum(monthExpenses.filter((x) => x.t.categoryId === category.id).map((x) => -x.amount));
      const limit = category.limit;
      // Ratio in cents: a category exactly at its limit is 1.0, never 1.0000000000000002 "over" (QA DR-3).
      return { category, spent, limit, unlimited: limit <= 0, ratio: limit > 0 ? toCents(spent) / toCents(limit) : 0 };
    })
    .filter((row) => row.spent > 0 || !scope)
    .sort((a, b) => b.ratio - a.ratio);

  const monthLimit = scope ? scope.monthlyLimit : sum(expenseCategories.map((c) => c.limit));

  const trend: TrendPoint[] = [];
  for (let d = 6; d >= 0; d--) {
    // Component arithmetic, not milliseconds: in the week after a DST spring-forward,
    // ms-subtraction lands at 23:00 the previous calendar day and shifts the weekday
    // labels while the values stay put (QA DR-4).
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    trend.push({ label: date.toLocaleDateString('en-US', { weekday: 'short' }), value: incomeOnDay(d) });
  }

  const activeGoals = state.goals.filter((g) => g.status === 'active' && (!scope || g.contributorIds.includes(scope.id)));
  // "Closest" = closest to completion.
  const nearestGoal = [...activeGoals].sort((a, b) => b.saved / b.target - a.saved / a.target)[0];

  const recent = inScope
    .map((x) => x.t)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 3);
  const recentShares: Record<string, number> = {};
  if (scope) for (const t of recent) if (isShared(t) && t.amount < 0) recentShares[t.id] = shareOf(t, scope.id, state.household, state.members);

  return {
    scope,
    dateLabel: now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }),
    monthLabel: now.toLocaleDateString('en-US', { month: 'long' }),
    daysLeftInMonth: daysLeftInMonth(now),
    todayEarnings,
    earningsChange: change(todayEarnings, yesterdayEarnings),
    weekSpend,
    weekSpendChange: change(weekSpend, prevWeekSpend),
    // Whole cents: a limit met to the cent must read as 0, never as -1e-13 (audit MON-5).
    safeToSpend: roundMoney(monthLimit - monthSpend),
    monthSpend,
    monthLimit,
    monthBills,
    earningsTrend: trend,
    budgets,
    overBudget: budgets.filter((b) => !scope && b.ratio > 1),
    nearestGoal,
    recent,
    recentShares,
  };
}

/** This month's everyday spend (bills aside) for one member (attributed) or the whole household. */
export function monthSpendFor(state: HouseholdState, memberId: string | null, now: Date = new Date()): number {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return sum(
    state.transactions
      .filter((t) => t.amount < 0 && !isBillPayment(t) && parseIsoDate(t.date) >= monthStart && parseIsoDate(t.date) < nextMonth)
      .map((t) => (memberId ? -attributedAmount(t, memberId, state.household, state.members) : -t.amount)),
  );
}

/** The monthly ceiling that spend is measured against: a member's personal limit, or the sum of category limits. */
export function monthLimitFor(state: HouseholdState, memberId: string | null): number {
  if (memberId) return state.members.find((m) => m.id === memberId)?.monthlyLimit ?? 0;
  return sum(state.categories.filter((c) => c.kind === 'expense').map((c) => c.limit));
}

/** Money left this month per member, for the MemberChip switcher. */
export function selectMemberLeft(state: HouseholdState, member: HouseholdMember, now: Date = new Date()): number {
  return member.monthlyLimit - monthSpendFor(state, member.id, now);
}

// ── Partner approval ────────────────────────────────────────────────────────

export interface ApprovalsData {
  /** Shared purchases someone else logged that I still have to confirm. */
  awaitingMe: TransactionRecord[];
  /** Purchases I logged that others still have to confirm. */
  awaitingOthers: TransactionRecord[];
  /** Purchases I logged that someone disputed. */
  disputedMine: TransactionRecord[];
}

export function selectApprovals(state: HouseholdState): ApprovalsData {
  const me = state.currentMemberId;
  const logger = (t: TransactionRecord) => t.loggedBy ?? t.memberId;
  return {
    awaitingMe: state.transactions.filter((t) => !!t.needsApprovalFrom?.includes(me) && t.disputed?.byMemberId !== me),
    awaitingOthers: state.transactions.filter((t) => logger(t) === me && (t.needsApprovalFrom?.length ?? 0) > 0 && !t.disputed),
    disputedMine: state.transactions.filter((t) => logger(t) === me && !!t.disputed),
  };
}

// ── Activity ───────────────────────────────────────────────────────────────

export type ActivityKind = 'all' | 'spend' | 'income' | 'pending';
export type ActivityPeriod = 'week' | 'month' | 'all';

export interface ActivityFilters {
  kind: ActivityKind;
  period: ActivityPeriod;
  /** Empty = every member. */
  memberIds: string[];
  /** Empty string = every category. */
  categoryId: string;
  query: string;
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = { kind: 'all', period: 'month', memberIds: [], categoryId: '', query: '' };

export interface ActivityData {
  items: TransactionRecord[];
  spent: number;
  earned: number;
  counts: Record<ActivityKind, number>;
  /** True when any filter other than kind/period is narrowing the list. */
  narrowed: boolean;
}

export function selectActivity(state: HouseholdState, filters: ActivityFilters, now: Date = new Date()): ActivityData {
  const kindOf = (t: TransactionRecord) => state.categories.find((c) => c.id === t.categoryId)?.kind ?? (t.amount > 0 ? 'income' : 'expense');
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const inPeriod = (t: TransactionRecord) => {
    if (filters.period === 'all') return true;
    // Bounded both ends, so a future-dated row (fast-clock peer, import) can't inflate "this month".
    if (filters.period === 'month') return parseIsoDate(t.date) >= monthStart && parseIsoDate(t.date) < nextMonthStart;
    const age = dayIndex(t.date, now);
    return age >= 0 && age <= 6;
  };
  const q = filters.query.trim().toLowerCase();
  const matchesQuery = (t: TransactionRecord) => {
    if (!q) return true;
    const cat = state.categories.find((c) => c.id === t.categoryId)?.name ?? '';
    const who = state.members.find((m) => m.id === t.memberId)?.name ?? '';
    return [t.title, t.note ?? '', cat, who].some((s) => s.toLowerCase().includes(q));
  };
  // Everything except the kind tab - so the tab counts reflect the other filters.
  const base = state.transactions.filter(
    (t) => inPeriod(t) && (filters.memberIds.length === 0 || filters.memberIds.includes(t.memberId)) && (!filters.categoryId || t.categoryId === filters.categoryId) && matchesQuery(t),
  );
  const byKind = (kind: ActivityKind) =>
    base.filter((t) => (kind === 'all' ? true : kind === 'pending' ? !!t.pending : kind === 'income' ? kindOf(t) === 'income' : kindOf(t) === 'expense'));
  const items = byKind(filters.kind).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    items,
    spent: sum(items.filter((t) => t.amount < 0).map((t) => -t.amount)),
    earned: sum(items.filter((t) => t.amount > 0).map((t) => t.amount)),
    counts: { all: byKind('all').length, spend: byKind('spend').length, income: byKind('income').length, pending: byKind('pending').length },
    narrowed: filters.memberIds.length > 0 || !!filters.categoryId || !!q,
  };
}

// ── Goals ──────────────────────────────────────────────────────────────────

export interface GoalsData {
  active: Goal[];
  reached: Goal[];
  paused: Goal[];
  /** Totals across active goals. */
  savedTotal: number;
  targetTotal: number;
  remainingTotal: number;
}

/** "by Dec 20" (this year) or "by Mar 1, 2027"; undefined when the goal has no date. */
export function goalDeadlineLabel(goal: Pick<Goal, 'deadlineDate'>, now: Date = new Date()): string | undefined {
  if (!goal.deadlineDate) return undefined;
  const d = parseIsoDate(goal.deadlineDate);
  if (Number.isNaN(d.getTime())) return undefined;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `by ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })}`;
}

/** Weeks left until the deadline (at least 1), or undefined without a date. */
export function goalWeeksLeft(goal: Pick<Goal, 'deadlineDate'>, now: Date = new Date()): number | undefined {
  if (!goal.deadlineDate) return undefined;
  const d = parseIsoDate(goal.deadlineDate);
  if (Number.isNaN(d.getTime())) return undefined;
  // Calendar days, not raw milliseconds: a DST transition inside the window must not add or drop a week.
  const days = daysUntil(goal.deadlineDate, now);
  return Math.max(1, Math.ceil(days / 7));
}

/** Per-week amount needed to reach the target by the deadline, as money. */
export function goalPace(goal: Goal, now: Date = new Date()): number | undefined {
  const weeks = goalWeeksLeft(goal, now);
  // In cents: float dust on a completed goal must not ceil into a phantom $1/week (QA DR-3).
  const remainingCents = toCents(goal.target) - toCents(goal.saved);
  if (weeks === undefined || remainingCents <= 0) return undefined;
  return Math.ceil(remainingCents / 100 / weeks);
}

export function selectGoals(state: HouseholdState): GoalsData {
  const byCompletion = (a: Goal, b: Goal) => b.saved / b.target - a.saved / a.target;
  const active = state.goals.filter((g) => g.status === 'active').sort(byCompletion);
  const reached = state.goals.filter((g) => g.status === 'completed').sort((a, b) => (b.lastContributionAt ?? '').localeCompare(a.lastContributionAt ?? ''));
  const paused = state.goals.filter((g) => g.status === 'paused').sort(byCompletion);
  const savedTotal = sum(active.map((g) => g.saved));
  const targetTotal = sum(active.map((g) => g.target));
  return { active, reached, paused, savedTotal, targetTotal, remainingTotal: Math.max(0, targetTotal - savedTotal) };
}

/** Deposits into one goal, newest first. */
export function selectGoalContributions(state: HouseholdState, goalId: string): GoalContribution[] {
  return state.goalContributions.filter((c) => c.goalId === goalId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---- Household and members ----

/** One member's month: their personal budget, what they earned, where it went. */
export interface MemberSummary {
  member: HouseholdMember;
  /** Spent this month on their budget: their own purchases plus their share of shared ones, whoever paid. */
  spent: number;
  /** Income they logged this month. */
  earned: number;
  /** Their personal monthly budget. */
  limit: number;
  /** limit - spent; negative when over. */
  left: number;
  /** spent / limit (0 when there is no limit - "no cap" by convention). */
  ratio: number;
  /** True when the member has a personal monthly limit; limit 0 means no cap. */
  hasLimit: boolean;
  /** Over their personal limit, compared in cents. Never true without a limit. */
  over: boolean;
  /** The part of `spent` that is their share of shared purchases. */
  sharedSpent: number;
  /** Their share of the bills paid this month - required money, on top of `spent`, never against their budget. */
  bills: number;
  /** Number of everyday purchases this month. */
  count: number;
  /** Categories they spent most in this month (up to 3), against the household limit. */
  topCategories: BudgetRow[];
  /** Their latest transactions this month, newest first (up to 5). */
  recent: TransactionRecord[];
  daysLeft: number;
  monthLabel: string;
}

const monthBounds = (now: Date) => {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const inMonth = (t: TransactionRecord) => {
    const d = parseIsoDate(t.date);
    return d >= start && d < end;
  };
  const daysLeft = daysLeftInMonth(now);
  return { inMonth, daysLeft, monthLabel: now.toLocaleDateString('en-US', { month: 'long' }) };
};

const budgetRow = (category: Category, spent: number): BudgetRow => ({ category, spent, limit: category.limit, unlimited: category.limit <= 0, ratio: category.limit > 0 ? toCents(spent) / toCents(category.limit) : 0 });

export function selectMemberSummary(state: HouseholdState, member: HouseholdMember, now: Date = new Date()): MemberSummary {
  const { inMonth, daysLeft, monthLabel } = monthBounds(now);
  // Everything on this member's budget: what they earned, what they paid for themselves, and their share of shared purchases.
  const mine = state.transactions.filter((t) => inMonth(t) && touches(t, member.id, state.household, state.members));
  const outgoing = mine.filter((t) => t.amount < 0).map((t) => ({ t, amount: attributedAmount(t, member.id, state.household, state.members) })).filter((x) => x.amount !== 0);
  const purchases = outgoing.filter((x) => !isBillPayment(x.t));
  const spent = sum(purchases.map((x) => -x.amount));
  const bills = sum(outgoing.filter((x) => isBillPayment(x.t)).map((x) => -x.amount));
  const byCategory = new Map<string, number>();
  for (const x of purchases) byCategory.set(x.t.categoryId, (byCategory.get(x.t.categoryId) ?? 0) - x.amount);
  const topCategories = [...byCategory.entries()]
    .flatMap(([id, catSpent]) => {
      const category = state.categories.find((c) => c.id === id);
      return category ? [budgetRow(category, catSpent)] : [];
    })
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 3);
  return {
    member,
    spent,
    earned: sum(mine.filter((t) => t.amount > 0 && t.memberId === member.id).map((t) => t.amount)),
    limit: member.monthlyLimit,
    left: member.monthlyLimit - spent,
    // Limit 0 = no personal cap: never "over", same convention as category budgets (see BudgetRow.unlimited).
    ratio: member.monthlyLimit > 0 ? toCents(spent) / toCents(member.monthlyLimit) : 0,
    hasLimit: member.monthlyLimit > 0,
    over: member.monthlyLimit > 0 && toCents(spent) > toCents(member.monthlyLimit),
    sharedSpent: sum(purchases.filter((x) => isShared(x.t)).map((x) => -x.amount)),
    bills,
    count: purchases.length,
    topCategories,
    recent: [...mine].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5),
    daysLeft,
    monthLabel,
  };
}

/** The household's month: totals across everyone, one summary per member, and every expense category against its limit. */
export interface HouseholdSummary {
  /** Everyday spend this month, bills aside. */
  spent: number;
  /** Bills paid this month - required money, on top of `spent`. */
  bills: number;
  earned: number;
  /** Sum of the members' personal budgets. */
  limit: number;
  /** What the CAPPED members have left between them: Σ (limit − spent) over members with a personal limit, in whole cents. 0 when nobody has a cap. */
  left: number;
  /** Members with no personal cap - their spend is in `spent` but has no ceiling, so it never counts against `left` (audit MF-3). */
  uncapped: HouseholdMember[];
  daysLeft: number;
  monthLabel: string;
  members: MemberSummary[];
  /** Expense categories in their defined order (the Household screen's limits editor). */
  categories: BudgetRow[];
}

export function selectHouseholdSummary(state: HouseholdState, now: Date = new Date()): HouseholdSummary {
  const { inMonth, daysLeft, monthLabel } = monthBounds(now);
  const monthly = state.transactions.filter(inMonth);
  const expenses = monthly.filter((t) => t.amount < 0 && !isBillPayment(t));
  const spent = sum(expenses.map((t) => -t.amount));
  const members = state.members.map((m) => selectMemberSummary(state, m, now));
  const capped = members.filter((s) => s.hasLimit);
  const limit = fromCents(capped.reduce((acc, s) => acc + toCents(s.limit), 0));
  return {
    spent,
    bills: sum(monthly.filter(isBillPayment).map((t) => -t.amount)),
    earned: sum(monthly.filter((t) => t.amount > 0).map((t) => t.amount)),
    limit,
    // `limit − spent` charged an uncapped partner's spend (and spend attributed to a
    // removed member) against the capped members' ceilings, going negative while
    // nobody was over budget (audit MF-3).
    left: fromCents(capped.reduce((acc, s) => acc + toCents(s.left), 0)),
    uncapped: members.filter((s) => !s.hasLimit).map((s) => s.member),
    daysLeft,
    monthLabel,
    members,
    categories: state.categories.filter((c) => c.kind === 'expense').map((category) => budgetRow(category, sum(expenses.filter((t) => t.categoryId === category.id).map((t) => -t.amount)))),
  };
}
