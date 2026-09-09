import { describe, expect, it } from 'vitest';
import { allocateCents, attributedAmount, isShared, normaliseSplit, resolveDefaultWeights, roundMoney, shareOf, splitShares, toCents } from './split';
import { PRIYA, SAM, ALEX, household, member, purchase, income, state } from '../test/fixtures';

// The one rule everything downstream depends on: a purchase's shares add up to
// the purchase, exactly, in whole cents. The settle-up ledger, per-member
// budgets and the CSV `share` column are all built on this - a lost or invented
// cent here becomes a balance that never settles.

const members = [member(PRIYA), member(SAM)];
const equal = household();

describe('allocateCents', () => {
  it('splits an even amount evenly', () => {
    expect(allocateCents(1000, [{ memberId: PRIYA, weight: 1 }, { memberId: SAM, weight: 1 }])).toEqual([
      { memberId: PRIYA, cents: 500 },
      { memberId: SAM, cents: 500 },
    ]);
  });

  it('gives the odd cent to the payer', () => {
    const out = allocateCents(1001, [{ memberId: PRIYA, weight: 1 }, { memberId: SAM, weight: 1 }], SAM);
    expect(out).toEqual([
      { memberId: PRIYA, cents: 500 },
      { memberId: SAM, cents: 501 },
    ]);
  });

  it('breaks a tie by input order when nobody is preferred', () => {
    const out = allocateCents(1001, [{ memberId: PRIYA, weight: 1 }, { memberId: SAM, weight: 1 }]);
    expect(out[0]!.cents).toBe(501);
  });

  it('ignores zero and negative weights', () => {
    const out = allocateCents(900, [{ memberId: PRIYA, weight: 2 }, { memberId: SAM, weight: 0 }, { memberId: ALEX, weight: -5 }]);
    expect(out).toEqual([{ memberId: PRIYA, cents: 900 }]);
  });

  it('returns nothing when no weight is positive', () => {
    expect(allocateCents(500, [{ memberId: PRIYA, weight: 0 }])).toEqual([]);
  });

  it('allocates by ratio, largest remainder first', () => {
    // 100 cents over 1:2 is 33.33 / 66.67 - the leftover cent goes to the larger remainder.
    const out = allocateCents(100, [{ memberId: PRIYA, weight: 1 }, { memberId: SAM, weight: 2 }]);
    expect(out).toEqual([
      { memberId: PRIYA, cents: 33 },
      { memberId: SAM, cents: 67 },
    ]);
  });

  it('never loses or invents a cent, over 20k generated splits', () => {
    // A deterministic PRNG: a fuzz run that fails must fail again on re-run.
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 20_000; i++) {
      const total = Math.floor(rand() * 5_000_00); // up to $5,000
      const count = 1 + Math.floor(rand() * 5);
      const weights = Array.from({ length: count }, (_, n) => ({ memberId: `m${n}`, weight: Math.floor(rand() * 100) }));
      const out = allocateCents(total, weights);
      const sum = out.reduce((acc, a) => acc + a.cents, 0);
      if (out.length > 0) {
        expect(sum).toBe(total);
        expect(out.every((a) => a.cents >= 0)).toBe(true);
      } else {
        expect(weights.every((w) => w.weight <= 0)).toBe(true);
      }
    }
  });
});

describe('resolveDefaultWeights', () => {
  it('is equal when the household has no default split', () => {
    expect(resolveDefaultWeights(equal, members)).toEqual([
      { memberId: PRIYA, weight: 1 },
      { memberId: SAM, weight: 1 },
    ]);
  });

  it('uses the household ratio, and gives members missing from it nothing', () => {
    const hh = household({ defaultSplit: { mode: 'ratio', shares: { [PRIYA]: 0.6, [SAM]: 0.4 } } });
    expect(resolveDefaultWeights(hh, [...members, member(ALEX)])).toEqual([
      { memberId: PRIYA, weight: 0.6 },
      { memberId: SAM, weight: 0.4 },
      { memberId: ALEX, weight: 0 },
    ]);
  });

  it('falls back to equal when the ratio leaves every current member at zero', () => {
    // The ratio names people who have since left the household.
    const hh = household({ defaultSplit: { mode: 'ratio', shares: { someone_gone: 1 } } });
    expect(resolveDefaultWeights(hh, members)).toEqual([
      { memberId: PRIYA, weight: 1 },
      { memberId: SAM, weight: 1 },
    ]);
  });
});

describe('isShared', () => {
  it('is true for a flagged purchase and for one carrying a custom split', () => {
    expect(isShared(purchase('t1', 10, { shared: true }))).toBe(true);
    expect(isShared(purchase('t2', 10, { split: [{ memberId: PRIYA, amount: 10 }] }))).toBe(true);
  });

  it('is false for a personal purchase and for an empty split array', () => {
    expect(isShared(purchase('t3', 10))).toBe(false);
    expect(isShared(purchase('t4', 10, { split: [] }))).toBe(false);
  });
});

describe('splitShares', () => {
  it('leaves a personal purchase entirely with the payer', () => {
    expect(splitShares(purchase('t1', 42.5), equal, members)).toEqual([{ memberId: PRIYA, amount: 42.5 }]);
  });

  it('splits a shared purchase by the household default', () => {
    expect(splitShares(purchase('t1', 30, { shared: true }), equal, members)).toEqual([
      { memberId: PRIYA, amount: 15 },
      { memberId: SAM, amount: 15 },
    ]);
  });

  it('keeps a custom split that already adds up', () => {
    const t = purchase('t1', 50, { split: [{ memberId: PRIYA, amount: 20 }, { memberId: SAM, amount: 30 }] });
    expect(splitShares(t, equal, members)).toEqual([
      { memberId: PRIYA, amount: 20 },
      { memberId: SAM, amount: 30 },
    ]);
  });

  it('re-allocates a custom split that does not add up, using the stored amounts as weights', () => {
    // Stored shares total $40 on a $50 purchase - stale data from an edited amount.
    const t = purchase('t1', 50, { split: [{ memberId: PRIYA, amount: 10 }, { memberId: SAM, amount: 30 }] });
    const shares = splitShares(t, equal, members);
    expect(shares.reduce((acc, s) => acc + s.amount, 0)).toBeCloseTo(50, 10);
    expect(shares).toEqual([
      { memberId: PRIYA, amount: 12.5 },
      { memberId: SAM, amount: 37.5 },
    ]);
  });

  it('drops split entries for members who have left, then re-allocates', () => {
    const t = purchase('t1', 60, { split: [{ memberId: PRIYA, amount: 30 }, { memberId: 'm_gone', amount: 30 }] });
    expect(splitShares(t, equal, members)).toEqual([{ memberId: PRIYA, amount: 60 }]);
  });

  it('merges duplicate entries for one member instead of dropping money', () => {
    const t = purchase('t1', 60, { split: [{ memberId: PRIYA, amount: 20 }, { memberId: PRIYA, amount: 10 }, { memberId: SAM, amount: 30 }] });
    const shares = splitShares(t, equal, members);
    expect(shares.filter((s) => s.memberId === PRIYA)).toHaveLength(1);
    expect(shares.reduce((acc, s) => acc + s.amount, 0)).toBeCloseTo(60, 10);
  });

  it('falls back to the payer when the household has no members left to split with', () => {
    expect(splitShares(purchase('t1', 25, { shared: true }), equal, [])).toEqual([{ memberId: PRIYA, amount: 25 }]);
  });

  it('adds up to the total for awkward amounts across three people', () => {
    const three = [member(PRIYA), member(SAM), member(ALEX)];
    for (const amount of [0.01, 0.02, 10.01, 33.33, 99.99, 1234.56]) {
      const shares = splitShares(purchase('t', amount, { shared: true }), equal, three);
      const sumCents = shares.reduce((acc, s) => acc + toCents(s.amount), 0);
      expect(sumCents).toBe(toCents(amount));
    }
  });
});

describe('shareOf and attributedAmount', () => {
  it('gives a member zero when they are not part of the split', () => {
    expect(shareOf(purchase('t1', 20), SAM, equal, members)).toBe(0);
  });

  it('charges a purchase to the member as a negative, whoever paid', () => {
    const t = purchase('t1', 40, { shared: true, memberId: PRIYA });
    expect(attributedAmount(t, PRIYA, equal, members)).toBe(-20);
    expect(attributedAmount(t, SAM, equal, members)).toBe(-20);
  });

  it('counts income only for the earner', () => {
    const t = income('t1', 500, { memberId: SAM });
    expect(attributedAmount(t, SAM, equal, members)).toBe(500);
    expect(attributedAmount(t, PRIYA, equal, members)).toBe(0);
  });

  it('sums the attributed amounts of a shared purchase back to the total', () => {
    const t = purchase('t1', 99.99, { shared: true });
    const total = members.reduce((acc, m) => acc + attributedAmount(t, m.id, equal, members), 0);
    expect(toCents(total)).toBe(toCents(-99.99));
  });
});

describe('normaliseSplit', () => {
  it('scales a split to the total at write time', () => {
    const out = normaliseSplit([{ memberId: PRIYA, amount: 1 }, { memberId: SAM, amount: 3 }], 100, members);
    expect(out).toEqual([
      { memberId: PRIYA, amount: 25 },
      { memberId: SAM, amount: 75 },
    ]);
  });

  it('drops unknown members and non-positive amounts', () => {
    const out = normaliseSplit([{ memberId: 'nobody', amount: 5 }, { memberId: PRIYA, amount: 0 }, { memberId: SAM, amount: 5 }], 80, members);
    expect(out).toEqual([{ memberId: SAM, amount: 80 }]);
  });

  it('is undefined when nothing valid is left', () => {
    expect(normaliseSplit([{ memberId: 'nobody', amount: 5 }], 80, members)).toBeUndefined();
    expect(normaliseSplit(undefined, 80, members)).toBeUndefined();
  });

  it('normalises against the absolute total, so a signed amount works either way', () => {
    expect(normaliseSplit([{ memberId: PRIYA, amount: 1 }], -60, members)).toEqual([{ memberId: PRIYA, amount: 60 }]);
  });
});

describe('a shared purchase inside a household state', () => {
  it('charges each partner half and leaves the pair square in aggregate', () => {
    const s = state({ transactions: [purchase('t1', 81.37, { shared: true, memberId: PRIYA })] });
    const priya = attributedAmount(s.transactions[0]!, PRIYA, s.household, s.members);
    const sam = attributedAmount(s.transactions[0]!, SAM, s.household, s.members);
    expect(toCents(priya) + toCents(sam)).toBe(toCents(-81.37));
    // The odd cent goes to the payer.
    expect(toCents(priya)).toBe(-4069);
    expect(toCents(sam)).toBe(-4068);
  });
});

describe('toCents and roundMoney', () => {
  it('rounds half-cents away from zero in both directions', () => {
    expect(toCents(0.005)).toBe(1);
    expect(toCents(-0.005)).toBe(-1);
    expect(toCents(0.015)).toBe(2);
    expect(toCents(-0.015)).toBe(-2);
  });

  it('never returns negative zero', () => {
    expect(Object.is(toCents(-0.004), 0)).toBe(true);
    expect(Object.is(toCents(-0), 0)).toBe(true);
    expect(Object.is(roundMoney(-0.004), 0)).toBe(true);
  });

  it('pins the classics', () => {
    expect(toCents(983.35)).toBe(98335);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1_000_000)).toBe(100_000_000);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(100.30000000000001)).toBe(100.3);
  });

  it('roundMoney is a cent-preserving, idempotent quantizer', () => {
    for (const v of [12.345, -2.675, 0.1 + 0.2, 100.30000000000001, 983.3499999999999, -0.004, 42.805]) {
      const q = roundMoney(v);
      expect(toCents(q)).toBe(toCents(v)); // same cent reading as the raw value
      expect(roundMoney(q)).toBe(q); // idempotent
      expect(Math.abs(q - v)).toBeLessThan(0.005 + 1e-9); // moves at most half a cent
      expect(q * 100).toBeCloseTo(toCents(q), 9); // lands on a whole cent
    }
  });
});

describe('half-cents follow the rule, not the float (audit MF-6)', () => {
  it('a typed half-cent always rounds away from zero', () => {
    // 1.015 * 100 is 101.49999999999999 in binary; the rule says 102.
    expect(toCents(1.015)).toBe(102);
    expect(toCents(2.675)).toBe(268);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.015)).toBe(2);
    expect(toCents(-1.015)).toBe(-102);
    expect(toCents(-2.675)).toBe(-268);
    expect(roundMoney(1.015)).toBe(1.02);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });

  it('a value clearly under the half-cent still rounds down', () => {
    expect(toCents(1.0149)).toBe(101);
    expect(toCents(1.00499)).toBe(100);
    expect(toCents(-1.0149)).toBe(-101);
  });
});

describe('a removed member`s custom share goes to the payer (audit MON-11)', () => {
  const two = [member(PRIYA), member(SAM)];

  it('folds the share of a member who has left onto the payer; the partner`s share is untouched', () => {
    // Priya paid $90 split 30/30/30 with Sam and Alex; Alex is then removed. Sam still owes $30, not $45.
    const t = purchase('dinner', 90, { memberId: PRIYA, split: [{ memberId: PRIYA, amount: 30 }, { memberId: SAM, amount: 30 }, { memberId: ALEX, amount: 30 }] });
    expect(shareOf(t, SAM, equal, two)).toBe(30);
    expect(shareOf(t, PRIYA, equal, two)).toBe(60);
    expect(attributedAmount(t, SAM, equal, two)).toBe(-30);
    expect(splitShares(t, equal, two).reduce((acc, s) => acc + toCents(s.amount), 0)).toBe(9000);
  });

  it('when the payer has left too, the orphaned share stays with them - the remaining partners owe no more', () => {
    // Alex paid the same dinner and was removed: Priya and Sam still owe $30 each, the rest is Alex`s.
    const t = purchase('dinner', 90, { memberId: ALEX, split: [{ memberId: PRIYA, amount: 30 }, { memberId: SAM, amount: 30 }, { memberId: ALEX, amount: 30 }] });
    expect(shareOf(t, PRIYA, equal, two)).toBe(30);
    expect(shareOf(t, SAM, equal, two)).toBe(30);
    expect(shareOf(t, ALEX, equal, two)).toBe(30);
  });

  it('a payer who was not in the split still receives the orphaned share', () => {
    const t = purchase('gift', 50, { memberId: PRIYA, split: [{ memberId: SAM, amount: 20 }, { memberId: ALEX, amount: 30 }] });
    expect(splitShares(t, equal, two)).toEqual([
      { memberId: SAM, amount: 20 },
      { memberId: PRIYA, amount: 30 },
    ]);
  });

  it('stale amounts are still healed by re-allocation, with the orphaned share as the payer`s weight', () => {
    // Stored shares total $80 on a $100 purchase; Alex`s $20 goes to Priya before the re-weighting.
    const t = purchase('t1', 100, { memberId: PRIYA, split: [{ memberId: PRIYA, amount: 20 }, { memberId: SAM, amount: 40 }, { memberId: ALEX, amount: 20 }] });
    expect(splitShares(t, equal, two)).toEqual([
      { memberId: PRIYA, amount: 50 },
      { memberId: SAM, amount: 50 },
    ]);
  });
});

describe('write-time quantization composes with allocation', () => {
  it('a dusty float total, quantized at the store door, still splits to exact cents', () => {
    const total = roundMoney(33.35 + 33.45 + 33.5); // 100.30000000000001 -> 100.3
    expect(total).toBe(100.3);
    const t = purchase('p1', total, { shared: true });
    const shares = splitShares(t, household(), [member(PRIYA), member(SAM), member(ALEX)]);
    expect(shares.reduce((acc, s) => acc + toCents(s.amount), 0)).toBe(toCents(total));
  });

  it('a three-way tie hands the leftover cent to the payer, wherever they sit', () => {
    const out = allocateCents(
      100,
      [
        { memberId: PRIYA, weight: 1 },
        { memberId: SAM, weight: 1 },
        { memberId: ALEX, weight: 1 },
      ],
      SAM,
    );
    expect(out.reduce((acc, x) => acc + x.cents, 0)).toBe(100);
    expect(out.find((x) => x.memberId === SAM)!.cents).toBe(34);
  });
});
