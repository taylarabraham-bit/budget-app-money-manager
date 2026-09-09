import { describe, expect, it } from 'vitest';
import { roundMoney } from '../../data/split';
import { daysUntil, todayIso } from '../../lib/dates';
import { account, accountTransfer, creditCard } from '../../test/fixtures';
import { currentCardCycle } from './interest';
import { sampleAccounts, sampleTransfers } from './mock';
import { applyAccountPatch, buildTransfer, isAccount, isAccountTransfer } from './store';

// The guards are sync doors (SY-5/SY-11 class): a malformed row from a pull
// or a backup must be dropped before it can NaN the interest maths or a
// balance. applyAccountPatch / buildTransfer are the write boundaries -
// whole cents, 2 dp rates, in-range days - mirroring the bills tests.

describe('isAccount guards the credit terms', () => {
  it('accepts valid accounts of every kind', () => {
    expect(isAccount(account('a1'))).toBe(true);
    expect(isAccount(account('a1', { kind: 'savings', memberId: 'm_priya', note: 'hi', archived: true }))).toBe(true);
    expect(isAccount(creditCard('a2', { creditLimit: 6000, statementDay: 12, dueDaysAfterStatement: 25, minPaymentPercent: 2, minPaymentFloor: 25 }))).toBe(true);
    expect(isAccount(creditCard('a2', { statementDay: 1 }))).toBe(true);
    expect(isAccount(creditCard('a2', { statementDay: 31, dueDaysAfterStatement: 0 }))).toBe(true);
  });

  it('rejects out-of-range or mistyped terms (they feed date and interest maths)', () => {
    expect(isAccount({ ...creditCard('a2'), apr: -1 })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), apr: 101 })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), apr: '20.99' })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), apr: Number.NaN })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), statementDay: 0 })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), statementDay: 32 })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), statementDay: 12.5 })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), dueDaysAfterStatement: -1 })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), dueDaysAfterStatement: 91 })).toBe(false);
    expect(isAccount({ ...creditCard('a2'), minPaymentPercent: 101 })).toBe(false);
    expect(isAccount({ ...account('a1'), kind: 'cheque' })).toBe(false);
    expect(isAccount({ ...account('a1'), openingBalance: '12' })).toBe(false);
  });
});

describe('isAccountTransfer needs at least one end', () => {
  it('accepts two-ended and one-ended moves, rejects none-ended', () => {
    expect(isAccountTransfer(accountTransfer('t1', 'a1', 'a2', 50))).toBe(true);
    expect(isAccountTransfer(accountTransfer('t1', 'a1', null, 50))).toBe(true);
    expect(isAccountTransfer(accountTransfer('t1', null, 'a2', 50))).toBe(true);
    expect(isAccountTransfer(accountTransfer('t1', null, null, 50))).toBe(false);
    expect(isAccountTransfer({ ...accountTransfer('t1', 'a1', 'a2', 50), amount: 'x' })).toBe(false);
  });
});

describe('ids follow the one shared rule, own and foreign (audit SEC-5)', () => {
  it('rejects ids that could traverse a path or break the pagination filter', () => {
    expect(isAccount({ ...account('a1'), id: 'a/../1' })).toBe(false);
    expect(isAccount({ ...account('a1'), id: '' })).toBe(false);
    expect(isAccount({ ...account('a1'), memberId: 'm"1' })).toBe(false);
    expect(isAccountTransfer({ ...accountTransfer('t1', 'a1', 'a2', 50), id: '' })).toBe(false);
    expect(isAccountTransfer({ ...accountTransfer('t1', 'a1', 'a2', 50), fromAccountId: 'a 1' })).toBe(false);
    expect(isAccountTransfer({ ...accountTransfer('t1', 'a1', null, 50), memberId: 'm\\1' })).toBe(false);
    // A transfer whose only end is a malformed id has no usable end.
    expect(isAccountTransfer(accountTransfer('t1', 'a/../1', null, 50))).toBe(false);
  });

  it('still accepts the ids the app generates', () => {
    expect(isAccount(account('a_everyday', { memberId: 'm_priya' }))).toBe(true);
    expect(isAccountTransfer(accountTransfer('at_x', 'a_everyday', 'a_visa', 50, { memberId: 'm_sam' }))).toBe(true);
  });
});

describe('applyAccountPatch is the write boundary', () => {
  it('quantizes money to whole cents and rates to 2 dp', () => {
    const next = applyAccountPatch(creditCard('a1'), { openingBalance: 12.345, apr: 20.994999, creditLimit: 6000.005, minPaymentFloor: 25.009 });
    expect(next.openingBalance).toBe(roundMoney(12.345));
    expect(next.apr).toBe(20.99);
    expect(next.creditLimit).toBe(roundMoney(6000.005));
    expect(next.minPaymentFloor).toBe(roundMoney(25.009));
  });

  it('drops out-of-range terms instead of storing them', () => {
    const next = applyAccountPatch(creditCard('a1', { statementDay: 12 }), { statementDay: 0, dueDaysAfterStatement: 400, minPaymentPercent: -2 });
    expect(next.statementDay).toBeUndefined();
    expect(next.dueDaysAfterStatement).toBeUndefined();
    expect(next.minPaymentPercent).toBeUndefined();
  });

  it('keeps a card balance positive and scrubs credit terms off bank accounts', () => {
    expect(applyAccountPatch(creditCard('a1'), { openingBalance: -862.45 }).openingBalance).toBe(862.45);
    // Switching kind away from credit removes terms that no longer mean anything.
    const demoted = applyAccountPatch(creditCard('a1', { creditLimit: 5000, statementDay: 12, dueDaysAfterStatement: 25, minPaymentPercent: 2, minPaymentFloor: 25 }), { kind: 'everyday' });
    expect(demoted.apr).toBeUndefined();
    expect(demoted.creditLimit).toBeUndefined();
    expect(demoted.statementDay).toBeUndefined();
    expect(demoted.dueDaysAfterStatement).toBeUndefined();
    expect(demoted.minPaymentPercent).toBeUndefined();
    expect(demoted.minPaymentFloor).toBeUndefined();
    // A bank account may be overdrawn - its opening stays signed.
    expect(applyAccountPatch(account('a2'), { openingBalance: -120.5 }).openingBalance).toBe(-120.5);
  });

  it('an empty name keeps the old one; empty member/note clear to undefined', () => {
    const next = applyAccountPatch(account('a1', { name: 'Joint Everyday Account', memberId: 'm_priya', note: 'x' }), { name: '   ', memberId: '', note: ' ' });
    expect(next.name).toBe('Joint Everyday Account');
    expect(next.memberId).toBeUndefined();
    expect(next.note).toBeUndefined();
  });
});

describe('buildTransfer validates the move', () => {
  it('needs two distinct ends (or one end and the outside) and real money', () => {
    expect(buildTransfer({ amount: 50 })).toBeNull();
    expect(buildTransfer({ fromAccountId: 'a1', toAccountId: 'a1', amount: 50 })).toBeNull();
    expect(buildTransfer({ fromAccountId: 'a1', toAccountId: 'a2', amount: 0 })).toBeNull();
    expect(buildTransfer({ fromAccountId: 'a1', toAccountId: 'a2', amount: 0.004 })).toBeNull(); // rounds to no cents
    expect(buildTransfer({ fromAccountId: 'a1', amount: 50 })).not.toBeNull();
    expect(buildTransfer({ toAccountId: 'a2', amount: 50 })).not.toBeNull();
  });

  it('quantizes the amount, clamps future dates to now, and passes the row guard', () => {
    const now = '2026-08-29T10:00:00';
    const t = buildTransfer({ fromAccountId: 'a1', toAccountId: 'a2', amount: -12.345, date: '2027-01-01T00:00:00', note: '  hi  ' }, now)!;
    expect(t.amount).toBe(roundMoney(12.345));
    expect(t.date).toBe(now);
    expect(t.note).toBe('hi');
    expect(isAccountTransfer(t)).toBe(true);
    // A backdated move keeps its date.
    expect(buildTransfer({ fromAccountId: 'a1', amount: 5, date: '2026-08-01T12:00:00' }, now)!.date).toBe('2026-08-01T12:00:00');
  });
});

describe('sample data stays inside its own guards', () => {
  it("the sample Visa's payment window is always live, whenever the sample is generated", () => {
    // The card-due reminder rows are the bell's longest strings; the audit and
    // demos only ever see what the sample produces, so the sample cycle must
    // sit inside the 7-day reminder window on any real "today".
    const visa = sampleAccounts().find((a) => a.id === 'a_visa')!;
    const cycle = currentCardCycle(visa.statementDay!, visa.dueDaysAfterStatement!, todayIso());
    expect(cycle.closed).toBe(true);
    const days = daysUntil(cycle.dueDate);
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('every sample account and transfer parses', () => {
    for (const a of sampleAccounts()) expect(isAccount(a)).toBe(true);
    const ids = new Set(sampleAccounts().map((a) => a.id));
    for (const t of sampleTransfers()) {
      expect(isAccountTransfer(t)).toBe(true);
      // Sample transfers must point at sample accounts, or the sample balances lie.
      if (t.fromAccountId) expect(ids.has(t.fromAccountId)).toBe(true);
      if (t.toAccountId) expect(ids.has(t.toAccountId)).toBe(true);
    }
  });
});
