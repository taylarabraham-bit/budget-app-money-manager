// Bank accounts & credit cards: where the household's money actually sits.
// Purchases, income, bills and paydays can point at an account, so balances
// are derived from the same ledger everything else uses; transfers cover the
// moves that are not spending (paying the card, topping up savings). Shapes
// mirror planned Supabase `accounts` / `account_transfers` tables so the
// local store can be swapped for real queries without touching the screens.

/**
 * `everyday` is the spending account (checking/transaction account),
 * `savings` earns interest, `credit` is a card that OWES money: its balance
 * is what is owed (positive), and its extra fields describe the interest
 * terms used to estimate the cost of not paying in full.
 */
export type AccountKind = 'everyday' | 'savings' | 'credit';

export const ACCOUNT_KINDS: readonly AccountKind[] = ['everyday', 'savings', 'credit'];

export const KIND_LABEL: Record<AccountKind, string> = {
  everyday: 'Everyday',
  savings: 'Savings',
  credit: 'Credit card',
};

export const KIND_ICON: Record<AccountKind, string> = {
  everyday: '🏦',
  savings: '💰',
  credit: '💳',
};

export interface Account {
  id: string;
  /** "Joint Everyday Account", "Platinum Rewards Visa". */
  name: string;
  kind: AccountKind;
  /** Whose account it is; absent = joint (the household's). */
  memberId?: string;
  /**
   * Balance when tracking started: what was in the account (banks, signed -
   * an overdrawn account is negative) or what was owed on it (credit, kept
   * positive). Everything logged since is derived from the ledger on top.
   */
  openingBalance: number;
  note?: string;
  /** Hidden from pickers and totals, kept for the history it appears in. */
  archived?: boolean;
  /** ISO datetime it was created. */
  createdAt: string;

  // ---- credit terms (kind === 'credit' only) ----

  /** Purchase interest rate as a yearly percentage ("20.99" for 20.99% p.a.). */
  apr?: number;
  /** Credit limit; 0 or absent = no limit tracked (never "over"). */
  creditLimit?: number;
  /** Day of the month the statement closes (1-31, clamped in short months). */
  statementDay?: number;
  /** Days after the statement closes that payment is due (the grace period). */
  dueDaysAfterStatement?: number;
  /** Minimum payment as a percentage of the balance (e.g. 2). */
  minPaymentPercent?: number;
  /** Minimum payment floor in money (e.g. 25 - "2% or $25, whichever is greater"). */
  minPaymentFloor?: number;
}

/** What the add/edit form collects. */
export interface AccountInput {
  name: string;
  kind: AccountKind;
  /** Empty string = joint. */
  memberId?: string;
  openingBalance: number;
  note?: string;
  apr?: number;
  creditLimit?: number;
  statementDay?: number;
  dueDaysAfterStatement?: number;
  minPaymentPercent?: number;
  minPaymentFloor?: number;
}

/**
 * Money moved between accounts (or in/out of them) that is NOT spending or
 * income: paying the credit card, an auto-transfer to savings, a cash
 * withdrawal. One end may be open - a deposit from outside has no `from`,
 * cash taken out has no `to` - but never both.
 */
export interface AccountTransfer {
  id: string;
  /** Account the money left; absent = it came from outside the tracked accounts. */
  fromAccountId?: string;
  /** Account the money entered; absent = it left the tracked accounts (cash out). */
  toAccountId?: string;
  /** Positive amount in the household currency. */
  amount: number;
  /** ISO datetime, local. */
  date: string;
  /** Who moved it. */
  memberId?: string;
  note?: string;
  /** ISO datetime it was recorded. */
  createdAt: string;
}

/** What the move-money form collects. */
export interface TransferInput {
  fromAccountId?: string;
  toAccountId?: string;
  amount: number;
  /** Defaults to now; never in the future. */
  date?: string;
  memberId?: string;
  note?: string;
}
