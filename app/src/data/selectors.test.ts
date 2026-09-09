import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTIVITY_FILTERS,
  goalDeadlineLabel,
  goalPace,
  goalWeeksLeft,
  isBillPayment,
  monthLimitFor,
  monthSpendFor,
  selectActivity,
  selectApprovals,
  selectGoalContributions,
  selectGoals,
  selectHouseholdSummary,
  selectMemberLeft,
  selectMemberSummary,
  selectOverview,
} from './selectors';
import { PRIYA, SAM, category, contribution, goal, income, member, purchase, state } from '../test/fixtures';

// This file feeds the home screen, and until now nothing tested it.
//
// The sharpest edge is `dayIndex`, defined as `-daysUntil(iso, now)` - a
// deliberate sign mirror. Inline it without the negation and today's earnings,
// yesterday's, this week's spend, last week's and the Activity week filter all
// silently read zero, because no real transaction has a negative age. Every
// day-arithmetic assertion below exists to catch that flip.
//
// `now` is fixed at Thursday 20 August 2026, local noon. Ages relative to it:
// today 08-20, yesterday 08-19, age 6 = 08-14, age 7 = 08-13, age 13 = 08-07.

const NOW = new Date(2026, 7, 20, 12, 0);
const at = (day: number, time = 'T12:00:00') => `2026-08-${String(day).padStart(2, '0')}${time}`;

describe('isBillPayment', () => {
  it('is a recurring charge going out, and nothing else', () => {
    expect(isBillPayment({ recurring: true, amount: -50 })).toBe(true);
    expect(isBillPayment({ recurring: true, amount: 50 })).toBe(false); // recurring income
    expect(isBillPayment({ recurring: false, amount: -50 })).toBe(false);
    expect(isBillPayment({ amount: -50 })).toBe(false);
  });
});

describe('selectOverview day arithmetic', () => {
  it('counts today`s earnings and not yesterday`s', () => {
    const s = state({ transactions: [income('i_today', 148.5, { date: at(20) }), income('i_yday', 90, { date: at(19) })] });
    const data = selectOverview(s, null, NOW);
    expect(data.todayEarnings).toBe(148.5);
  });

  it('reads zero for today when the only income is older - not a silent sign flip', () => {
    const s = state({ transactions: [income('i', 100, { date: at(19) })] });
    expect(selectOverview(s, null, NOW).todayEarnings).toBe(0);
  });

  it('compares today against yesterday', () => {
    const s = state({ transactions: [income('i1', 150, { date: at(20) }), income('i2', 100, { date: at(19) })] });
    expect(selectOverview(s, null, NOW).earningsChange).toBeCloseTo(0.5, 10);
  });

  it('has no comparison when yesterday earned nothing', () => {
    const s = state({ transactions: [income('i1', 150, { date: at(20) })] });
    expect(selectOverview(s, null, NOW).earningsChange).toBeNull();
  });

  it('sums this week as the last seven days including today', () => {
    // Ages 0 and 6 are in; age 7 is last week.
    const s = state({ transactions: [purchase('p0', 10, { date: at(20) }), purchase('p6', 20, { date: at(14) }), purchase('p7', 40, { date: at(13) })] });
    expect(selectOverview(s, null, NOW).weekSpend).toBe(30);
  });

  it('sums the previous week as ages seven to thirteen', () => {
    const s = state({ transactions: [purchase('p7', 25, { date: at(13) }), purchase('p13', 15, { date: at(7) }), purchase('p14', 99, { date: at(6) })] });
    const data = selectOverview(s, null, NOW);
    expect(data.weekSpend).toBe(0);
    expect(data.weekSpendChange).toBeCloseTo(-1, 10); // 0 vs 40
  });

  it('excludes a future-dated purchase from this week', () => {
    // A negative age: exactly what an unguarded sign flip would let in.
    const s = state({ transactions: [purchase('p_future', 60, { date: at(25) })] });
    expect(selectOverview(s, null, NOW).weekSpend).toBe(0);
  });

  it('builds a seven-day earnings trend ending today', () => {
    const s = state({ transactions: [income('i', 70, { date: at(20) })] });
    const trend = selectOverview(s, null, NOW).earningsTrend;
    expect(trend).toHaveLength(7);
    expect(trend[6]!.value).toBe(70); // today is last
    expect(trend[0]!.value).toBe(0);
    expect(trend[6]!.label).toBe('Thu');
  });
});

describe('selectOverview money', () => {
  it('keeps bill payments out of the budget and reports them separately', () => {
    const s = state({ transactions: [purchase('p', 100, { date: at(15) }), purchase('bill', 300, { date: at(15), recurring: true })] });
    const data = selectOverview(s, null, NOW);
    expect(data.monthSpend).toBe(100);
    expect(data.monthBills).toBe(300);
    // Both are age 5, so both sit inside the 0..6 week window - the bill is
    // left out because it is a bill, not because of its date.
    expect(data.weekSpend).toBe(100);
  });

  it('counts only this month, bounded at both ends', () => {
    const s = state({
      transactions: [purchase('in', 50, { date: at(15) }), purchase('last_month', 40, { date: '2026-07-31T12:00:00' }), purchase('next_month', 60, { date: '2026-09-01T12:00:00' })],
    });
    expect(selectOverview(s, null, NOW).monthSpend).toBe(50);
  });

  it('totals the household ceiling from expense category limits only', () => {
    const data = selectOverview(state(), null, NOW);
    expect(data.monthLimit).toBe(500); // groceries 500; the income category is not a ceiling
    expect(data.safeToSpend).toBe(500);
  });

  it('safe to spend is whole cents: a limit met to the cent reads 0, never float dust (audit MON-5)', () => {
    // 0.18 + 159.99 + 839.83 sums to 1000.0000000000001 in floats.
    const s = state({ categories: [category('groceries', { limit: 1000 })], transactions: [purchase('a', 0.18, { date: at(15) }), purchase('b', 159.99, { date: at(15) }), purchase('c', 839.83, { date: at(15) })] });
    const data = selectOverview(s, null, NOW);
    expect(Object.is(data.safeToSpend, 0)).toBe(true);
  });

  it('uses the member`s personal limit when scoped', () => {
    const s = state({ transactions: [purchase('p', 60, { shared: true, date: at(15) })] });
    const data = selectOverview(s, PRIYA, NOW);
    expect(data.monthLimit).toBe(2000);
    expect(data.monthSpend).toBe(30); // their half of the shared purchase
    expect(data.scope?.id).toBe(PRIYA);
  });

  it('rates a category exactly at its limit as 1, never over', () => {
    const s = state({ transactions: [purchase('p', 500, { date: at(15) })] });
    const row = selectOverview(s, null, NOW).budgets.find((b) => b.category.id === 'groceries')!;
    expect(row.ratio).toBe(1);
    expect(selectOverview(s, null, NOW).overBudget).toEqual([]);
  });

  it('flags a category genuinely over its limit', () => {
    const s = state({ transactions: [purchase('p', 500.01, { date: at(15) })] });
    expect(selectOverview(s, null, NOW).overBudget.map((b) => b.category.id)).toEqual(['groceries']);
  });

  it('marks a no-limit category unlimited and never rates it over', () => {
    const s = state({ categories: [category('misc', { limit: 0 })], transactions: [purchase('p', 400, { categoryId: 'misc', date: at(15) })] });
    const row = selectOverview(s, null, NOW).budgets.find((b) => b.category.id === 'misc')!;
    expect(row.unlimited).toBe(true);
    expect(row.ratio).toBe(0);
    expect(selectOverview(s, null, NOW).overBudget).toEqual([]);
  });

  it('classifies a transaction whose category no longer exists by its sign', () => {
    const s = state({ transactions: [purchase('orphan', 25, { categoryId: 'deleted', date: at(15) }), income('orphan_in', 10, { categoryId: 'deleted', date: at(20) })] });
    const data = selectOverview(s, null, NOW);
    expect(data.monthSpend).toBe(25);
    expect(data.todayEarnings).toBe(10);
  });

  it('lists the three most recent entries, newest first', () => {
    const s = state({ transactions: [purchase('a', 1, { date: at(10) }), purchase('b', 1, { date: at(18) }), purchase('c', 1, { date: at(14) }), purchase('d', 1, { date: at(2) })] });
    expect(selectOverview(s, null, NOW).recent.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('reports the scoped member`s share of a recent shared purchase', () => {
    const s = state({ transactions: [purchase('p', 41, { shared: true, memberId: SAM, date: at(18) })] });
    expect(selectOverview(s, PRIYA, NOW).recentShares['p']).toBe(20.5);
  });

  it('picks the goal closest to completion, and only ones the member contributes to', () => {
    const s = state({
      goals: [goal('g_far', { target: 1000, saved: 100 }), goal('g_near', { target: 1000, saved: 900 }), goal('g_theirs', { target: 100, saved: 99, contributorIds: [SAM] })],
    });
    expect(selectOverview(s, null, NOW).nearestGoal?.id).toBe('g_theirs');
    expect(selectOverview(s, PRIYA, NOW).nearestGoal?.id).toBe('g_near');
  });
});

describe('selectActivity filters', () => {
  const filters = (over: Partial<typeof DEFAULT_ACTIVITY_FILTERS> = {}) => ({ ...DEFAULT_ACTIVITY_FILTERS, ...over });

  const s = () =>
    state({
      transactions: [
        purchase('this_week', 10, { date: at(18), title: 'Coffee' }),
        purchase('last_week', 20, { date: at(11), title: 'Petrol', memberId: SAM }),
        purchase('last_month', 30, { date: '2026-07-20T12:00:00', title: 'Books' }),
        income('pay', 500, { date: at(19), title: 'Salary' }),
        purchase('pending', 40, { date: at(17), title: 'Dinner', pending: true }),
      ],
    });

  it('week keeps the last seven days and drops older rows', () => {
    const ids = selectActivity(s(), filters({ period: 'week' }), NOW).items.map((t) => t.id);
    expect(ids).toContain('this_week');
    expect(ids).not.toContain('last_week');
    expect(ids).not.toContain('last_month');
  });

  it('week excludes a future-dated row rather than treating it as recent', () => {
    const st = state({ transactions: [purchase('future', 10, { date: at(28) })] });
    expect(selectActivity(st, filters({ period: 'week' }), NOW).items).toEqual([]);
  });

  it('month is bounded at both ends', () => {
    const ids = selectActivity(s(), filters({ period: 'month' }), NOW).items.map((t) => t.id);
    expect(ids).toContain('last_week');
    expect(ids).not.toContain('last_month');
  });

  it('all keeps everything', () => {
    expect(selectActivity(s(), filters({ period: 'all' }), NOW).items).toHaveLength(5);
  });

  it('sorts newest first', () => {
    const ids = selectActivity(s(), filters({ period: 'all' }), NOW).items.map((t) => t.id);
    expect(ids[0]).toBe('pay'); // 08-19
  });

  it('splits spend, income and pending by kind', () => {
    const all = filters({ period: 'all' });
    expect(selectActivity(s(), { ...all, kind: 'income' }, NOW).items.map((t) => t.id)).toEqual(['pay']);
    expect(selectActivity(s(), { ...all, kind: 'pending' }, NOW).items.map((t) => t.id)).toEqual(['pending']);
    expect(selectActivity(s(), { ...all, kind: 'spend' }, NOW).items).toHaveLength(4);
  });

  it('counts every kind against the other filters, not against the kind tab', () => {
    const data = selectActivity(s(), filters({ period: 'all', kind: 'income' }), NOW);
    expect(data.counts).toEqual({ all: 5, spend: 4, income: 1, pending: 1 });
  });

  it('totals what is shown, not what is filtered out', () => {
    const data = selectActivity(s(), filters({ period: 'all' }), NOW);
    expect(data.spent).toBe(100);
    expect(data.earned).toBe(500);
  });

  it('filters by member and by category', () => {
    const all = filters({ period: 'all' });
    expect(selectActivity(s(), { ...all, memberIds: [SAM] }, NOW).items.map((t) => t.id)).toEqual(['last_week']);
    expect(selectActivity(s(), { ...all, categoryId: 'pay' }, NOW).items.map((t) => t.id)).toEqual(['pay']);
  });

  it('searches title, and is case-insensitive', () => {
    const all = filters({ period: 'all' });
    expect(selectActivity(s(), { ...all, query: 'coff' }, NOW).items.map((t) => t.id)).toEqual(['this_week']);
    expect(selectActivity(s(), { ...all, query: 'COFFEE' }, NOW).items.map((t) => t.id)).toEqual(['this_week']);
  });

  it('searches the member and category name too', () => {
    const all = filters({ period: 'all' });
    expect(selectActivity(s(), { ...all, query: 'sam' }, NOW).items.map((t) => t.id)).toEqual(['last_week']);
    expect(selectActivity(s(), { ...all, query: 'groceries' }, NOW).items.length).toBeGreaterThan(0);
  });

  it('reports narrowing only for filters beyond kind and period', () => {
    expect(selectActivity(s(), filters({ period: 'week', kind: 'spend' }), NOW).narrowed).toBe(false);
    expect(selectActivity(s(), filters({ query: 'x' }), NOW).narrowed).toBe(true);
    expect(selectActivity(s(), filters({ memberIds: [SAM] }), NOW).narrowed).toBe(true);
    expect(selectActivity(s(), filters({ categoryId: 'pay' }), NOW).narrowed).toBe(true);
  });

  it('ignores a whitespace-only query', () => {
    expect(selectActivity(s(), filters({ period: 'all', query: '   ' }), NOW).narrowed).toBe(false);
  });
});

describe('monthSpendFor, monthLimitFor and selectMemberLeft', () => {
  it('measures household spend with bills aside', () => {
    const s = state({ transactions: [purchase('p', 80, { date: at(15) }), purchase('b', 200, { date: at(15), recurring: true })] });
    expect(monthSpendFor(s, null, NOW)).toBe(80);
  });

  it('attributes a shared purchase to each member`s budget', () => {
    const s = state({ transactions: [purchase('p', 90, { shared: true, memberId: SAM, date: at(15) })] });
    expect(monthSpendFor(s, PRIYA, NOW)).toBe(45);
    expect(monthSpendFor(s, SAM, NOW)).toBe(45);
  });

  it('ignores other months', () => {
    const s = state({ transactions: [purchase('p', 80, { date: '2026-07-15T12:00:00' })] });
    expect(monthSpendFor(s, null, NOW)).toBe(0);
  });

  it('takes the ceiling from category limits or a personal limit', () => {
    const s = state();
    expect(monthLimitFor(s, null)).toBe(500);
    expect(monthLimitFor(s, PRIYA)).toBe(2000);
    expect(monthLimitFor(s, 'nobody')).toBe(0);
  });

  it('reports what a member has left', () => {
    const s = state({ members: [member(PRIYA, { monthlyLimit: 300 }), member(SAM)], transactions: [purchase('p', 100, { date: at(15) })] });
    expect(selectMemberLeft(s, s.members[0]!, NOW)).toBe(200);
  });
});

describe('selectApprovals', () => {
  it('separates what I owe a decision on from what I am waiting on', () => {
    const s = state({
      currentMemberId: PRIYA,
      transactions: [
        purchase('mine_to_confirm', 10, { memberId: SAM, needsApprovalFrom: [PRIYA] }),
        purchase('theirs_to_confirm', 20, { memberId: PRIYA, needsApprovalFrom: [SAM] }),
        purchase('settled', 30, { memberId: PRIYA }),
      ],
    });
    const data = selectApprovals(s);
    expect(data.awaitingMe.map((t) => t.id)).toEqual(['mine_to_confirm']);
    expect(data.awaitingOthers.map((t) => t.id)).toEqual(['theirs_to_confirm']);
    expect(data.disputedMine).toEqual([]);
  });

  it('surfaces a dispute against something I logged, and drops it from awaiting', () => {
    const disputed = { byMemberId: SAM, at: at(19) };
    const s = state({ currentMemberId: PRIYA, transactions: [purchase('t', 10, { memberId: PRIYA, needsApprovalFrom: [SAM], disputed })] });
    const data = selectApprovals(s);
    expect(data.disputedMine.map((t) => t.id)).toEqual(['t']);
    expect(data.awaitingOthers).toEqual([]);
  });

  it('does not ask me to confirm something I disputed myself', () => {
    const s = state({ currentMemberId: PRIYA, transactions: [purchase('t', 10, { memberId: SAM, needsApprovalFrom: [PRIYA], disputed: { byMemberId: PRIYA, at: at(19) } })] });
    expect(selectApprovals(s).awaitingMe).toEqual([]);
  });

  it('credits the logger, not the payer, when they differ', () => {
    const s = state({ currentMemberId: PRIYA, transactions: [purchase('t', 10, { memberId: SAM, loggedBy: PRIYA, needsApprovalFrom: [SAM] })] });
    expect(selectApprovals(s).awaitingOthers.map((t) => t.id)).toEqual(['t']);
  });
});

describe('goal deadlines and pace', () => {
  it('labels a deadline, with the year only when it differs', () => {
    expect(goalDeadlineLabel({ deadlineDate: '2026-12-20' }, NOW)).toBe('by Dec 20');
    expect(goalDeadlineLabel({ deadlineDate: '2027-03-01' }, NOW)).toBe('by Mar 1, 2027');
    expect(goalDeadlineLabel({}, NOW)).toBeUndefined();
    expect(goalDeadlineLabel({ deadlineDate: 'nonsense' }, NOW)).toBeUndefined();
  });

  it('counts whole weeks left, rounding up, never below one', () => {
    expect(goalWeeksLeft({ deadlineDate: '2026-08-27' }, NOW)).toBe(1); // 7 days
    expect(goalWeeksLeft({ deadlineDate: '2026-08-28' }, NOW)).toBe(2); // 8 days
    expect(goalWeeksLeft({ deadlineDate: '2026-08-20' }, NOW)).toBe(1); // today
    expect(goalWeeksLeft({ deadlineDate: '2026-08-01' }, NOW)).toBe(1); // already past
    expect(goalWeeksLeft({}, NOW)).toBeUndefined();
  });

  it('divides what is left over the weeks remaining', () => {
    expect(goalPace(goal('g', { target: 1000, saved: 0, deadlineDate: '2026-09-17' }), NOW)).toBe(250); // 28 days = 4 weeks
  });

  it('has no pace without a deadline, or once the target is met', () => {
    expect(goalPace(goal('g', { target: 1000, saved: 0 }), NOW)).toBeUndefined();
    expect(goalPace(goal('g', { target: 1000, saved: 1000, deadlineDate: '2026-12-20' }), NOW)).toBeUndefined();
  });

  it('has no phantom pace from float dust on a met target - QA DR-3', () => {
    const saved = 300.15 + 341.6 + 341.6; // 983.3499999999999
    expect(goalPace(goal('g', { target: 983.35, saved, deadlineDate: '2026-12-20' }), NOW)).toBeUndefined();
  });
});

describe('selectGoals and selectGoalContributions', () => {
  it('groups by status and sorts active by how close they are', () => {
    const s = state({
      goals: [
        goal('far', { target: 1000, saved: 100 }),
        goal('near', { target: 1000, saved: 900 }),
        goal('done', { target: 500, saved: 500, status: 'completed', lastContributionAt: at(10) }),
        goal('done2', { target: 500, saved: 500, status: 'completed', lastContributionAt: at(18) }),
        goal('held', { target: 200, saved: 10, status: 'paused' }),
      ],
    });
    const data = selectGoals(s);
    expect(data.active.map((g) => g.id)).toEqual(['near', 'far']);
    expect(data.reached.map((g) => g.id)).toEqual(['done2', 'done']); // most recent first
    expect(data.paused.map((g) => g.id)).toEqual(['held']);
  });

  it('totals across active goals only, and never reports a negative remainder', () => {
    const s = state({ goals: [goal('a', { target: 1000, saved: 400 }), goal('b', { target: 500, saved: 900 }), goal('c', { target: 999, saved: 0, status: 'paused' })] });
    const data = selectGoals(s);
    expect(data.savedTotal).toBe(1300);
    expect(data.targetTotal).toBe(1500);
    expect(data.remainingTotal).toBe(200);
  });

  it('clamps the remainder at zero when the active goals are past target', () => {
    const s = state({ goals: [goal('a', { target: 100, saved: 500 })] });
    expect(selectGoals(s).remainingTotal).toBe(0);
  });

  it('lists one goal`s deposits newest first', () => {
    const s = state({
      goalContributions: [contribution('c1', 'g1', 10, { date: at(10) }), contribution('c2', 'g1', 20, { date: at(18) }), contribution('c3', 'other', 30, { date: at(19) })],
    });
    expect(selectGoalContributions(s, 'g1').map((c) => c.id)).toEqual(['c2', 'c1']);
  });
});

// `hasLimit`/`over` moved into the summary so the MF-3 convention (limit 0 =
// "no cap", never over; money compares run in cents) is pinned here instead of
// living as ad-hoc float compares in the components.

describe('selectMemberSummary personal caps (QA MF-3)', () => {
  const summaryFor = (s: ReturnType<typeof state>) => selectMemberSummary(s, s.members[0]!, NOW);
  const withCap = (limit: number, transactions: ReturnType<typeof purchase>[]) =>
    state({ members: [member(PRIYA, { monthlyLimit: limit }), member(SAM, { color: 'sky' })], transactions });

  it('a no-cap member with real spend is never over', () => {
    // Real spend matters: with zero spend the buggy `spent > limit` also read false.
    const summary = summaryFor(withCap(0, [purchase('p', 123.45)]));
    expect(summary.spent).toBe(123.45);
    expect(summary.hasLimit).toBe(false);
    expect(summary.over).toBe(false);
    expect(summary.ratio).toBe(0);
  });

  it('float dust above the limit is not over - the compare runs in cents', () => {
    // 0.1 + 0.2 sums to 0.30000000000000004 in floats; in cents both sides are 30.
    const summary = summaryFor(withCap(0.3, [purchase('a', 0.1), purchase('b', 0.2)]));
    expect(summary.spent).toBeGreaterThan(0.3);
    expect(summary.over).toBe(false);
    expect(summary.ratio).toBe(1);
  });

  it('exactly at the limit is not over; one cent above is', () => {
    const atLimit = summaryFor(withCap(100.1, [purchase('a', 50.05), purchase('b', 50.05)]));
    expect(atLimit.over).toBe(false);
    expect(atLimit.ratio).toBe(1);
    const oneCentOver = summaryFor(withCap(100.1, [purchase('a', 50.05), purchase('b', 50.06)]));
    expect(oneCentOver.over).toBe(true);
    expect(oneCentOver.ratio).toBeGreaterThan(1);
  });

  it('bills never count against the cap', () => {
    const summary = summaryFor(withCap(100, [purchase('rent', 500, { recurring: true }), purchase('coffee', 50)]));
    expect(summary.spent).toBe(50);
    expect(summary.bills).toBe(500);
    expect(summary.over).toBe(false);
  });

  it('a shared purchase lands as the member`s share, whoever paid', () => {
    const s = state({ transactions: [purchase('sh', 100, { memberId: SAM, shared: true })] });
    const summary = selectMemberSummary(s, s.members[0]!, NOW);
    expect(summary.spent).toBe(50);
    expect(summary.sharedSpent).toBe(50);
    expect(summary.count).toBe(1);
  });
});

describe('selectHouseholdSummary', () => {
  it('sums the members` caps; an uncapped household reports limit 0 and nothing "left"', () => {
    const uncapped = selectHouseholdSummary(state({ members: [member(PRIYA, { monthlyLimit: 0 }), member(SAM, { color: 'sky', monthlyLimit: 0 })], transactions: [purchase('p', 75)] }), NOW);
    expect(uncapped.limit).toBe(0);
    // Nobody has a ceiling, so nothing is "left" of one - the Household screen shows "Earned this month" instead (audit MF-3).
    expect(uncapped.left).toBe(0);
    expect(uncapped.uncapped.map((m) => m.id)).toEqual([PRIYA, SAM]);
    expect(uncapped.members.every((m) => !m.hasLimit && !m.over)).toBe(true);

    const mixed = selectHouseholdSummary(state({ members: [member(PRIYA, { monthlyLimit: 2000 }), member(SAM, { color: 'sky', monthlyLimit: 0 })] }), NOW);
    expect(mixed.limit).toBe(2000);
    expect(mixed.uncapped.map((m) => m.id)).toEqual([SAM]);
  });

  it('an uncapped member`s spend never eats into the capped members` "left" (audit MF-3)', () => {
    // Priya cap $1,000 spends $400; Sam has no cap and spends $800: $600 left, not -$200 "over" while nobody is over budget.
    const s = state({
      members: [member(PRIYA, { monthlyLimit: 1000 }), member(SAM, { color: 'sky', monthlyLimit: 0 })],
      transactions: [purchase('p', 400, { memberId: PRIYA }), purchase('s', 800, { memberId: SAM })],
    });
    const summary = selectHouseholdSummary(s, NOW);
    expect(summary.spent).toBe(1200);
    expect(summary.limit).toBe(1000);
    expect(summary.left).toBe(600);
    expect(summary.members.every((m) => !m.over)).toBe(true);
  });

  it('spend attributed to a removed member lands in the household total but not in "left"', () => {
    const s = state({ members: [member(PRIYA, { monthlyLimit: 1000 })], transactions: [purchase('p', 100, { memberId: PRIYA }), purchase('gone', 50, { memberId: 'm_gone' })] });
    const summary = selectHouseholdSummary(s, NOW);
    expect(summary.spent).toBe(150);
    expect(summary.left).toBe(900);
  });

  it('members` attributed spend adds up to the household total, bills aside', () => {
    const s = state({ transactions: [purchase('sh', 100, { memberId: SAM, shared: true }), purchase('own', 40), purchase('rent', 60, { recurring: true })] });
    const summary = selectHouseholdSummary(s, NOW);
    expect(summary.spent).toBe(140);
    expect(summary.bills).toBe(60);
    expect(summary.members.reduce((acc, m) => acc + m.spent, 0)).toBe(140);
  });
});
