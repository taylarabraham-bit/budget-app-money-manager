import { describe, expect, it } from 'vitest';
import { addFrequency } from '../../lib/frequency';
import { groupPaydays, horizonText, incomeRatio, payLabel, paydayBucket, selectCashFlow, selectPaydays, selectPaydaysSummary } from './selectors';
import { applySchedulePatch, isIncomeSchedule } from './store';
import { PRIYA, SAM, bill, category, goal, member, payday, purchase, state } from '../../test/fixtures';

// Cash flow turns "limit minus spend" into what is actually safe to spend
// before payday. Two fixed bugs live here:
//
//  - QA MF-1: the income side expanded every occurrence in the window while
//    the bill side counted each bill once, so a weekly bill due twice before
//    payday was charged once and safe-to-spend was overstated.
//  - QA MF-3: a member with monthlyLimit 0 means "no personal cap", but
//    0 − spend read as a deficit and showed a negative hero.

const NOW = new Date(2026, 7, 20, 12, 0); // Thu 20 Aug 2026, local noon

describe('payLabel', () => {
  it('names the near days and falls back to a date', () => {
    expect(payLabel(0, '2026-08-20', NOW)).toBe('Today');
    expect(payLabel(1, '2026-08-21', NOW)).toBe('Tomorrow');
    expect(payLabel(5, '2026-08-25', NOW)).toBe('In 5 days');
    expect(payLabel(30, '2026-09-19', NOW)).toBe('Sep 19');
  });

  it('says a missed payday is still expected', () => {
    expect(payLabel(-3, '2026-08-17', NOW)).toBe('Expected Aug 17');
  });
});

describe('horizonText', () => {
  it('counts down to payday', () => {
    expect(horizonText('payday (Thu)', 3)).toBe('Until payday (Thu) · 3 days');
    expect(horizonText('payday (Thu)', 1)).toBe('Until payday (Thu) · 1 day');
  });

  it('says payday today on the day', () => {
    expect(horizonText('payday (Thu)', 0)).toBe('Payday today');
  });

  it('is honest about an overdue payday instead of a perpetual today - QA M4', () => {
    expect(horizonText('payday (Thu)', 0, 3)).toBe('Payday 3 days late - mark it received');
    expect(horizonText('payday (Thu)', 0, 1)).toBe('Payday 1 day late - mark it received');
  });

  it('falls back to the month end label', () => {
    expect(horizonText('Aug 31', 0)).toBe('Last day · Aug 31');
  });
});

describe('paydayBucket', () => {
  it('buckets by how far off the next date is', () => {
    expect(paydayBucket(-1, false)).toBe('expected');
    expect(paydayBucket(0, false)).toBe('today');
    expect(paydayBucket(7, false)).toBe('week');
    expect(paydayBucket(8, false)).toBe('later');
  });

  it('puts a paused schedule in its own bucket whatever the date', () => {
    expect(paydayBucket(0, true)).toBe('paused');
  });
});

describe('selectPaydays', () => {
  it('sorts by next date and pushes paused schedules to the end', () => {
    const views = selectPaydays([payday('p_late', { nextDate: '2026-09-01' }), payday('p_paused', { nextDate: '2026-08-21', paused: true }), payday('p_soon', { nextDate: '2026-08-22' })], NOW);
    expect(views.map((v) => v.id)).toEqual(['p_soon', 'p_late', 'p_paused']);
  });

  it('averages each schedule to a monthly figure', () => {
    const [view] = selectPaydays([payday('p1', { amount: 2000, frequency: 'fortnightly' })], NOW);
    expect(view!.monthly).toBeCloseTo((2000 * 26) / 12, 6);
  });
});

describe('selectPaydaysSummary and incomeRatio', () => {
  const members = [member(PRIYA), member(SAM)];
  const schedules = [payday('p1', { memberId: PRIYA, amount: 3000, frequency: 'monthly' }), payday('p2', { memberId: SAM, amount: 1000, frequency: 'monthly' })];

  it('totals monthly income and splits it per member', () => {
    const summary = selectPaydaysSummary(schedules, members, NOW);
    expect(summary.monthlyTotal).toBe(4000);
    expect(summary.monthlyByMember[PRIYA]).toBe(3000);
    expect(summary.activeCount).toBe(2);
  });

  it('leaves a paused schedule out of the totals but counts it as paused', () => {
    const summary = selectPaydaysSummary([...schedules, payday('p3', { memberId: SAM, amount: 500, frequency: 'monthly', paused: true })], members, NOW);
    expect(summary.monthlyTotal).toBe(4000);
    expect(summary.pausedCount).toBe(1);
  });

  it('turns income into fractions that sum to one', () => {
    const ratio = incomeRatio(schedules, members);
    expect(ratio[PRIYA]).toBeCloseTo(0.75, 10);
    expect(ratio[SAM]).toBeCloseTo(0.25, 10);
    expect(Object.values(ratio).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('is empty when nobody has income set up', () => {
    expect(incomeRatio([], members)).toEqual({});
  });
});

describe('selectCashFlow', () => {
  const base = () => state({ categories: [category('groceries', { limit: 1000 }), category('pay', { kind: 'income', limit: 0 })] });

  it('counts every occurrence of a bill inside the window - QA MF-1', () => {
    // A weekly bill due Aug 24, payday Sep 4: due on the 24th and the 31st.
    const s = base();
    const flow = selectCashFlow(s, [bill('b1', { amount: 60, frequency: 'weekly', nextDue: '2026-08-24' })], [payday('p1', { nextDate: '2026-09-04' })], { memberId: null, now: NOW });
    // The window stops at month end, so both August occurrences count.
    expect(flow.billsDueItems).toHaveLength(2);
    expect(flow.billsDue).toBe(120);
  });

  it('gives every extra occurrence its own row id', () => {
    const flow = selectCashFlow(base(), [bill('b1', { amount: 60, frequency: 'weekly', nextDue: '2026-08-24' })], [payday('p1', { nextDate: '2026-09-04' })], { memberId: null, now: NOW });
    expect(new Set(flow.billsDueItems.map((i) => i.id)).size).toBe(flow.billsDueItems.length);
  });

  it('expands income occurrences over the same window', () => {
    const flow = selectCashFlow(base(), [], [payday('p1', { amount: 500, frequency: 'weekly', nextDate: '2026-08-22' })], { horizon: 'month', memberId: null, now: NOW });
    // Aug 22 and Aug 29 fall before month end.
    expect(flow.expectedIncome).toBe(1000);
  });

  it('leaves a paused bill and a paused payday out', () => {
    const flow = selectCashFlow(base(), [bill('b1', { paused: true })], [payday('p1', { paused: true })], { memberId: null, now: NOW });
    expect(flow.billsDue).toBe(0);
    expect(flow.hasSchedules).toBe(false);
    expect(flow.nextPayday).toBeNull();
  });

  it('subtracts bills and savings from what is left of the budget', () => {
    const s = base();
    s.transactions = [purchase('t1', 200, { date: '2026-08-05T12:00:00' })];
    const flow = selectCashFlow(s, [bill('b1', { amount: 100, nextDue: '2026-08-25' })], [payday('p1', { nextDate: '2026-08-28' })], { memberId: null, now: NOW });
    expect(flow.limitLeft).toBe(800);
    expect(flow.billsDue).toBe(100);
    expect(flow.safeToSpend).toBe(800 - 100 - flow.plannedSavings);
  });

  it('reports no ceiling for a member with no personal cap - QA MF-3', () => {
    const s = state({ members: [member(PRIYA, { monthlyLimit: 0 }), member(SAM)] });
    const flow = selectCashFlow(s, [], [], { memberId: PRIYA, now: NOW });
    expect(flow.hasLimit).toBe(false);
  });

  it('reports a ceiling for the household and for a capped member', () => {
    expect(selectCashFlow(base(), [], [], { memberId: null, now: NOW }).hasLimit).toBe(true);
    expect(selectCashFlow(base(), [], [], { memberId: PRIYA, now: NOW }).hasLimit).toBe(true);
  });

  it('collapses the window to today when a payday is overdue', () => {
    const flow = selectCashFlow(base(), [], [payday('p1', { nextDate: '2026-08-17' })], { memberId: null, now: NOW });
    expect(flow.until).toBe('2026-08-20');
    expect(flow.nextPayday?.overdueDays).toBe(3);
    expect(flow.nextPayday?.days).toBe(0);
  });

  it('stops at month end when payday falls after it', () => {
    const flow = selectCashFlow(base(), [], [payday('p1', { nextDate: '2026-09-10' })], { memberId: null, now: NOW });
    expect(flow.until).toBe('2026-08-31');
  });

  it('falls back to the month horizon when there is no payday at all', () => {
    const flow = selectCashFlow(base(), [], [], { memberId: null, now: NOW });
    expect(flow.horizon).toBe('month');
    expect(flow.until).toBe('2026-08-31');
  });

  it('scopes a shared bill to the member`s share', () => {
    const s = base();
    const household = selectCashFlow(s, [bill('b1', { amount: 100, shared: true, nextDue: '2026-08-25' })], [], { memberId: null, now: NOW });
    const mine = selectCashFlow(s, [bill('b1', { amount: 100, shared: true, nextDue: '2026-08-25' })], [], { memberId: PRIYA, now: NOW });
    expect(household.billsDue).toBe(100);
    expect(mine.billsDue).toBe(50);
  });

  it('leaves another member`s personal bill out of my forecast', () => {
    const flow = selectCashFlow(base(), [bill('b1', { amount: 100, memberId: SAM, nextDue: '2026-08-25' })], [], { memberId: PRIYA, now: NOW });
    expect(flow.billsDue).toBe(0);
  });

  it('sorts bill rows by date', () => {
    const bills = [bill('b1', { nextDue: '2026-08-28' }), bill('b2', { nextDue: '2026-08-22' })];
    const flow = selectCashFlow(base(), bills, [], { memberId: null, now: NOW });
    expect(flow.billsDueItems.map((i) => i.date)).toEqual(['2026-08-22', '2026-08-28']);
  });

  it('plans savings for a goal on a deadline and none for a completed one', () => {
    const s = base();
    s.goals = [goal('g1', { target: 1000, saved: 0, deadlineDate: '2026-12-31' }), goal('g2', { target: 500, saved: 500, deadlineDate: '2026-12-31', status: 'completed' })];
    const flow = selectCashFlow(s, [], [payday('p1', { nextDate: '2026-08-28' })], { memberId: null, now: NOW });
    expect(flow.savingsItems.map((i) => i.id)).toEqual(['g1']);
    expect(flow.plannedSavings).toBeGreaterThan(0);
  });

  it('leaves no phantom savings for a goal already at its target - QA DR-3', () => {
    const s = base();
    s.goals = [goal('g1', { target: 1000, saved: 1000, deadlineDate: '2026-12-31' })];
    expect(selectCashFlow(s, [], [], { memberId: null, now: NOW }).plannedSavings).toBe(0);
  });

  it('leaves a goal I do not contribute to out of my scoped savings', () => {
    const s = base();
    s.goals = [goal('g1', { target: 1000, saved: 0, deadlineDate: '2026-12-31', contributorIds: [SAM] })];
    expect(selectCashFlow(s, [], [], { memberId: PRIYA, now: NOW }).plannedSavings).toBe(0);
    expect(selectCashFlow(s, [], [], { memberId: SAM, now: NOW }).plannedSavings).toBeGreaterThan(0);
  });

  it('spreads what is safe over the days left', () => {
    const flow = selectCashFlow(base(), [], [payday('p1', { nextDate: '2026-08-24' })], { memberId: null, now: NOW });
    expect(flow.daysUntil).toBe(4);
    expect(flow.perDay).toBeCloseTo(flow.safeToSpend / 4, 10);
  });
});

describe('a late payday counts every occurrence still to receive (audit MF-11 / MON-13)', () => {
  const SEP1 = new Date(2026, 8, 1, 12, 0); // Tue 1 Sep 2026

  it('four fortnights behind: four Received taps, four times the amount', () => {
    // Tutoring $450 fortnightly, expected Jul 21: Jul 21, Aug 4, Aug 18 and today Sep 1 - four unreceived.
    const [v] = selectPaydays([payday('p1', { amount: 450, frequency: 'fortnightly', nextDate: '2026-07-21' })], SEP1);
    expect(v!.awaitingCount).toBe(4);
    expect(v!.awaitingTotal).toBe(1800);
    expect(v!.awaitingTruncated).toBe(false);
    expect(v!.dueText).toBe('Expected Jul 21 · 4 not received');
  });

  it('the "Not yet received" group total carries them all', () => {
    const groups = groupPaydays(selectPaydays([payday('p1', { amount: 450, frequency: 'fortnightly', nextDate: '2026-07-21' }), payday('p2', { amount: 100, nextDate: '2026-09-10' })], SEP1));
    expect(groups.find((g) => g.bucket === 'expected')!.total).toBe(1800);
    expect(groups.find((g) => g.bucket === 'later')!.total).toBe(100);
  });

  it('multiplies in exact money', () => {
    // 92.10 x 3 is 276.29999999999995 in raw floats.
    const [v] = selectPaydays([payday('p1', { amount: 92.1, frequency: 'monthly', nextDate: '2026-07-01' })], SEP1);
    expect(v!.awaitingCount).toBe(3);
    expect(v!.awaitingTotal).toBe(276.3);
  });

  it('a payday due today or ahead reads as before', () => {
    const [today] = selectPaydays([payday('p1', { amount: 450, nextDate: '2026-09-01' })], SEP1);
    expect(today!.awaitingCount).toBe(1);
    expect(today!.dueText).toBe('Today');
    const [ahead] = selectPaydays([payday('p2', { amount: 450, nextDate: '2026-09-05' })], SEP1);
    expect(ahead!.awaitingCount).toBe(0);
    expect(ahead!.awaitingTotal).toBe(0);
    const [lateOnce] = selectPaydays([payday('p3', { amount: 450, nextDate: '2026-08-30' })], SEP1);
    expect(lateOnce!.dueText).toBe('Expected Aug 30');
  });

  it('a paused schedule awaits nothing', () => {
    const [v] = selectPaydays([payday('p1', { nextDate: '2026-07-21', paused: true })], SEP1);
    expect(v!.awaitingCount).toBe(0);
  });

  it('says 60+ when the occurrence cap bites (audit MON-7)', () => {
    const [v] = selectPaydays([payday('p1', { amount: 60, frequency: 'weekly', nextDate: '2025-05-22' })], new Date(2026, 7, 20, 12, 0));
    expect(v!.awaitingCount).toBe(60);
    expect(v!.awaitingTruncated).toBe(true);
    expect(v!.dueText).toBe('Expected May 22, 2025 · 60+ not received');
  });
});

describe('selectCashFlow money and date honesty (audit MON-2, MF-4, MON-4, MON-5, MON-7)', () => {
  const base = () => state({ categories: [category('groceries', { limit: 1000 }), category('pay', { kind: 'income', limit: 0 })] });

  it('a malformed nextDue adds nothing to the bills due - MON-2', () => {
    // Stepping from "" used to emit the whole 60-occurrence cap: billsDue 6,000 and safe-to-spend -5,000.
    const flow = selectCashFlow(base(), [bill('b1', { amount: 100, nextDue: '' })], [payday('p1', { nextDate: '2026-08-28' })], { memberId: null, now: NOW });
    expect(flow.billsDueItems).toEqual([]);
    expect(flow.billsDue).toBe(0);
    expect(flow.safeToSpend).toBe(1000);
    expect(selectCashFlow(base(), [], [payday('p1', { nextDate: '2026-8-25' })], { memberId: null, now: NOW }).expectedIncome).toBe(0);
  });

  it('a household with every category limit at 0 has no ceiling - MF-4', () => {
    const s = state({ categories: [category('misc', { limit: 0 }), category('pay', { kind: 'income', limit: 0 })], transactions: [purchase('p', 312, { categoryId: 'misc', date: '2026-08-05T12:00:00' })] });
    const flow = selectCashFlow(s, [], [payday('p1', { nextDate: '2026-08-28' })], { memberId: null, now: NOW });
    expect(flow.hasLimit).toBe(false);
    // A limit on just one category is a ceiling again.
    expect(selectCashFlow(state({ categories: [category('misc', { limit: 0 }), category('groceries', { limit: 50 })] }), [], [], { memberId: null, now: NOW }).hasLimit).toBe(true);
  });

  it('plans savings in cents: an exact-dollar remainder never ceils into an extra dollar - MON-4', () => {
    // Target 512.07, saved 12.07: exactly $500 to go with one week left -> 500, not 501.
    const s = base();
    s.goals = [goal('g1', { target: 512.07, saved: 12.07, deadlineDate: '2026-08-27' })];
    const flow = selectCashFlow(s, [], [payday('p1', { nextDate: '2026-08-27' })], { memberId: null, now: NOW });
    expect(flow.plannedSavings).toBe(500);
    // Scoped to one of two contributors: half, still whole dollars.
    expect(selectCashFlow(s, [], [payday('p1', { nextDate: '2026-08-27' })], { memberId: PRIYA, now: NOW }).plannedSavings).toBe(250);
  });

  it('safe to spend is whole cents, so an exactly-even case is 0 and not a deficit - MON-5', () => {
    // Limit $1,000, purchases $0.18 + $159.99, a bill of $839.83 before payday: exactly nothing left.
    const s = base();
    s.transactions = [purchase('a', 0.18, { date: '2026-08-05T12:00:00' }), purchase('b', 159.99, { date: '2026-08-06T12:00:00' })];
    const flow = selectCashFlow(s, [bill('b1', { amount: 839.83, nextDue: '2026-08-25' })], [payday('p1', { nextDate: '2026-08-28' })], { memberId: null, now: NOW });
    expect(Object.is(flow.safeToSpend, 0)).toBe(true);
    expect(flow.limitLeft).toBe(839.83);
    expect(flow.billsDue).toBe(839.83);
  });

  it('flags when the occurrence cap cut a bill expansion short - MON-7', () => {
    const flow = selectCashFlow(base(), [bill('b1', { amount: 25, frequency: 'weekly', nextDue: '2025-05-22' })], [], { memberId: null, now: NOW });
    expect(flow.capped).toBe(true);
    expect(flow.billsDueItems).toHaveLength(60);
    expect(selectCashFlow(base(), [bill('b1', { amount: 25, frequency: 'weekly', nextDue: '2026-08-06' })], [], { memberId: null, now: NOW }).capped).toBe(false);
  });
});

describe('isIncomeSchedule is the sync and backup door (audit SEC-3, SEC-5, MON-2)', () => {
  const valid = () => payday('p1', { accountId: 'a_everyday', variable: true, paused: false, lastReceived: '2026-08-06', note: 'hi', anchorDay: 20 });

  it('accepts a fully populated row', () => {
    expect(isIncomeSchedule(valid())).toBe(true);
  });

  const cases: Array<[string, unknown]> = [
    ['nextDate', ''],
    ['nextDate', '2026-8-25'],
    ['nextDate', 20260825],
    ['lastReceived', 'yesterday'],
    ['lastReceived', 1],
    ['id', 'p 1'],
    ['id', ''],
    ['memberId', 3],
    ['categoryId', 'c/../x'],
    ['accountId', ''],
    ['variable', 'yes'],
    ['paused', 1],
    ['note', 5],
    ['createdAt', undefined],
  ];
  it.each(cases)('drops a row whose %s is %j', (field, value) => {
    expect(isIncomeSchedule({ ...valid(), [field]: value })).toBe(false);
  });
});

describe('applySchedulePatch re-anchors on a weekly -> monthly switch (audit MF-1)', () => {
  it('uses the current date`s day, not the carried-over weekly anchor', () => {
    const weekly = payday('p1', { frequency: 'weekly', nextDate: '2026-09-21', anchorDay: 31 });
    const monthly = applySchedulePatch(weekly, { frequency: 'monthly', nextDate: '2026-09-21', anchorDay: 31 });
    expect(monthly.anchorDay).toBe(21);
    expect(addFrequency(monthly.nextDate, 'monthly', monthly.anchorDay)).toBe('2026-10-21');
  });

  it('keeps the anchor for month-to-month and week-to-week changes', () => {
    expect(applySchedulePatch(payday('p1', { frequency: 'monthly', nextDate: '2026-09-30', anchorDay: 31 }), { frequency: 'yearly', nextDate: '2026-09-30', anchorDay: 31 }).anchorDay).toBe(31);
    expect(applySchedulePatch(payday('p1', { frequency: 'weekly', nextDate: '2026-09-21', anchorDay: 31 }), { frequency: 'fortnightly' }).anchorDay).toBe(31);
  });
});

describe('isIncomeSchedule guards recurrence fields', () => {
  it('accepts a valid anchorDay or none, rejects anything else', () => {
    expect(isIncomeSchedule(payday('p1'))).toBe(true);
    expect(isIncomeSchedule(payday('p1', { anchorDay: 31 }))).toBe(true);
    expect(isIncomeSchedule({ ...payday('p1'), anchorDay: 0 })).toBe(false);
    expect(isIncomeSchedule({ ...payday('p1'), anchorDay: 32 })).toBe(false);
    expect(isIncomeSchedule({ ...payday('p1'), anchorDay: '31' })).toBe(false);
    expect(isIncomeSchedule({ ...payday('p1'), anchorDay: Number.NaN })).toBe(false);
  });
});

describe('applySchedulePatch keeps the anchor honest (QA MF-2)', () => {
  const clamped = payday('p1', { frequency: 'monthly', nextDate: '2027-02-28', anchorDay: 31 });

  it('an amount-only edit keeps anchor 31 through two received rolls', () => {
    const edited = applySchedulePatch(clamped, { amount: 50, nextDate: clamped.nextDate, anchorDay: 31 });
    expect(edited.anchorDay).toBe(31);
    // markReceived advances exactly one addFrequency step per tap (product decision: option B).
    const hop1 = addFrequency(edited.nextDate, 'monthly', edited.anchorDay);
    expect(hop1).toBe('2027-03-31');
    const hop2 = addFrequency(hop1, 'monthly', edited.anchorDay);
    expect(hop2).toBe('2027-04-30');
  });

  it('a genuinely changed date re-anchors; an unchanged one never does', () => {
    expect(applySchedulePatch(clamped, { nextDate: '2027-02-15' }).anchorDay).toBe(15);
    expect(applySchedulePatch(clamped, { amount: 9 }).anchorDay).toBe(31);
    expect(applySchedulePatch(clamped, { nextDate: clamped.nextDate }).anchorDay).toBe(31);
  });
});
