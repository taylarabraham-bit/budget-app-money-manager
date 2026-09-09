import { fromCents, toCents } from '../../data/split';
import type { TransactionRecord } from '../../data/types';
import { dateOnly } from '../../lib/dates';
import { KIND_ICON, type Account, type AccountTransfer } from './types';

// Balances are DERIVED, in integer cents: the opening balance plus every
// transaction logged against the account and every transfer through it. For
// banks the balance is money held (signed); for credit cards it is what is
// OWED (positive) - a purchase raises it, a payment (transfer in) lowers it,
// a refund (income on the card) lowers it too.

/** Rows the screens render: the account plus its derived figures. */
export interface AccountView extends Account {
  /** Current balance in the household currency: held (banks, signed) or owed (credit, positive = owing). */
  balance: number;
  balanceCents: number;
  /** Credit only, when a limit is tracked: limit minus owed (negative = over). Null otherwise - limit 0/absent means "no limit", never "over". */
  availableCredit: number | null;
}

type Ledger = Pick<TransactionRecord, 'accountId' | 'amount'>[];

/** Current balance of every account, in cents keyed by id (credit = cents owed). */
export function selectAccountBalances(accounts: Account[], transfers: AccountTransfer[], transactions: Ledger): Map<string, number> {
  const cents = new Map<string, number>();
  const credit = new Set<string>();
  for (const a of accounts) {
    cents.set(a.id, toCents(a.openingBalance));
    if (a.kind === 'credit') credit.add(a.id);
  }
  // `moved` is signed as MONEY ENTERING the account; on a card, money in pays debt down.
  const apply = (id: string | undefined, moved: number) => {
    if (!id || !cents.has(id)) return;
    cents.set(id, cents.get(id)! + (credit.has(id) ? -moved : moved));
  };
  for (const t of transactions) if (t.accountId) apply(t.accountId, toCents(t.amount));
  for (const tr of transfers) {
    const amount = toCents(tr.amount);
    apply(tr.fromAccountId, -amount);
    apply(tr.toAccountId, amount);
  }
  return cents;
}

const KIND_ORDER: Record<Account['kind'], number> = { everyday: 0, savings: 1, credit: 2 };

/** Accounts with their derived figures, grouped by kind (banks first), archived last. */
export function toAccountViews(accounts: Account[], transfers: AccountTransfer[], transactions: Ledger): AccountView[] {
  const balances = selectAccountBalances(accounts, transfers, transactions);
  return [...accounts]
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name))
    .map((a) => {
      const balanceCents = balances.get(a.id) ?? 0;
      const limitCents = a.kind === 'credit' && a.creditLimit && a.creditLimit > 0 ? toCents(a.creditLimit) : null;
      return {
        ...a,
        balanceCents,
        balance: fromCents(balanceCents),
        availableCredit: limitCents == null ? null : fromCents(limitCents - balanceCents),
      };
    });
}

export interface AccountsSummary {
  /** Money held across live (unarchived) bank accounts. */
  inBank: number;
  /** Owed across live credit cards - real debt only, never netted against a card in credit (audit MF-9). */
  owed: number;
  /** Overpaid balances across live credit cards (positive = the issuer holds this much), reported beside `owed` rather than inside it. */
  cardCredit: number;
  /** True when there is at least one live account of that side. */
  hasBank: boolean;
  hasCards: boolean;
}

export function selectAccountsSummary(views: AccountView[]): AccountsSummary {
  let bankCents = 0;
  let owedCents = 0;
  let creditCents = 0;
  let hasBank = false;
  let hasCards = false;
  for (const v of views) {
    if (v.archived) continue;
    if (v.kind === 'credit') {
      hasCards = true;
      owedCents += Math.max(0, v.balanceCents);
      creditCents += Math.max(0, -v.balanceCents);
    } else {
      hasBank = true;
      bankCents += v.balanceCents;
    }
  }
  return { inBank: fromCents(bankCents), owed: fromCents(owedCents), cardCredit: fromCents(creditCents), hasBank, hasCards };
}

/** Accounts a picker offers (live ones), labelled "💳 Platinum Rewards Visa". */
export function accountOptions(accounts: Account[]): Array<{ value: string; label: string }> {
  return accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: `${KIND_ICON[a.kind]} ${a.name}` }));
}

export const accountById = (accounts: Account[], id: string | undefined): Account | undefined => (id ? accounts.find((a) => a.id === id) : undefined);

/** The local day of the newest payment logged INTO the account, if any - what the card cycle uses to tell "missed" from "handled". */
export function lastPaymentOn(accountId: string, transfers: AccountTransfer[]): string | undefined {
  let latest: string | undefined;
  for (const t of transfers) {
    if (t.toAccountId !== accountId) continue;
    const day = dateOnly(t.date);
    if (latest === undefined || day > latest) latest = day;
  }
  return latest;
}
