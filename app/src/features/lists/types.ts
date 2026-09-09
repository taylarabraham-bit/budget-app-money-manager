// Shared lists: the shopping list (tick things off in the store, then log the
// trip as one purchase) and the wish list (bigger things to save for).

export type ListKind = 'shopping' | 'wish';

export type WishPriority = 'low' | 'medium' | 'high';

export interface ListItem {
  id: string;
  list: ListKind;
  name: string;
  /** Positive estimate in the household currency; absent = no price yet. */
  estimatedAmount?: number;
  /** Expense category it will be logged under. */
  categoryId?: string;
  /** Member who added it. */
  addedBy: string;
  /** ISO datetime. */
  createdAt: string;
  checked?: boolean;
  /** ISO datetime it was ticked. */
  checkedAt?: string;
  /** Set once it was logged as a purchase (alone or as part of a trip). */
  transactionId?: string;
  /** Wish list only. */
  priority?: WishPriority;
  url?: string;
  /** Wish list only: the goal created by "Turn into a goal". */
  goalId?: string;
  note?: string;
}

export interface ListItemInput {
  list: ListKind;
  name: string;
  estimatedAmount?: number | null;
  categoryId?: string;
  /** Defaults to the signed-in member. */
  addedBy?: string;
  priority?: WishPriority;
  url?: string;
  note?: string;
}

export const PRIORITY_ORDER: readonly WishPriority[] = ['high', 'medium', 'low'];

export const PRIORITY_LABEL: Record<WishPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const PRIORITY_TONE: Record<WishPriority, 'warning' | 'info' | 'neutral'> = { high: 'warning', medium: 'info', low: 'neutral' };

export const DEFAULT_SHOPPING_CATEGORY = 'c_groceries';
export const DEFAULT_WISH_CATEGORY = 'c_fun';
