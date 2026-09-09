import { describe, expect, it } from 'vitest';
import { roundMoney, toCents } from '../../data/split';
import { newId } from '../../lib/ids';
import { bill } from '../../test/fixtures';
import { addFrequency } from './dates';
import { sampleBills } from './mock';
import { applyBillPatch, isBill } from './store';

// The bill guard is a sync door (HOUSEHOLD-style row guard for the bills store),
// and applyBillPatch carries the MF-2 anchor rule - the regression where a routine
// amount edit on a clamped month-end date walked rent from the 31st to the 28th
// permanently (the H5 disease).

describe('isBill guards recurrence fields', () => {
  it('accepts a valid anchorDay or none, rejects anything else', () => {
    expect(isBill(bill('b1'))).toBe(true);
    expect(isBill(bill('b1', { anchorDay: 31 }))).toBe(true);
    expect(isBill(bill('b1', { anchorDay: 1 }))).toBe(true);
    // anchor 0 made the monthly step a fixed point that never advances.
    expect(isBill({ ...bill('b1'), anchorDay: 0 })).toBe(false);
    expect(isBill({ ...bill('b1'), anchorDay: 32 })).toBe(false);
    expect(isBill({ ...bill('b1'), anchorDay: 15.5 })).toBe(false);
    expect(isBill({ ...bill('b1'), anchorDay: '31' })).toBe(false);
    expect(isBill({ ...bill('b1'), anchorDay: Number.NaN })).toBe(false);
  });
});

// Every field a screen dereferences is checked, optional ones included, so a
// malformed row from a pull or a backup is dropped at the door instead of
// crashing a render (audit SEC-3); dates must be real calendar days or the
// occurrence expansion inflates cash flow by the whole cap (audit MON-2); ids,
// own and foreign, follow the one shared rule (audit SEC-5).
describe('isBill is the sync and backup door (audit SEC-3, SEC-5, MON-2)', () => {
  const valid = () => bill('b1', { shared: true, note: 'hi', lastPaid: '2026-08-01', paused: false, accountId: 'a_everyday', anchorDay: 20 });

  it('accepts a fully populated row, a bare one, generated ids and the sample list', () => {
    expect(isBill(valid())).toBe(true);
    expect(isBill(bill('b1'))).toBe(true);
    expect(isBill(bill(newId('b')))).toBe(true);
    for (const row of sampleBills()) expect(isBill(row)).toBe(true);
  });

  const optional: Array<[string, unknown]> = [
    ['shared', 'yes'],
    ['shared', 1],
    ['note', 42],
    ['lastPaid', 20260801],
    ['lastPaid', '2026-8-1'],
    ['lastPaid', ''],
    ['paused', 'true'],
    ['accountId', 7],
    ['accountId', 'a/../b'],
    ['anchorDay', '31'],
  ];
  it.each(optional)('drops a row whose optional %s is %j', (field, value) => {
    expect(isBill({ ...valid(), [field]: value })).toBe(false);
  });

  const required: Array<[string, unknown]> = [
    ['id', 42],
    ['id', 'b/../1'],
    ['id', 'b"1'],
    ['id', ''],
    ['name', 1],
    ['amount', '5'],
    ['nextDue', ''],
    ['nextDue', '2026-8-25'],
    ['nextDue', '2026-02-30'],
    ['nextDue', 20260825],
    ['categoryId', 'c home'],
    ['memberId', undefined],
    ['kind', 'loan'],
    ['frequency', 'daily'],
    ['createdAt', undefined],
    ['createdAt', 1],
  ];
  it.each(required)('drops a row whose required %s is %j', (field, value) => {
    expect(isBill({ ...valid(), [field]: value })).toBe(false);
  });
});

describe('switching to a month-based frequency re-anchors on the current due day (audit MF-1)', () => {
  // Gym added weekly on Mon Aug 31 (anchor 31), paid three times: now due Sep 21.
  const gym = bill('b1', { frequency: 'weekly', nextDue: '2026-09-21', anchorDay: 31 });

  it('the form`s carried-over anchor does not survive a weekly -> monthly switch', () => {
    const monthly = applyBillPatch(gym, { frequency: 'monthly', nextDue: '2026-09-21', anchorDay: 31 });
    expect(monthly.anchorDay).toBe(21);
    // The next Mark as paid lands on Oct 21, not Oct 31.
    expect(addFrequency(monthly.nextDue, monthly.frequency, monthly.anchorDay)).toBe('2026-10-21');
  });

  it('a re-picked date in the same edit agrees with the rule', () => {
    expect(applyBillPatch(gym, { frequency: 'monthly', nextDue: '2026-09-25', anchorDay: 25 }).anchorDay).toBe(25);
  });

  it('month-to-month changes keep the anchor (a clamped Sep 30 with anchor 31 stays on the 31st)', () => {
    const rent = bill('b2', { frequency: 'monthly', nextDue: '2026-09-30', anchorDay: 31 });
    expect(applyBillPatch(rent, { frequency: 'quarterly', nextDue: rent.nextDue, anchorDay: 31 }).anchorDay).toBe(31);
  });

  it('an unchanged or still-weekly frequency leaves the anchor alone', () => {
    expect(applyBillPatch(gym, { frequency: 'weekly', amount: 15 }).anchorDay).toBe(31);
    expect(applyBillPatch(gym, { frequency: 'fortnightly' }).anchorDay).toBe(31);
  });
});

describe('applyBillPatch keeps the anchor honest (QA MF-2)', () => {
  // A 31st-anchored bill whose next due sits clamped in February.
  const clamped = bill('b1', { frequency: 'monthly', nextDue: '2027-02-28', anchorDay: 31 });

  it('an amount-only edit keeps anchor 31, and the schedule returns to month-end over two rolls', () => {
    // The edit form always submits nextDue + its own anchorDay derivation.
    const edited = applyBillPatch(clamped, { amount: 50, nextDue: clamped.nextDue, anchorDay: 31 });
    expect(edited.anchorDay).toBe(31);
    expect(edited.amount).toBe(50);
    // Two hops prove the anchor PERSISTED rather than got lucky: a rewritten
    // anchor of 28 looks identical for one hop and diverges after. markPaid
    // advances exactly one addFrequency step per tap (product decision: option B).
    const hop1 = addFrequency(edited.nextDue, edited.frequency, edited.anchorDay);
    expect(hop1).toBe('2027-03-31');
    const hop2 = addFrequency(hop1, edited.frequency, edited.anchorDay);
    expect(hop2).toBe('2027-04-30');
  });

  it('a genuinely changed date re-anchors; an unchanged one never does', () => {
    expect(applyBillPatch(clamped, { nextDue: '2027-02-15' }).anchorDay).toBe(15);
    expect(applyBillPatch(clamped, { amount: 9 }).anchorDay).toBe(31);
    expect(applyBillPatch(clamped, { nextDue: clamped.nextDue }).anchorDay).toBe(31);
    // An explicit anchorDay from the form always wins.
    expect(applyBillPatch(clamped, { nextDue: '2027-03-31', anchorDay: 31 }).anchorDay).toBe(31);
  });

  it('quantizes an edited amount to whole cents', () => {
    const next = applyBillPatch(clamped, { amount: 12.345 });
    expect(next.amount).toBe(roundMoney(12.345));
    expect(next.amount * 100).toBeCloseTo(toCents(next.amount), 9); // whole cents, no dust
  });
});
