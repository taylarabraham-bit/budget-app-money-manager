// Settle-up payments between members. Shapes mirror the planned Supabase
// `settlements` table so the local store can be swapped for real queries
// without touching the screens.

export type SettlementMethod = 'cash' | 'transfer' | 'other';

export const SETTLEMENT_METHODS: readonly SettlementMethod[] = ['transfer', 'cash', 'other'];

export const METHOD_LABEL: Record<SettlementMethod, string> = {
  transfer: 'Bank transfer',
  cash: 'Cash',
  other: 'Other',
};

export interface Settlement {
  id: string;
  /** Who paid. */
  fromMemberId: string;
  /** Who received. */
  toMemberId: string;
  /** Positive amount in the household currency. */
  amount: number;
  /** ISO datetime, local. */
  date: string;
  method?: SettlementMethod;
  note?: string;
  /** ISO datetime it was recorded. */
  createdAt: string;
}

export interface SettlementInput {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  method?: SettlementMethod;
  note?: string;
  /** Defaults to now. */
  date?: string;
}
