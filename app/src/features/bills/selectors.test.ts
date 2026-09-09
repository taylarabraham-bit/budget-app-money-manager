import { describe, expect, it } from 'vitest';
import { bill } from '../../test/fixtures';
import { groupByDue, selectBills, selectBillsSummary, toBillView } from './selectors';

// Under option B one tap pays ONE occurrence, so a bill N periods behind
// genuinely owes N payments. Cash flow already expanded every unpaid
// occurrence; these pin that the bills surfaces say the same number instead
// of quoting the instalment once (QA7 B-1).

const NOW = new Date(2026, 7, 29, 12, 0); // Sat Aug 29 2026, local noon

describe('toBillView arrears', () => {
  it('counts every unpaid occurrence up to today', () => {
    // Weekly, first missed Aug 8: due Aug 8, 15, 22 and today the 29th - four owed.
    const v = toBillView(bill('b1', { amount: 5, frequency: 'weekly', nextDue: '2026-08-08' }), NOW);
    expect(v.arrearsCount).toBe(4);
    expect(v.arrearsTotal).toBe(20);
  });

  it('multiplies in exact money - no float dust', () => {
    // 92.10 * 3 is 276.29999999999995 in raw floats.
    const v = toBillView(bill('b1', { amount: 92.1, frequency: 'monthly', nextDue: '2026-06-29' }), NOW);
    expect(v.arrearsCount).toBe(3);
    expect(v.arrearsTotal).toBe(276.3);
  });

  it('keeps the month-end anchor through clamped months while counting', () => {
    // Monthly on the 31st, missed since May: May 31, Jun 30, Jul 31 - Aug 31 is still ahead.
    const v = toBillView(bill('b1', { amount: 100, frequency: 'monthly', nextDue: '2026-05-31', anchorDay: 31 }), NOW);
    expect(v.arrearsCount).toBe(3);
  });

  it('is zero for future bills and for paused ones', () => {
    expect(toBillView(bill('b1', { nextDue: '2026-09-05' }), NOW).arrearsCount).toBe(0);
    const paused = toBillView(bill('b1', { nextDue: '2026-08-08', paused: true }), NOW);
    expect(paused.arrearsCount).toBe(0);
    expect(paused.bucket).toBe('paused');
  });

  it('a bill due today owes exactly one', () => {
    const v = toBillView(bill('b1', { amount: 45, nextDue: '2026-08-29' }), NOW);
    expect(v.arrearsCount).toBe(1);
    expect(v.arrearsTotal).toBe(45);
  });
});

describe('the occurrence cap is visible instead of silent (audit MON-7)', () => {
  const AUG20 = new Date(2026, 7, 20, 12, 0);

  it('a weekly bill 66 periods behind reports 60 owed and says so', () => {
    const v = toBillView(bill('b1', { amount: 25, frequency: 'weekly', nextDue: '2025-05-22' }), AUG20);
    expect(v.arrearsCount).toBe(60);
    expect(v.arrearsTotal).toBe(1500);
    expect(v.arrearsTruncated).toBe(true);
  });

  it('ordinary arrears are not truncated', () => {
    expect(toBillView(bill('b1', { amount: 5, frequency: 'weekly', nextDue: '2026-08-08' }), NOW).arrearsTruncated).toBe(false);
    expect(toBillView(bill('b1', { nextDue: '2026-09-05' }), NOW).arrearsTruncated).toBe(false);
  });
});

describe('the surfaces agree with the arrears', () => {
  const bills = [
    bill('late', { name: 'Power', amount: 92.1, frequency: 'monthly', nextDue: '2026-07-29' }), // 2 behind (Jul 29, Aug 29)
    bill('soon', { name: 'Net', amount: 60, frequency: 'monthly', nextDue: '2026-09-02' }), // due in 4 days
  ];

  it('the overdue group total carries every missed occurrence', () => {
    const groups = groupByDue(selectBills(bills, 'all', NOW));
    const overdue = groups.find((g) => g.bucket === 'overdue')!;
    expect(overdue.total).toBe(184.2);
  });

  it('summary: overdueTotal and attentionTotal count the catch-up cost', () => {
    const s = selectBillsSummary(bills, NOW);
    expect(s.overdueTotal).toBe(184.2);
    expect(s.dueSoonTotal).toBe(60);
    expect(s.attentionTotal).toBe(244.2);
  });
});
