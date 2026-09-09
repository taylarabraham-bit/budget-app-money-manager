import { describe, expect, it } from 'vitest';
import { balanceSentence, pairAwaiting, pairNet, selectBalances, selectLedger } from './selectors';
import { isSettlement } from './store';
import { toCents } from '../../data/split';
import { ALEX, PRIYA, SAM, member, purchase, settlement, state } from '../../test/fixtures';

// The settle-up ledger decides who owes whom real money, so its invariant is
// worth pinning hard: for any two people the balance is exactly antisymmetric
// (what A is owed is what B owes), and a payment of the outstanding amount
// leaves them square to the cent.
//
// Excluded rows are the subtlety: a purchase awaiting confirmation or in
// dispute stays visible in the ledger but must not move the balance (QA M1).

const twoOf = (over: Parameters<typeof state>[0] = {}) => state(over);

describe('pairNet', () => {
  it('is zero for a household with nothing shared', () => {
    expect(pairNet(twoOf(), [], PRIYA, SAM)).toBe(0);
  });

  it('ignores a personal purchase', () => {
    expect(pairNet(twoOf({ transactions: [purchase('t1', 50, { memberId: PRIYA })] }), [], PRIYA, SAM)).toBe(0);
  });

  it('counts the other member owing their share of what I paid', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA })] });
    expect(pairNet(s, [], PRIYA, SAM)).toBe(25);
  });

  it('is antisymmetric between the two sides', () => {
    const s = twoOf({ transactions: [purchase('t1', 81.37, { shared: true, memberId: PRIYA }), purchase('t2', 19.99, { shared: true, memberId: SAM })] });
    expect(toCents(pairNet(s, [], PRIYA, SAM))).toBe(-toCents(pairNet(s, [], SAM, PRIYA)));
  });

  it('is settled exactly by a payment of the outstanding amount', () => {
    const s = twoOf({ transactions: [purchase('t1', 81.37, { shared: true, memberId: PRIYA })] });
    const owed = pairNet(s, [], PRIYA, SAM);
    expect(pairNet(s, [settlement('s1', SAM, PRIYA, owed)], PRIYA, SAM)).toBe(0);
  });

  it('leaves a pending purchase out of the balance but records it as awaiting', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, pending: true })] });
    expect(pairNet(s, [], PRIYA, SAM)).toBe(0);
    expect(pairAwaiting(s, PRIYA, SAM)).toBe(25);
  });

  it('leaves a disputed purchase out of the balance', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, disputed: { byMemberId: SAM, at: '2026-08-16T09:00:00' } })] });
    expect(pairNet(s, [], PRIYA, SAM)).toBe(0);
    expect(pairAwaiting(s, PRIYA, SAM)).toBe(25);
  });

  it('ignores a purchase a third member paid - pairs only, never netted across three', () => {
    const s = state({ members: [member(PRIYA), member(SAM), member(ALEX)], transactions: [purchase('t1', 90, { shared: true, memberId: ALEX })] });
    expect(pairNet(s, [], PRIYA, SAM)).toBe(0);
    expect(pairNet(s, [], ALEX, PRIYA)).toBe(30);
  });

  it('counts a payment in each direction with the right sign', () => {
    const s = twoOf();
    expect(pairNet(s, [settlement('s1', PRIYA, SAM, 40)], PRIYA, SAM)).toBe(40);
    expect(pairNet(s, [settlement('s1', SAM, PRIYA, 40)], PRIYA, SAM)).toBe(-40);
  });

  it('ignores a payment between two other people', () => {
    const s = state({ members: [member(PRIYA), member(SAM), member(ALEX)] });
    expect(pairNet(s, [settlement('s1', SAM, ALEX, 40)], PRIYA, SAM)).toBe(0);
  });

  it('stays exact over many awkward shared purchases', () => {
    const transactions = Array.from({ length: 200 }, (_, i) => purchase(`t${i}`, 0.01 + i * 1.37, { shared: true, memberId: i % 2 ? SAM : PRIYA }));
    const s = twoOf({ transactions });
    const forward = toCents(pairNet(s, [], PRIYA, SAM));
    const back = toCents(pairNet(s, [], SAM, PRIYA));
    expect(forward + back).toBe(0);
  });
});

describe('selectLedger', () => {
  it('lists purchases and payments newest first with running balances', () => {
    const s = twoOf({
      transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, date: '2026-08-10T12:00:00' }), purchase('t2', 30, { shared: true, memberId: SAM, date: '2026-08-12T12:00:00' })],
    });
    const entries = selectLedger(s, [settlement('s1', SAM, PRIYA, 10, { date: '2026-08-14T12:00:00' })], PRIYA, SAM);
    expect(entries.map((e) => e.id)).toEqual(['s1', 't2', 't1']);
    // Oldest first the running balance is +25, then +25-15 = +10, then +10-10 = 0.
    expect(entries.map((e) => e.balanceAfter)).toEqual([0, 10, 25]);
  });

  it('does not move the running balance for an excluded entry, but still shows it', () => {
    const s = twoOf({
      transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, date: '2026-08-10T12:00:00' }), purchase('t2', 80, { shared: true, memberId: PRIYA, pending: true, date: '2026-08-11T12:00:00' })],
    });
    const entries = selectLedger(s, [], PRIYA, SAM);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.excluded).toBe('pending');
    expect(entries[0]!.balanceAfter).toBe(25);
  });

  it('sorts a payment after a purchase sharing its timestamp', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, date: '2026-08-10T12:00:00' })] });
    const entries = selectLedger(s, [settlement('s1', SAM, PRIYA, 25, { date: '2026-08-10T12:00:00' })], PRIYA, SAM);
    expect(entries.map((e) => e.id)).toEqual(['s1', 't1']);
    expect(entries[0]!.balanceAfter).toBe(0);
  });

  it('names a payment from both sides', () => {
    const entries = selectLedger(twoOf(), [settlement('s1', SAM, PRIYA, 25)], PRIYA, SAM);
    expect(entries[0]!.title).toBe('Sam paid Priya');
  });

  it('records the direction of a purchase: payer to the other member', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: SAM })] });
    const entry = selectLedger(s, [], PRIYA, SAM)[0]!;
    expect(entry).toMatchObject({ fromId: SAM, toId: PRIYA, total: 50, effect: -25 });
  });
});

describe('selectBalances', () => {
  const now = new Date(2026, 7, 20, 12, 0);

  it('reads square for a household that has shared nothing', () => {
    const b = selectBalances(twoOf(), [], now);
    expect(b.mine.status).toBe('square');
    expect(b.hasAny).toBe(false);
    expect(b.pairs).toEqual([]);
  });

  it('says I am owed when I paid for shared things', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, date: '2026-08-15T12:00:00' })] });
    const b = selectBalances(s, [], now);
    expect(b.mine.status).toBe('owed');
    expect(b.mine.amount).toBe(25);
    expect(b.mine.with?.id).toBe(SAM);
  });

  it('says I owe when my partner paid', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: SAM, date: '2026-08-15T12:00:00' })] });
    expect(selectBalances(s, [], now).mine).toMatchObject({ status: 'owes', amount: 25 });
  });

  it('lists a non-square pair from payer to payee', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, date: '2026-08-15T12:00:00' })] });
    const [pair] = selectBalances(s, [], now).pairs;
    expect(pair).toMatchObject({ amount: 25 });
    expect(pair!.from.id).toBe(SAM);
    expect(pair!.to.id).toBe(PRIYA);
  });

  it('counts this month`s shared spend and excludes other months - QA MF-5', () => {
    const s = twoOf({
      transactions: [
        purchase('t1', 50, { shared: true, date: '2026-08-15T12:00:00' }),
        purchase('t2', 40, { shared: true, date: '2026-07-31T12:00:00' }),
        purchase('t3', 60, { shared: true, date: '2026-09-01T12:00:00' }),
      ],
    });
    const b = selectBalances(s, [], now);
    expect(b.sharedThisMonth).toBe(50);
    expect(b.sharedCountThisMonth).toBe(1);
  });

  it('leaves pending and disputed purchases out of this month`s shared spend', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, pending: true, date: '2026-08-15T12:00:00' })] });
    expect(selectBalances(s, [], now).sharedThisMonth).toBe(0);
  });

  it('surfaces the awaiting total separately from the balance', () => {
    const s = twoOf({ transactions: [purchase('t1', 50, { shared: true, memberId: PRIYA, pending: true, date: '2026-08-15T12:00:00' })] });
    const b = selectBalances(s, [], now);
    expect(b.mine.status).toBe('square');
    expect(b.mine.awaiting).toBe(25);
  });

  it('reports the most recent payment', () => {
    const b = selectBalances(twoOf(), [settlement('s1', SAM, PRIYA, 10, { date: '2026-08-10T12:00:00' }), settlement('s2', SAM, PRIYA, 20, { date: '2026-08-18T12:00:00' })], now);
    expect(b.lastSettlement?.id).toBe('s2');
  });

  it('picks the biggest counterpart in a three-person household', () => {
    const s = state({
      members: [member(PRIYA), member(SAM), member(ALEX)],
      transactions: [purchase('t1', 300, { shared: true, memberId: PRIYA, date: '2026-08-15T12:00:00' })],
    });
    const b = selectBalances(s, [], now);
    expect(b.mine.status).toBe('owed');
    expect(b.mine.amount).toBe(200);
    expect(b.mine.breakdown).toHaveLength(2);
  });
});

describe('balanceSentence', () => {
  it('reads from the viewer`s side', () => {
    expect(balanceSentence(10, 'Sam')).toBe('Sam owes you');
    expect(balanceSentence(-10, 'Sam')).toBe('You owe Sam');
    expect(balanceSentence(0, 'Sam')).toBe('All square');
  });
});

describe('isSettlement requires at least one whole cent', () => {
  it('rejects a sub-cent ghost row and keeps a real one', () => {
    expect(isSettlement(settlement('s1', PRIYA, SAM, 0.004))).toBe(false);
    expect(isSettlement(settlement('s1', PRIYA, SAM, 0.01))).toBe(true);
  });
});
