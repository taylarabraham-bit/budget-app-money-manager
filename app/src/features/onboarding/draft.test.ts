import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_AMOUNT, roundMoney } from '../../data/split';
import { daysFromNow, todayIso } from '../../lib/dates';
import { PRIYA, SAM, account, accountTransfer, bill, creditCard, member, payday, purchase, state } from '../../test/fixtures';
import { isAccount } from '../accounts/store';
import { isBill } from '../bills/store';
import { isIncomeSchedule } from '../paydays/store';
import { accountDraftValid } from './AccountsStep';
import { goalValid } from './FinishSteps';
import { billValid, paydayValid } from './MoneySteps';
import { DRAFT_TTL_MS, buildAccounts, buildAccountsWithOrigins, buildFinish, categoryLimitValid, draftFromExisting, emptyDraft, newAccountDraft, newBill, parseSavedWizard, personLimitValid, skipPatch, type FinishContext } from './draft';

// The wizard's accounts slice: what Finish builds from the drafts, and what a
// re-run prefills from the live stores. The builder goes through the same
// write boundary the Accounts screen uses, so its rules are pinned there;
// here we pin the wizard-specific behaviour on top.

const REAL = { household: true, bills: true, paydays: true, accounts: true };
const AT = '2026-09-04T12:00:00.000Z';
const FINISH: FinishContext = { createdAt: AT, keptArchived: [], pausedBills: [], pausedSchedules: [] };

describe('buildAccounts', () => {
  it('builds rows the account guard accepts, parsing the credit terms from their fields', () => {
    const card = { ...newAccountDraft('credit', 'Platinum Rewards Visa'), balance: 862.45, apr: '20.99', creditLimit: 6000, statementDay: '12', dueDays: '25', minPercent: '2', minFloor: 25 };
    const bank = { ...newAccountDraft('everyday', 'Joint Everyday Account'), balance: 2361.4 };
    const [builtBank, builtCard] = buildAccounts([bank, card], '2026-08-29T12:00:00.000Z');
    expect(isAccount(builtBank)).toBe(true);
    expect(isAccount(builtCard)).toBe(true);
    expect(builtBank).toMatchObject({ kind: 'everyday', name: 'Joint Everyday Account', openingBalance: 2361.4 });
    expect(builtBank!.apr).toBeUndefined();
    expect(builtCard).toMatchObject({ kind: 'credit', openingBalance: 862.45, apr: 20.99, creditLimit: 6000, statementDay: 12, dueDaysAfterStatement: 25, minPaymentPercent: 2, minPaymentFloor: 25 });
  });

  it('drops nameless rows and leaves empty credit terms unset', () => {
    const abandoned = newAccountDraft('credit');
    const bare = { ...newAccountDraft('credit', 'Store card'), balance: 12.345 };
    const built = buildAccounts([abandoned, bare], '2026-08-29T12:00:00.000Z');
    expect(built).toHaveLength(1);
    expect(built[0]!.openingBalance).toBe(roundMoney(12.345));
    expect(built[0]!.apr).toBeUndefined();
    expect(built[0]!.statementDay).toBeUndefined();
    // The prefilled default grace period only means something with a statement day; it still stores fine.
    expect(built[0]!.dueDaysAfterStatement).toBe(25);
  });

  it('a card owing stays positive even if a negative sneaks in', () => {
    const built = buildAccounts([{ ...newAccountDraft('credit', 'Visa'), balance: -50 }], '2026-08-29T12:00:00.000Z');
    expect(built[0]!.openingBalance).toBe(50);
  });
});

describe('draftFromExisting prefills accounts with DERIVED balances', () => {
  it("today's balance becomes the drafted opening - the ledger is wiped on Finish", () => {
    const accounts = [account('a_bank', { name: 'Joint Everyday Account', openingBalance: 100 }), creditCard('a_card', { name: 'Visa', openingBalance: 50, statementDay: 12 })];
    const transfers = [accountTransfer('x1', 'a_bank', 'a_card', 30)];
    const s = state({ transactions: [purchase('t1', 40, { accountId: 'a_bank' })] });
    const draft = draftFromExisting(s, [], [], accounts, transfers, REAL);
    const bank = draft.accounts.find((a) => a.name === 'Joint Everyday Account')!;
    const card = draft.accounts.find((a) => a.name === 'Visa')!;
    // bank: 100 - 40 - 30 = 30 · card owed: 50 - 30 = 20
    expect(bank.balance).toBe(30);
    expect(card.balance).toBe(20);
    expect(card.apr).toBe('19.99');
    expect(card.statementDay).toBe('12');
    expect(card.dueDays).toBe('25'); // absent on the row, defaulted for credit
  });

  it('skips archived accounts, and skips the store entirely when it is still sample', () => {
    const accounts = [account('a1', { name: 'Old account', archived: true }), account('a2', { name: 'Live account' })];
    const withReal = draftFromExisting(state(), [], [], accounts, [], REAL);
    expect(withReal.accounts.map((a) => a.name)).toEqual(['Live account']);
    const sampleOnly = draftFromExisting(state(), [], [], accounts, [], { ...REAL, accounts: false });
    expect(sampleOnly.accounts).toEqual([]);
  });

  it('an overpaid card prefills as nothing owing, never as debt (QA7 A-3)', () => {
    // Owed 50, then a $70 payment logged: derived balance is -20 - the bank owes YOU.
    // The old prefill fed -20 into "Owing on it today" and Finish's abs() made it $20 owed.
    const accounts = [creditCard('a_card', { name: 'Visa', openingBalance: 50 })];
    const transfers = [accountTransfer('x1', null, 'a_card', 70)];
    const draft = draftFromExisting(state(), [], [], accounts, transfers, REAL);
    expect(draft.accounts[0]!.balance).toBeNull();
  });

  it('owner, note and origin id ride the prefill and land on the rebuilt row (QA7 A-7/O-3)', () => {
    const accounts = [account('a_bank', { name: 'Sams account', memberId: PRIYA, note: 'the good one' })];
    const draft = draftFromExisting(state(), [], [], accounts, [], REAL);
    expect(draft.accounts[0]).toMatchObject({ originId: 'a_bank', memberId: PRIYA, note: 'the good one' });
    const { accounts: built, idByOrigin } = buildAccountsWithOrigins(draft.accounts, '2026-08-29T12:00:00.000Z');
    expect(built[0]).toMatchObject({ memberId: PRIYA, note: 'the good one' });
    expect(idByOrigin.get('a_bank')).toBe(built[0]!.id);
    expect(built[0]!.id).not.toBe('a_bank');
  });

  it('bills and paydays prefill their account link so Finish can follow it (QA7 O-2)', () => {
    const accounts = [account('a_bank', { name: 'Everyday' }), account('a_save', { name: 'Saver', kind: 'savings' })];
    const bills = [bill('b1', { accountId: 'a_save' })];
    const schedules = [payday('p1', { memberId: PRIYA, accountId: 'a_save' })];
    const draft = draftFromExisting(state(), bills, schedules, accounts, [], REAL);
    expect(draft.bills[0]!.accountId).toBe('a_save');
    expect(draft.paydays.find((p) => p.memberId === PRIYA)!.accountId).toBe('a_save');
  });
});

describe('a re-run keeps every bill and payday anchor (audit MON-1/MF-2)', () => {
  afterEach(() => vi.useRealTimers());

  it('an overdue bill starts from today but stays anchored on its original day', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 4, 12) }); // Sep 4: rent due on the 1st is three days overdue
    const draft = draftFromExisting(state(), [bill('rent', { nextDue: '2026-09-01', anchorDay: 1 }), bill('legacy', { nextDue: '2026-08-31' })], [], [], [], REAL);
    expect(draft.bills[0]).toMatchObject({ originId: 'rent', nextDue: '2026-09-04', originDue: '2026-09-04', anchorDay: 1 });
    // A row from before anchorDay existed derives it from the ORIGINAL date, not the clamped one.
    expect(draft.bills[1]).toMatchObject({ nextDue: '2026-09-04', anchorDay: 31 });
    const rows = buildFinish(draft, FINISH);
    expect(rows.bills.map((b) => [b.nextDue, b.anchorDay])).toEqual([
      ['2026-09-04', 1],
      ['2026-09-04', 31],
    ]);
  });

  it('a month-end schedule on a clamped date keeps 31; a re-picked date re-anchors like the forms', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 4, 12) });
    const draft = draftFromExisting(state(), [bill('gym', { nextDue: '2026-09-30', anchorDay: 31 })], [payday('pay', { memberId: PRIYA, nextDate: '2026-09-30', anchorDay: 31 })], [], [], REAL);
    const untouched = buildFinish(draft, FINISH);
    expect(untouched.bills[0]).toMatchObject({ nextDue: '2026-09-30', anchorDay: 31 });
    expect(untouched.schedules[0]).toMatchObject({ nextDate: '2026-09-30', anchorDay: 31 });
    const repicked = buildFinish({ ...draft, bills: [{ ...draft.bills[0]!, nextDue: '2026-10-05' }], paydays: draft.paydays.map((p) => (p.memberId === PRIYA ? { ...p, nextDate: '2026-10-15' } : p)) }, FINISH);
    expect(repicked.bills[0]!.anchorDay).toBe(5);
    expect(repicked.schedules[0]!.anchorDay).toBe(15);
    // A bill added in the wizard has no origin: the picked date is its anchor, as before.
    const added = buildFinish({ ...draft, bills: [{ ...newBill({ name: 'Water' }, PRIYA, draft.categories), amount: 40, nextDue: '2026-10-28' }] }, FINISH);
    expect(added.bills[0]!.anchorDay).toBe(28);
  });
});

describe('a re-run carries paused rows through unchanged (audit LV-2)', () => {
  const bills = [bill('b_active'), bill('b_paused', { paused: true, accountId: 'a_old', lastPaid: '2026-08-01', anchorDay: 20, note: 'on hold' })];
  const schedules = [payday('p_active', { memberId: PRIYA }), payday('p_paused', { memberId: SAM, paused: true, accountId: 'a_old' })];
  const accounts = [account('a_old', { name: 'Everyday' })];
  const ctx = (): FinishContext => ({ ...FINISH, pausedBills: bills.filter((b) => b.paused), pausedSchedules: schedules.filter((s) => s.paused) });

  it('paused rows are not shown, yet land in the rebuilt stores with their ids, history and repaired links', () => {
    const draft = draftFromExisting(state(), bills, schedules, accounts, [], REAL);
    expect(draft.bills.map((b) => b.originId)).toEqual(['b_active']);
    expect(draft.paydays.map((p) => p.originId)).toEqual(['p_active', undefined]);
    const rows = buildFinish(draft, ctx());
    expect(rows.bills).toHaveLength(2);
    expect(rows.bills.every(isBill)).toBe(true);
    const paused = rows.bills.find((b) => b.id === 'b_paused')!;
    expect(paused).toMatchObject({ paused: true, lastPaid: '2026-08-01', anchorDay: 20, note: 'on hold', createdAt: bills[1]!.createdAt });
    expect(paused.accountId).toBe(rows.accounts[0]!.id); // followed the rebuilt account, whose id is new
    expect(rows.accounts[0]!.id).not.toBe('a_old');
    const pausedPay = rows.schedules.find((s) => s.id === 'p_paused')!;
    expect(rows.schedules.every(isIncomeSchedule)).toBe(true);
    expect(pausedPay).toMatchObject({ paused: true, memberId: SAM, accountId: rows.accounts[0]!.id });
  });

  it('a row the draft did prefill is rebuilt from the draft, not doubled; a removed member takes their paused pay with them', () => {
    const draft = draftFromExisting(state(), bills, schedules, accounts, [], REAL);
    // Paused since the draft was saved: b_active is now in both the draft and the paused list.
    const doubled = buildFinish(draft, { ...ctx(), pausedBills: bills.map((b) => ({ ...b, paused: true })) });
    expect(doubled.bills.filter((b) => b.name === 'b_active')).toHaveLength(1);
    const withoutSam = buildFinish({ ...draft, people: draft.people.filter((p) => p.id !== SAM), paydays: draft.paydays.filter((p) => p.memberId !== SAM) }, ctx());
    expect(withoutSam.schedules.map((s) => s.id)).not.toContain('p_paused');
  });
});

describe('"Skip for now" only discards rows added in this run (audit OB-5)', () => {
  it('keeps the prefilled live bills and accounts, so Finish cannot delete them', () => {
    const draft = draftFromExisting(state(), [bill('rent')], [], [account('a_bank', { name: 'Everyday' })], [], REAL);
    const added = { ...draft, bills: [...draft.bills, newBill({ name: 'Netflix' }, PRIYA, draft.categories)], accounts: [...draft.accounts, newAccountDraft('savings', 'Saver')] };
    expect(skipPatch(added, 'bills').bills!.map((b) => b.originId)).toEqual(['rent']);
    expect(skipPatch(added, 'accounts').accounts!.map((a) => a.originId)).toEqual(['a_bank']);
    expect(skipPatch(added, 'goal')).toEqual({ goalEnabled: false });
  });

  it('a first run has nothing prefilled: skip clears the step as before', () => {
    const draft = emptyDraft('AUD');
    const added = { ...draft, bills: [newBill({ name: 'Rent' }, draft.youId, draft.categories)], accounts: [newAccountDraft('everyday', 'Joint')] };
    expect(skipPatch(added, 'bills').bills).toEqual([]);
    expect(skipPatch(added, 'accounts').accounts).toEqual([]);
  });
});

describe('the device stays the person who ran the wizard (audit OB-4)', () => {
  it('a re-run from the partner phone keeps that phone as the partner, not members[0]', () => {
    const draft = draftFromExisting(state({ currentMemberId: SAM }), [], [], [], [], REAL);
    expect(draft.youId).toBe(SAM);
    expect(draft.people.map((p) => p.id)).toEqual([PRIYA, SAM]); // the household order is untouched
    expect(buildFinish(draft, FINISH).currentMemberId).toBe(SAM);
    // "You" removed from the draft (a resumed draft edited elsewhere): fall back to the first person.
    expect(buildFinish({ ...draft, people: draft.people.filter((p) => p.id !== SAM), paydays: [] }, FINISH).currentMemberId).toBe(PRIYA);
  });

  it('a first run makes the first person "You"', () => {
    const draft = emptyDraft('AUD');
    expect(draft.youId).toBe(draft.people[0]!.id);
    expect(buildFinish({ ...draft, name: 'Us' }, FINISH).currentMemberId).toBe(draft.people[0]!.id);
  });
});

describe('a member with no personal cap keeps it through a re-run (audit OB-13)', () => {
  it('prefills as no cap, passes the People step empty or 0, and lands as 0', () => {
    const draft = draftFromExisting(state({ members: [member(PRIYA), member(SAM, { monthlyLimit: 0 })] }), [], [], [], [], REAL);
    const [priya, sam] = draft.people;
    expect(priya).toMatchObject({ limit: 2000, noCap: undefined });
    expect(sam).toMatchObject({ limit: null, noCap: true });
    expect(personLimitValid(sam!)).toBe(true);
    expect(personLimitValid({ ...sam!, limit: 0 })).toBe(true);
    expect(personLimitValid({ ...sam!, limit: 150 })).toBe(true);
    expect(personLimitValid({ ...priya!, limit: null })).toBe(false); // a capped member still needs one
    expect(personLimitValid({ ...priya!, limit: 0 })).toBe(false);
    expect(personLimitValid({ ...priya!, limit: MAX_AMOUNT + 1 })).toBe(false);
    expect(buildFinish(draft, FINISH).members.map((m) => m.monthlyLimit)).toEqual([2000, 0]);
  });
});

describe('a saved wizard expires (audit OB-14)', () => {
  const now = Date.parse('2026-09-04T12:00:00.000Z');
  const saved = (savedAt: unknown, extra: Record<string, unknown> = {}) => ({ version: 1, mode: 'fresh', index: 3, draft: emptyDraft('AUD'), savedAt, ...extra });

  it('resumes a recent draft and drops one older than the TTL or without a stamp', () => {
    expect(parseSavedWizard(saved(new Date(now - 86_400_000).toISOString()), now)).toMatchObject({ mode: 'fresh', index: 3 });
    expect(parseSavedWizard(saved(new Date(now - DRAFT_TTL_MS - 1).toISOString()), now)).toBeNull();
    expect(parseSavedWizard(saved(undefined), now)).toBeNull(); // saved by a build before the stamp
    expect(parseSavedWizard(saved('not a date'), now)).toBeNull();
    expect(parseSavedWizard(saved(new Date(now).toISOString(), { mode: 'join' }), now)).toBeNull();
    expect(parseSavedWizard(null, now)).toBeNull();
  });

  it('a draft saved before youId existed makes the first person "You"', () => {
    const { youId: _dropped, ...legacy } = emptyDraft('AUD');
    const resumed = parseSavedWizard({ version: 1, mode: 'first-run', index: 2, draft: legacy, savedAt: new Date(now).toISOString() }, now);
    expect(resumed?.draft.youId).toBe(legacy.people[0]!.id);
  });
});

describe('Finish is a write boundary (audit MON-3, DS-4)', () => {
  it('rounds every drafted amount to cents, floors the goal target at 1 and turns an empty category limit into 0', () => {
    const base = emptyDraft('AUD');
    const [you, partner] = base.people;
    const draft = {
      ...base,
      name: 'Us',
      trackDaily: true,
      dailyTarget: 80.006,
      people: [
        { ...you!, name: 'Priya', limit: 1000.006 },
        { ...partner!, name: 'Sam', limit: 12.345 },
      ],
      paydays: base.paydays.map((p) => ({ ...p, amount: 2000.004 })),
      bills: [{ ...newBill({ name: 'Rent' }, you!.id, base.categories), amount: 1.006 }],
      categories: base.categories.map((c, i) => (c.kind !== 'expense' ? c : i === 0 ? { ...c, limit: null } : { ...c, limit: 400.005 })),
      goalEnabled: true,
      goal: { ...base.goal, name: 'Trip', target: 0.001 },
    };
    const rows = buildFinish(draft, FINISH);
    expect(rows.members.map((m) => m.monthlyLimit)).toEqual([roundMoney(1000.006), roundMoney(12.345)]);
    expect(rows.members[1]!.monthlyLimit).not.toBe(12.345);
    expect(rows.household.dailyEarningTarget).toBe(roundMoney(80.006));
    expect(rows.schedules.map((s) => s.amount)).toEqual([roundMoney(2000.004), roundMoney(2000.004)]);
    expect(rows.bills[0]!.amount).toBe(roundMoney(1.006));
    expect(rows.categories[0]!.limit).toBe(0);
    expect(rows.categories.filter((c) => c.kind === 'expense').slice(1).every((c) => c.limit === roundMoney(400.005))).toBe(true);
    expect(rows.goal!.target).toBe(1);
    expect(rows.bills.every(isBill) && rows.schedules.every(isIncomeSchedule)).toBe(true);
  });
});

describe('every wizard amount shares the app cap (audit UX-6/MON-8) and the goal deadline is checked (audit MON-12)', () => {
  it('bills, paydays, goals, accounts and category limits refuse amounts over MAX_AMOUNT', () => {
    const draft = emptyDraft('AUD');
    const b = { ...newBill({ name: 'Rent' }, draft.youId, draft.categories), amount: MAX_AMOUNT };
    expect(billValid(b)).toBe(true);
    expect(billValid({ ...b, amount: MAX_AMOUNT + 1 })).toBe(false);
    const p = { ...draft.paydays[0]!, amount: MAX_AMOUNT };
    expect(paydayValid(p)).toBe(true);
    expect(paydayValid({ ...p, amount: MAX_AMOUNT + 0.01 })).toBe(false);
    const g = { ...draft, goalEnabled: true, goal: { ...draft.goal, name: 'Trip', target: MAX_AMOUNT } };
    expect(goalValid(g)).toBe(true);
    expect(goalValid({ ...g, goal: { ...g.goal, target: MAX_AMOUNT + 1 } })).toBe(false);
    const bank = newAccountDraft('everyday', 'Joint');
    expect(accountDraftValid({ ...bank, balance: -100 })).toBe(true); // overdrawn is a real balance
    expect(accountDraftValid({ ...bank, balance: -(MAX_AMOUNT + 1) })).toBe(false);
    const card = newAccountDraft('credit', 'Visa');
    expect(accountDraftValid({ ...card, creditLimit: MAX_AMOUNT, minFloor: 0 })).toBe(true);
    expect(accountDraftValid({ ...card, creditLimit: MAX_AMOUNT + 1 })).toBe(false);
    expect(accountDraftValid({ ...card, minFloor: -1 })).toBe(false);
    expect(categoryLimitValid(null)).toBe(true); // an emptied field, 0 on Finish
    expect(categoryLimitValid(0)).toBe(true);
    expect(categoryLimitValid(-1)).toBe(false);
    expect(categoryLimitValid(MAX_AMOUNT + 1)).toBe(false);
  });

  it('a goal deadline is optional but never in the past', () => {
    const draft = emptyDraft('AUD');
    const g = (deadline: string) => ({ ...draft, goalEnabled: true, goal: { ...draft.goal, name: 'Trip', target: 500, deadline } });
    expect(goalValid(g(''))).toBe(true);
    expect(goalValid(g(todayIso()))).toBe(true);
    expect(goalValid(g(daysFromNow(90)))).toBe(true);
    expect(goalValid(g(daysFromNow(-1)))).toBe(false);
    expect(goalValid(g('2026-13-01'))).toBe(false);
  });
});

describe('accountDraftValid', () => {
  it('needs a name; credit terms only need to be in range when given', () => {
    expect(accountDraftValid(newAccountDraft('everyday'))).toBe(false);
    expect(accountDraftValid(newAccountDraft('everyday', 'Joint'))).toBe(true);
    expect(accountDraftValid(newAccountDraft('credit', 'Visa'))).toBe(true); // all terms blank is fine
    expect(accountDraftValid({ ...newAccountDraft('credit', 'Visa'), apr: '20.99', statementDay: '31', dueDays: '0', minPercent: '100' })).toBe(true);
    expect(accountDraftValid({ ...newAccountDraft('credit', 'Visa'), apr: '101' })).toBe(false);
    expect(accountDraftValid({ ...newAccountDraft('credit', 'Visa'), statementDay: '0' })).toBe(false);
    expect(accountDraftValid({ ...newAccountDraft('credit', 'Visa'), statementDay: '12.5' })).toBe(false);
    expect(accountDraftValid({ ...newAccountDraft('credit', 'Visa'), dueDays: '91' })).toBe(false);
    // The same out-of-range text on a BANK row doesn't block - the terms are scrubbed on Finish anyway.
    expect(accountDraftValid({ ...newAccountDraft('everyday', 'Joint'), apr: '101' })).toBe(true);
  });
});
