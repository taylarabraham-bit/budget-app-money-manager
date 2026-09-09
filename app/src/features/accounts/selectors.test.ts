import { describe, expect, it } from 'vitest';
import { toCents } from '../../data/split';
import type { TransactionRecord } from '../../data/types';
import { account, accountTransfer, creditCard, income, purchase } from '../../test/fixtures';
import { selectAccountBalances, selectAccountsSummary, toAccountViews } from './selectors';

// Balances are derived (opening + ledger + transfers), in integer cents.
// The sign rules are the whole point: money INTO a bank account raises its
// balance; money INTO a credit card lowers what is owed.

const bank = account('a_bank', { openingBalance: 100 });
const card = creditCard('a_card', { openingBalance: 50, creditLimit: 500 });

const balancesOf = (transactions: TransactionRecord[] = [], transfers = [] as ReturnType<typeof accountTransfer>[]) => selectAccountBalances([bank, card], transfers, transactions);

describe('selectAccountBalances', () => {
  it('bank: opening plus signed transactions plus transfers in, minus out', () => {
    const cents = balancesOf(
      [purchase('t1', 40, { accountId: 'a_bank' }), income('t2', 25, { accountId: 'a_bank' })],
      [accountTransfer('x1', 'a_bank', 'a_card', 30), accountTransfer('x2', null, 'a_bank', 10)],
    );
    // 100 - 40 + 25 - 30 + 10 = 65
    expect(cents.get('a_bank')).toBe(6_500);
  });

  it('credit: purchases raise what is owed; payments and refunds lower it', () => {
    const cents = balancesOf(
      [purchase('t1', 40, { accountId: 'a_card' }), income('t2', 10, { accountId: 'a_card' })],
      [accountTransfer('x1', 'a_bank', 'a_card', 60), accountTransfer('x2', 'a_card', null, 5)],
    );
    // owed: 50 + 40 - 10 - 60 + 5 = 25
    expect(cents.get('a_card')).toBe(2_500);
  });

  it('rows pointing at unknown accounts are ignored; a move to a deleted account still debits the source', () => {
    const cents = balancesOf([purchase('t1', 40, { accountId: 'a_gone' })], [accountTransfer('x1', 'a_bank', 'a_gone', 30)]);
    expect(cents.get('a_bank')).toBe(7_000); // 100 - 30
    expect(cents.get('a_card')).toBe(5_000); // untouched
    expect(cents.has('a_gone')).toBe(false);
  });

  it('untracked transactions (no accountId) touch nothing', () => {
    const cents = balancesOf([purchase('t1', 40), income('t2', 25)]);
    expect(cents.get('a_bank')).toBe(10_000);
    expect(cents.get('a_card')).toBe(5_000);
  });

  it('fuzz: every balance is integer cents and matches an independent tally', () => {
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const accounts = [account('a1', { openingBalance: 1234.56 }), account('a2', { kind: 'savings', openingBalance: 0.01 }), creditCard('a3', { openingBalance: 987.65 })];
    const ids = ['a1', 'a2', 'a3', undefined] as const;
    const transactions: TransactionRecord[] = [];
    const transfers: ReturnType<typeof accountTransfer>[] = [];
    for (let i = 0; i < 500; i++) {
      const amount = Math.round(rand() * 100_000) / 100; // whole cents, like every store writes
      if (rand() < 0.5) {
        transactions.push(rand() < 0.5 ? purchase(`t${i}`, amount, { accountId: ids[Math.floor(rand() * 4)] }) : income(`t${i}`, amount, { accountId: ids[Math.floor(rand() * 4)] }));
      } else {
        const from = ids[Math.floor(rand() * 4)];
        const to = ids[Math.floor(rand() * 4)];
        if (from === to || (!from && !to)) continue;
        transfers.push(accountTransfer(`x${i}`, from ?? null, to ?? null, amount));
      }
    }
    const cents = selectAccountBalances(accounts, transfers, transactions);
    const expected = new Map(accounts.map((a) => [a.id, toCents(a.openingBalance)]));
    const isCard = (id: string) => id === 'a3';
    for (const t of transactions) {
      if (!t.accountId || !expected.has(t.accountId)) continue;
      expected.set(t.accountId, expected.get(t.accountId)! + (isCard(t.accountId) ? -toCents(t.amount) : toCents(t.amount)));
    }
    for (const x of transfers) {
      if (x.fromAccountId && expected.has(x.fromAccountId)) expected.set(x.fromAccountId, expected.get(x.fromAccountId)! + (isCard(x.fromAccountId) ? toCents(x.amount) : -toCents(x.amount)));
      if (x.toAccountId && expected.has(x.toAccountId)) expected.set(x.toAccountId, expected.get(x.toAccountId)! + (isCard(x.toAccountId) ? -toCents(x.amount) : toCents(x.amount)));
    }
    for (const a of accounts) {
      expect(Number.isInteger(cents.get(a.id))).toBe(true);
      expect(cents.get(a.id)).toBe(expected.get(a.id));
    }
  });
});

describe('toAccountViews / selectAccountsSummary', () => {
  it('derives available credit only when a limit is tracked (limit 0 = no cap, never "over")', () => {
    const views = toAccountViews([bank, card, creditCard('a_nolimit', { openingBalance: 200 })], [], []);
    const cardView = views.find((v) => v.id === 'a_card')!;
    expect(cardView.availableCredit).toBe(450); // 500 limit - 50 owed
    expect(views.find((v) => v.id === 'a_nolimit')!.availableCredit).toBeNull();
    expect(views.find((v) => v.id === 'a_bank')!.availableCredit).toBeNull();
  });

  it('over-limit shows as negative available, not a lie', () => {
    const views = toAccountViews([creditCard('c', { openingBalance: 600, creditLimit: 500 })], [], []);
    expect(views[0]!.availableCredit).toBe(-100);
  });

  it('never nets a card in credit against real debt - the credit is reported beside it (audit MF-9)', () => {
    // Visa owes $100; another card was overpaid by $30 (a $30 payment in on a zero balance).
    const views = toAccountViews([creditCard('visa', { openingBalance: 100 }), creditCard('amex', { openingBalance: 0 })], [accountTransfer('x1', null, 'amex', 30)], []);
    const summary = selectAccountsSummary(views);
    expect(summary.owed).toBe(100);
    expect(summary.cardCredit).toBe(30);
    expect(summary.hasCards).toBe(true);
    // Owes $100 / in credit $100 is not "all paid off".
    const even = selectAccountsSummary(toAccountViews([creditCard('visa', { openingBalance: 100 }), creditCard('amex', { openingBalance: 0 })], [accountTransfer('x1', null, 'amex', 100)], []));
    expect(even.owed).toBe(100);
    expect(even.cardCredit).toBe(100);
  });

  it('a single card in credit owes nothing and never reads as a negative debt', () => {
    const summary = selectAccountsSummary(toAccountViews([creditCard('amex', { openingBalance: 0 })], [accountTransfer('x1', null, 'amex', 3.86)], []));
    expect(summary.owed).toBe(0);
    expect(summary.cardCredit).toBe(3.86);
  });

  it('orders banks before cards, archived last, and sums only live accounts', () => {
    const archived = account('a_old', { openingBalance: 999, archived: true });
    const views = toAccountViews([card, archived, bank], [], []);
    expect(views.map((v) => v.id)).toEqual(['a_bank', 'a_card', 'a_old']);
    const summary = selectAccountsSummary(views);
    expect(summary.inBank).toBe(100);
    expect(summary.owed).toBe(50);
    expect(summary.hasBank).toBe(true);
    expect(summary.hasCards).toBe(true);
  });
});
