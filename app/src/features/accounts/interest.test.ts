import { describe, expect, it } from 'vitest';
import { currentCardCycle, interestOverDaysCents, minPaymentCents, monthlyInterestCents, payoffWithFixedPayment, payoffWithMinimumOnly } from './interest';

// The card-interest estimators are the answer to "what does it cost if we
// don't pay the whole balance?" - so the maths is pinned with known values
// and then fuzzed for the invariants the screens rely on (integer cents,
// never negative, projections that account for every cent paid).

// Deterministic PRNG so a fuzz failure reproduces (same pattern as split.test.ts style fuzzing).
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('interestOverDaysCents / monthlyInterestCents', () => {
  it('matches hand-computed values', () => {
    // $1,000 carried at 20.99% p.a. for 30 days: 100000 * 20.99 * 30 / 36500 = 1725.2 -> $17.25
    expect(interestOverDaysCents(100_000, 20.99, 30)).toBe(1725);
    // One month at APR/12: 100000 * 20.99 / 1200 = 1749.2 -> $17.49
    expect(monthlyInterestCents(100_000, 20.99)).toBe(1749);
  });

  it('is zero when nothing is carried, the card is interest-free, or no time passes', () => {
    expect(interestOverDaysCents(0, 20.99, 30)).toBe(0);
    expect(interestOverDaysCents(-5_000, 20.99, 30)).toBe(0);
    expect(interestOverDaysCents(100_000, 0, 30)).toBe(0);
    expect(interestOverDaysCents(100_000, 20.99, 0)).toBe(0);
    expect(monthlyInterestCents(0, 20.99)).toBe(0);
    expect(monthlyInterestCents(50_000, 0)).toBe(0);
  });

  it('fuzz: integer cents, never negative, monotone in the carried balance', () => {
    const rand = rng(20260829);
    for (let i = 0; i < 2000; i++) {
      const carried = Math.floor(rand() * 5_000_000);
      const apr = rand() * 100;
      const days = 1 + Math.floor(rand() * 365);
      const interest = interestOverDaysCents(carried, apr, days);
      expect(Number.isInteger(interest)).toBe(true);
      expect(interest).toBeGreaterThanOrEqual(0);
      expect(interest).toBeLessThanOrEqual((carried * apr * days) / 36_500 + 1);
      expect(interestOverDaysCents(carried + 10_000, apr, days)).toBeGreaterThanOrEqual(interest);
    }
  });
});

describe('minPaymentCents', () => {
  it('is the greater of percent and floor, capped at what is owed', () => {
    // 2% of $1,000 = $20, floor $25 -> $25
    expect(minPaymentCents(100_000, 2, 2_500)).toBe(2_500);
    // 2% of $5,000 = $100 beats the $25 floor
    expect(minPaymentCents(500_000, 2, 2_500)).toBe(10_000);
    // Owing $15 with a $25 floor: pay the $15, not more than the debt
    expect(minPaymentCents(1_500, 2, 2_500)).toBe(1_500);
  });

  it('is null with no rules and zero when nothing is owed', () => {
    expect(minPaymentCents(100_000)).toBeNull();
    expect(minPaymentCents(100_000, 0, 0)).toBeNull();
    expect(minPaymentCents(0, 2, 2_500)).toBe(0);
    expect(minPaymentCents(-100, 2, 2_500)).toBe(0);
  });
});

describe('payoffWithFixedPayment', () => {
  it('clears a known case and accounts for every cent', () => {
    // $1,000 at 20.99%, $100/month: interest ~1.75%/mo, clears in 12 months.
    const p = payoffWithFixedPayment(100_000, 20.99, 10_000)!;
    expect(p).not.toBeNull();
    expect(p.months).toBe(12);
    // Total paid = debt + interest exactly (the last payment is partial).
    expect(p.interestCents).toBeGreaterThan(0);
    expect(p.interestCents).toBeLessThan(20_000);
  });

  it('never clears when the payment does not beat the interest', () => {
    // $10,000 at 24%: first month's interest is $200; paying $200 or less goes nowhere.
    expect(payoffWithFixedPayment(1_000_000, 24, 20_000)).toBeNull();
    expect(payoffWithFixedPayment(1_000_000, 24, 100)).toBeNull();
    expect(payoffWithFixedPayment(100_000, 20.99, 0)).toBeNull();
  });

  it('is instant when nothing is owed, interest-free without an APR', () => {
    expect(payoffWithFixedPayment(0, 20.99, 10_000)).toEqual({ months: 0, interestCents: 0 });
    const free = payoffWithFixedPayment(100_000, 0, 10_000)!;
    expect(free.months).toBe(10);
    expect(free.interestCents).toBe(0);
  });

  it('fuzz: every non-null projection conserves money (paid = owed + interest)', () => {
    const rand = rng(424242);
    for (let i = 0; i < 1000; i++) {
      const owed = 1 + Math.floor(rand() * 2_000_000);
      const apr = rand() * 40;
      const payment = 1 + Math.floor(rand() * 100_000);
      const p = payoffWithFixedPayment(owed, apr, payment);
      if (p === null) continue;
      expect(p.months).toBeGreaterThan(0);
      expect(p.months).toBeLessThanOrEqual(600);
      expect(Number.isInteger(p.interestCents)).toBe(true);
      expect(p.interestCents).toBeGreaterThanOrEqual(0);
      const totalPaid = owed + p.interestCents;
      // months-1 full payments cannot cover it; months payments always can.
      expect((p.months - 1) * payment).toBeLessThan(totalPaid);
      expect(p.months * payment).toBeGreaterThanOrEqual(totalPaid);
    }
  });
});

describe('payoffWithMinimumOnly', () => {
  it('the classic slow burn: 2% / $25 minimum on $1,000 takes years, not months', () => {
    const p = payoffWithMinimumOnly(100_000, 20.99, 2, 2_500)!;
    expect(p).not.toBeNull();
    // The $25 floor is what eventually clears it; percent-only would asymptote.
    expect(p.months).toBeGreaterThan(36);
    expect(p.interestCents).toBeGreaterThan(20_000);
  });

  it('is null when the card has no minimum rule or the minimum never beats the interest', () => {
    expect(payoffWithMinimumOnly(100_000, 20.99)).toBeNull();
    // 30% p.a. is 2.5%/month; a 2% minimum with no floor can never catch it.
    expect(payoffWithMinimumOnly(100_000, 30, 2)).toBeNull();
    expect(payoffWithMinimumOnly(0, 20.99, 2, 2_500)).toEqual({ months: 0, interestCents: 0 });
  });
});

describe('a percent-only minimum that converges is finite (audit MF-8)', () => {
  it('$1,000 at 20.99% with a 5% minimum and no floor clears in years, not "never"', () => {
    const p = payoffWithMinimumOnly(100_000, 20.99, 5);
    expect(p).not.toBeNull();
    // Geometric decay at ~0.967/month reaches the sub-dollar tail after roughly 200 months.
    expect(p!.months).toBeGreaterThan(100);
    expect(p!.months).toBeLessThan(600);
    expect(p!.interestCents).toBeGreaterThan(0);
  });

  it('a 1-cent floor gives the same answer - the tail rule, not the floor, ends the projection', () => {
    expect(payoffWithMinimumOnly(100_000, 20.99, 5, 1)).toEqual(payoffWithMinimumOnly(100_000, 20.99, 5));
  });

  it('a small balance under a percent-only minimum clears in one payment', () => {
    expect(payoffWithMinimumOnly(80, 20.99, 5)).toEqual({ months: 1, interestCents: 1 });
  });

  it('still says never when the minimum cannot beat the interest', () => {
    expect(payoffWithMinimumOnly(100_000, 30, 2)).toBeNull();
    expect(payoffWithMinimumOnly(100_000, 20.99)).toBeNull();
  });
});

describe('currentCardCycle', () => {
  it('inside the payment window: the closed statement and its live due date', () => {
    // Statement closes the 12th, due 25 days later: on Aug 29 the Aug 12 statement's Sep 6 due date is live.
    expect(currentCardCycle(12, 25, '2026-08-29')).toEqual({ statementDate: '2026-08-12', dueDate: '2026-09-06', closed: true, overdue: false });
  });

  it('a long grace keeps the OLDER statement live - the earliest unexpired due wins (QA7 A-4)', () => {
    // Day-31 close, 32-day grace, Mar 1 2027: Feb 28's due is Apr 1, but Jan 31's
    // due (Mar 4) is still ahead - that is the deadline, not April's.
    expect(currentCardCycle(31, 32, '2027-03-01')).toEqual({ statementDate: '2027-01-31', dueDate: '2027-03-04', closed: true, overdue: false });
    // A 44-day interest-free card mid-overlap: Jul 10's Aug 23 due beats Aug 10's Sep 23.
    expect(currentCardCycle(10, 44, '2026-08-20')).toEqual({ statementDate: '2026-07-10', dueDate: '2026-08-23', closed: true, overdue: false });
    // Once the older due expires the newer statement's due is simply next.
    expect(currentCardCycle(10, 44, '2026-08-29')).toEqual({ statementDate: '2026-08-10', dueDate: '2026-09-23', closed: true, overdue: false });
  });

  it('after the window with no payment logged: the missed statement, flagged overdue (QA7 R-5)', () => {
    // Due 5 days after the 12th passed on Aug 17 and nothing was paid since the close.
    expect(currentCardCycle(12, 5, '2026-08-29')).toEqual({ statementDate: '2026-08-12', dueDate: '2026-08-17', closed: true, overdue: true });
    // A payment logged before the close does not count for this window.
    expect(currentCardCycle(12, 5, '2026-08-29', '2026-08-11')).toEqual({ statementDate: '2026-08-12', dueDate: '2026-08-17', closed: true, overdue: true });
  });

  it('a payment logged since the close means the window was handled: the next cycle is what is ahead', () => {
    expect(currentCardCycle(12, 5, '2026-08-29', '2026-08-15')).toEqual({ statementDate: '2026-09-12', dueDate: '2026-09-17', closed: false, overdue: false });
  });

  it('clamps day 31 into short months without drifting', () => {
    // 2027 is not a leap year: Jan 31's zero-grace due has passed and was paid -
    // so February's clamped close (Feb 28) is next.
    expect(currentCardCycle(31, 0, '2027-02-10', '2027-02-01')).toEqual({ statementDate: '2027-02-28', dueDate: '2027-02-28', closed: false, overdue: false });
    // And March returns to the 31st - the clamp never sticks.
    expect(currentCardCycle(31, 0, '2027-03-05', '2027-03-01')).toEqual({ statementDate: '2027-03-31', dueDate: '2027-03-31', closed: false, overdue: false });
  });

  it('fuzz: overdue is the only way the due date sits in the past, and a payment today always clears it', () => {
    const rand = rng(777);
    for (let i = 0; i < 1500; i++) {
      const day = 1 + Math.floor(rand() * 31);
      const grace = Math.floor(rand() * 91);
      const year = 2025 + Math.floor(rand() * 3);
      const month = 1 + Math.floor(rand() * 12);
      const dom = 1 + Math.floor(rand() * 28);
      const today = `${year}-${String(month).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;

      const unpaid = currentCardCycle(day, grace, today);
      expect(unpaid.statementDate <= unpaid.dueDate).toBe(true);
      if (unpaid.overdue) {
        expect(unpaid.closed).toBe(true);
        expect(unpaid.dueDate < today).toBe(true);
      } else {
        expect(unpaid.dueDate >= today).toBe(true);
      }
      if (unpaid.closed) expect(unpaid.statementDate <= today).toBe(true);
      else expect(unpaid.statementDate > today).toBe(true);

      // Paid today: never overdue, and the old invariant holds in full.
      const paid = currentCardCycle(day, grace, today, today);
      expect(paid.overdue).toBe(false);
      expect(paid.dueDate >= today).toBe(true);
      expect(paid.statementDate <= paid.dueDate).toBe(true);
    }
  });
});
