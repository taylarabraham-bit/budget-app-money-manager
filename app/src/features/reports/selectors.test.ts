import { describe, expect, it } from 'vitest';
import { toCents } from '../../data/split';
import { PRIYA, SAM, household, income, purchase, state } from '../../test/fixtures';
import { listMonths, weeksOf } from './months';
import { selectMonthReport } from './selectors';

// The monthly report is the household's statement of record - its totals have to
// tie out to the cent, and its comparisons must never divide by float dust.

const NOW = new Date(2026, 7, 20, 12, 0); // Thu 20 Aug 2026, local noon
const at = (day: number) => `2026-08-${String(day).padStart(2, '0')}T12:00:00`;
const prevAt = (day: number) => `2026-07-${String(day).padStart(2, '0')}T12:00:00`;

describe('selectMonthReport ties out to the cent', () => {
  it('spend = bills + everyday, and category rows sum to everyday', () => {
    const s = state({
      transactions: [
        purchase('rent', 60, { recurring: true, date: at(2) }),
        purchase('a', 33.35, { date: at(5) }),
        purchase('b', 33.45, { date: at(9) }),
        purchase('c', 33.5, { date: at(15) }),
        income('pay', 3521.6, { date: at(1) }),
      ],
    });
    const r = selectMonthReport(s, '2026-08', null, NOW);
    expect(toCents(r.spend)).toBe(toCents(r.bills) + toCents(r.everyday));
    expect(toCents(r.everyday)).toBe(r.byCategory.reduce((acc, row) => acc + toCents(row.spent), 0));
    expect(r.bills).toBe(60);
  });

  it('a bill sits on its own line, out of categories and weeks', () => {
    const s = state({ transactions: [purchase('rent', 60, { recurring: true, date: at(2) }), purchase('coffee', 4.5, { date: at(2) })] });
    const r = selectMonthReport(s, '2026-08', null, NOW);
    expect(r.byCategory.reduce((acc, row) => acc + row.spent, 0)).toBe(4.5);
    expect(r.byWeek.reduce((acc, w) => acc + w.spent, 0)).toBe(4.5);
    expect(r.bills).toBe(60);
  });

  it('never divides a delta by cent-zero float dust (the astronomical-percent bug)', () => {
    // Previous month breaks even to the cent: 1173.87*2 + 1173.86 spent vs 3521.60 earned
    // leaves prevNet = 4.5e-13, which must read as zero, not become a divisor.
    const s = state({
      transactions: [
        purchase('p1', 1173.87, { date: prevAt(3) }),
        purchase('p2', 1173.87, { date: prevAt(10) }),
        purchase('p3', 1173.86, { date: prevAt(17) }),
        income('pay', 3521.6, { date: prevAt(1) }),
        income('now', 500, { date: at(5) }),
      ],
    });
    const r = selectMonthReport(s, '2026-08', null, NOW);
    expect(r.deltas.net).toBeNull();
  });

  it('the People share numerator and denominator agree on what counts as spend', () => {
    const s = state({ transactions: [purchase('a', 100, { memberId: PRIYA, date: at(5) }), purchase('b', 300, { memberId: SAM, date: at(6) })] });
    const r = selectMonthReport(s, '2026-08', null, NOW);
    expect(r.byMember.reduce((acc, m) => acc + m.share, 0)).toBeCloseTo(1, 10);
  });
});

describe('biggest purchases carry the scoped amount', () => {
  it('scoped: ranks by the member`s share and reports that share, not the sticker price', () => {
    // Shared $100 paid by Sam splits 50/50; Priya also spent $60 herself.
    const s = state({ transactions: [purchase('shared100', 100, { memberId: SAM, shared: true, date: at(5) }), purchase('own60', 60, { memberId: PRIYA, date: at(6) })] });
    const r = selectMonthReport(s, '2026-08', PRIYA, NOW);
    expect(r.biggest.map((x) => x.t.id)).toEqual(['own60', 'shared100']);
    expect(r.biggest.map((x) => -x.amount)).toEqual([60, 50]);
  });

  it('household-wide: the scoped amount IS the full amount', () => {
    const s = state({ transactions: [purchase('shared100', 100, { memberId: SAM, shared: true, date: at(5) }), purchase('own60', 60, { memberId: PRIYA, date: at(6) })] });
    const r = selectMonthReport(s, '2026-08', null, NOW);
    expect(r.biggest.map((x) => x.t.id)).toEqual(['shared100', 'own60']);
    expect(r.biggest.map((x) => x.amount)).toEqual(r.biggest.map((x) => x.t.amount));
  });
});

describe('the by-week average covers only the weeks that have started (audit MF-5)', () => {
  it('Aug 10 with $200 over slices 1-2 averages $100, not $40 over five slices', () => {
    const AUG10 = new Date(2026, 7, 10, 12, 0);
    const s = state({ transactions: [purchase('a', 100, { date: at(3) }), purchase('b', 100, { date: at(9) })] });
    const r = selectMonthReport(s, '2026-08', null, AUG10);
    expect(r.byWeek).toHaveLength(5);
    expect(r.weekAverage).toBe(100);
  });

  it('a finished month averages over every slice', () => {
    const s = state({ transactions: [purchase('a', 100, { date: prevAt(3) }), purchase('b', 100, { date: prevAt(9) })] });
    const r = selectMonthReport(s, '2026-07', null, NOW);
    expect(r.weekAverage).toBe(200 / r.byWeek.length);
  });

  it('a month with nothing elapsed averages nothing', () => {
    expect(selectMonthReport(state(), '2026-09', null, NOW).weekAverage).toBe(0);
  });
});

describe('verdicts are taken in cents (audit MON-5)', () => {
  it('a month that breaks even to the cent nets exactly 0 - not -1e-13 "overspent"', () => {
    const s = state({ transactions: [purchase('a', 0.18, { date: at(5) }), purchase('b', 159.99, { date: at(6) }), purchase('c', 839.83, { date: at(7) }), income('pay', 1000, { date: at(1) })] });
    const r = selectMonthReport(s, '2026-08', null, NOW);
    expect(Object.is(r.net, 0)).toBe(true);
    expect(r.net < 0).toBe(false);
  });

  it('a day that meets the daily target to the cent counts as a hit', () => {
    // 30.68 + 33.33 + 15.99 is a hair under 80 in floats; the target is $80.
    const s = state({ household: household({ dailyEarningTarget: 80 }), transactions: [income('a', 30.68, { date: at(5) }), income('b', 33.33, { date: at(5) }), income('c', 15.99, { date: at(5) })] });
    expect(selectMonthReport(s, '2026-08', null, NOW).dailyEarnings.daysHitTarget).toBe(1);
  });
});

describe('weeksOf partitions the month exactly', () => {
  it.each([
    ['2026-02', 28],
    ['2028-02', 29],
    ['2026-04', 30],
    ['2026-08', 31],
  ])('%s: every day in exactly one slice', (key, days) => {
    const slices = weeksOf(key);
    const covered = new Set<number>();
    for (const w of slices) for (let d = w.startDay; d <= w.endDay; d++) covered.add(d);
    expect(covered.size).toBe(days);
    expect(slices.reduce((acc, w) => acc + (w.endDay - w.startDay + 1), 0)).toBe(days);
  });
});

describe('listMonths survives a mistyped ancient year', () => {
  it('keys stay well-formed and the current month stays present', () => {
    const months = listMonths([{ date: '0202-03-15T12:00:00' }, { date: at(5) }], NOW);
    expect(months).toContain('2026-08');
    for (const m of months) expect(m).toMatch(/^\d{4}-\d{2}$/);
  });
});
