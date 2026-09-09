import { describe, expect, it } from 'vitest';
import { account, accountTransfer, bill, category, creditCard, payday, purchase, state } from '../../test/fixtures';
import type { Account, AccountTransfer } from '../accounts/types';
import { selectReminders, type ReminderInputs } from './rules';

// The card-due rules: pay the card by its due date or interest starts. Pinned
// around one frozen "today" so every statement/due window is exact. The other
// rules stay quiet on the empty fixture household (no bills, no goals, noon -
// before the earnings nudge hour), so what comes back is the card rules alone.

const NOW = new Date(2026, 7, 29, 12, 0); // Sat Aug 29 2026, local noon

const REAL: ReminderInputs['samples'] = { household: false, bills: false, paydays: false, accounts: false };

const remind = (accounts: Account[], transfers: AccountTransfer[] = []) =>
  selectReminders({ state: state(), bills: [], schedules: [], settlements: [], accounts, transfers, samples: REAL }, NOW).filter((r) => r.rule.startsWith('card-'));

// A card mid-window: statement closed Aug 10, 25 days grace -> due Sep 4 (6 days away).
const midWindow = () => creditCard('cc', { name: 'Platinum Rewards Visa', openingBalance: 500, statementDay: 10, dueDaysAfterStatement: 25, minPaymentPercent: 2, minPaymentFloor: 25 });

describe('card-due reminders', () => {
  it('nudges inside the lead window with the owed amount, the minimum and the carrying cost', () => {
    const [r, ...rest] = remind([midWindow()]);
    expect(rest).toHaveLength(0);
    expect(r!.rule).toBe('card-due-soon');
    expect(r!.id).toBe('card-due-soon:cc:2026-09-04');
    expect(r!.title).toContain('Platinum Rewards Visa');
    expect(r!.title).toContain('Sep 4');
    expect(r!.body).toContain('$500 owing');
    // 2% of $500 is $10; the $25 floor wins - and the floor is dollars, not cents (the AccountSheet bug class).
    expect(r!.body).toMatch(/minimum \S*\$25\b/);
    // 19.99% p.a. on $500 ≈ $8.33/month.
    expect(r!.body).toContain('$8.33/month');
    expect(r!.action?.target).toEqual({ kind: 'route', route: { tab: 'overview', sub: { name: 'accounts' } } });
  });

  it('escalates: due tomorrow, then due today at higher priority', () => {
    const tomorrow = remind([creditCard('cc', { openingBalance: 300, statementDay: 12, dueDaysAfterStatement: 18 })]); // due Aug 30
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0]!.rule).toBe('card-due-tomorrow');
    expect(tomorrow[0]!.priority).toBe(3);

    const today = remind([creditCard('cc', { openingBalance: 300, statementDay: 12, dueDaysAfterStatement: 17 })]); // due Aug 29
    expect(today).toHaveLength(1);
    expect(today[0]!.rule).toBe('card-due-today');
    expect(today[0]!.priority).toBe(2);
    expect(today[0]!.body).toContain('interest-free');
  });

  it('stays quiet before the window opens', () => {
    // Due Sep 6 is 8 days away - one past the 7-day lead.
    expect(remind([creditCard('cc', { openingBalance: 500, statementDay: 12, dueDaysAfterStatement: 25 })])).toHaveLength(0);
    // Statement hasn't closed yet (Jul 31's window was paid Aug 16; Aug 31 close is ahead): its due date isn't a deadline.
    expect(remind([creditCard('cc', { openingBalance: 500, statementDay: 31, dueDaysAfterStatement: 20 })], [accountTransfer('x', null, 'cc', 50)])).toHaveLength(0);
  });

  it('opens at exactly 7 days out', () => {
    // Statement closed Aug 10 + 26 days grace -> due Sep 5, 7 days from NOW.
    const [r, ...rest] = remind([creditCard('cc', { openingBalance: 500, statementDay: 10, dueDaysAfterStatement: 26 })]);
    expect(rest).toHaveLength(0);
    expect(r!.rule).toBe('card-due-soon');
  });

  it('needs a balance, a statement day and a live credit card', () => {
    // Paid off (a transfer in covers the opening balance) - nothing to pay.
    expect(remind([midWindow()], [accountTransfer('x', null, 'cc', 500)])).toHaveLength(0);
    // No statement day: no date maths to remind about.
    expect(remind([creditCard('cc', { openingBalance: 500 })])).toHaveLength(0);
    // Archived cards and bank accounts never remind.
    expect(remind([{ ...midWindow(), archived: true }])).toHaveLength(0);
    expect(remind([account('a1', { openingBalance: 500 })])).toHaveLength(0);
  });

  it('the balance is ledger-derived: a partial payment shrinks what the reminder asks for', () => {
    const [r] = remind([midWindow()], [accountTransfer('x', null, 'cc', 150)]);
    expect(r!.body).toContain('$350 owing');
    // 2% of $350 is $7; the $25 floor still wins.
    expect(r!.body).toMatch(/minimum \S*\$25\b/);
  });

  it('a missed window with no payment logged escalates instead of going silent (QA7 R-5)', () => {
    // Due Aug 17 (close Aug 12 + 5) passed twelve days ago; nothing paid since the close.
    const [r, ...rest] = remind([creditCard('cc', { name: 'Visa', openingBalance: 500, statementDay: 12, dueDaysAfterStatement: 5 })]);
    expect(rest).toHaveLength(0);
    expect(r!.rule).toBe('card-payment-missed');
    expect(r!.priority).toBe(1);
    expect(r!.tone).toBe('danger');
    expect(r!.title).toBe('Visa payment date has passed');
    expect(r!.body).toContain('Aug 17');
    expect(r!.body).toContain('no payment is logged');
  });

  it('a payment logged since the close counts as handled - no missed nag, next cycle not a deadline yet', () => {
    // Same card, but $50 was paid onto it on Aug 16 (after the Aug 12 close).
    expect(remind([creditCard('cc', { openingBalance: 500, statementDay: 12, dueDaysAfterStatement: 5 })], [accountTransfer('x', null, 'cc', 50)])).toHaveLength(0);
  });
});

describe('cashflow-negative (audit MF-4, MON-5, OB-15)', () => {
  const inputs = (over: Partial<ReminderInputs>): ReminderInputs => ({ state: state(), bills: [], schedules: [], settlements: [], accounts: [], transfers: [], samples: REAL, ...over });
  const cashflow = (i: ReminderInputs, now = NOW) => selectReminders(i, now).filter((r) => r.rule === 'cashflow-negative');

  it('needs a ceiling: with every category limit at 0 there is nothing for the bills to exceed - MF-4', () => {
    const s = state({ categories: [category('misc', { limit: 0 })], transactions: [purchase('p', 312, { categoryId: 'misc', date: '2026-08-05T12:00:00' })] });
    expect(cashflow(inputs({ state: s, bills: [bill('b1', { amount: 100, nextDue: '2026-08-30' })], schedules: [payday('p1', { nextDate: '2026-09-04' })] }))).toHaveLength(0);
  });

  it('an exactly-even case is not negative; one cent more is - MON-5', () => {
    // Limit $1,000, purchases $0.18 + $159.99, bill $839.83 before payday: safe to spend is 0, not -1.1e-13.
    const s = state({ categories: [category('groceries', { limit: 1000 })], transactions: [purchase('a', 0.18, { date: '2026-08-05T12:00:00' }), purchase('b', 159.99, { date: '2026-08-06T12:00:00' })] });
    expect(cashflow(inputs({ state: s, bills: [bill('b1', { amount: 839.83, nextDue: '2026-08-31' })], schedules: [payday('p1', { nextDate: '2026-09-04' })] }))).toHaveLength(0);
    const [r] = cashflow(inputs({ state: s, bills: [bill('b1', { amount: 839.84, nextDue: '2026-08-31' })], schedules: [payday('p1', { nextDate: '2026-09-04' })] }));
    expect(r).toBeDefined();
    expect(r!.amount).toBe(0.01);
  });

  it('is keyed on the payday, so a dismissal holds while that payday stays overdue - OB-15', () => {
    const s = state({ categories: [category('groceries', { limit: 100 })] });
    const late = inputs({ state: s, bills: [bill('b1', { amount: 500, nextDue: '2026-08-28' })], schedules: [payday('p1', { nextDate: '2026-08-26' })] });
    const [today] = cashflow(late);
    const [tomorrow] = cashflow(late, new Date(2026, 7, 30, 12, 0));
    expect(today!.id).toBe('cashflow-negative:p1:2026-08-26');
    expect(tomorrow!.id).toBe(today!.id);
  });
});

describe('bill-overdue copy at the occurrence cap (audit MON-7)', () => {
  it('says 60+ when a bill is more than 60 payments behind', () => {
    const [r] = selectReminders({ state: state(), bills: [bill('b1', { name: 'Gym', amount: 25, frequency: 'weekly', nextDue: '2025-05-22' })], schedules: [], settlements: [], accounts: [], transfers: [], samples: REAL }, NOW).filter((x) => x.rule === 'bill-overdue');
    expect(r!.body).toContain('across 60+ missed payments');
    expect(r!.amount).toBe(1500);
  });
});

// The upgrade path: a device with real pre-accounts data still shows the
// SAMPLE accounts (the store falls back until its first real write), and the
// sample Visa's payment window is engineered to always be live. Rules must
// read only from stores whose rows belong to the real household (QA7 R-1).
describe('sample rows never remind a real household', () => {
  const overdueBill = () => bill('b1', { nextDue: '2026-08-27' });
  const latePay = () => payday('p1', { nextDate: '2026-08-26' });

  it('drops card rules while the accounts store is still sample', () => {
    const all = selectReminders({ state: state(), bills: [], schedules: [], settlements: [], accounts: [midWindow()], transfers: [], samples: { ...REAL, accounts: true } }, NOW);
    expect(all.filter((r) => r.rule.startsWith('card-'))).toHaveLength(0);
  });

  it('drops bill and payday rules from sample stores the same way', () => {
    const all = selectReminders({ state: state(), bills: [overdueBill()], schedules: [latePay()], settlements: [], accounts: [], transfers: [], samples: { ...REAL, bills: true, paydays: true } }, NOW);
    expect(all.filter((r) => r.rule.startsWith('bill-') || r.rule.startsWith('payday'))).toHaveLength(0);
  });

  it('a sample household still shows everything - the bell is part of the demo', () => {
    const all = selectReminders({ state: state(), bills: [overdueBill()], schedules: [], settlements: [], accounts: [midWindow()], transfers: [], samples: { household: true, bills: true, paydays: true, accounts: true } }, NOW);
    expect(all.some((r) => r.rule === 'bill-overdue')).toBe(true);
    expect(all.some((r) => r.rule === 'card-due-soon')).toBe(true);
  });

  it('real stores under a real household keep reminding', () => {
    const all = selectReminders({ state: state(), bills: [overdueBill()], schedules: [], settlements: [], accounts: [midWindow()], transfers: [], samples: REAL }, NOW);
    expect(all.some((r) => r.rule === 'bill-overdue')).toBe(true);
    expect(all.some((r) => r.rule === 'card-due-soon')).toBe(true);
  });
});
