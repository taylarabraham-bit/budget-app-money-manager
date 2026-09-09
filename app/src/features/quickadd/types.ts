// Quick-add favourites: one-tap chips in the Log purchase dialog for the
// things logged again and again (coffee, bus fare, a regular shift).

export type QuickAddKind = 'expense' | 'income';

export interface QuickAdd {
  id: string;
  title: string;
  /** Positive amount. */
  amount: number;
  kind: QuickAddKind;
  categoryId: string;
  shared?: boolean;
  /** Single emoji; falls back to the category icon. */
  icon?: string;
  /** Omit = whoever is logging. */
  memberId?: string;
  useCount: number;
  /** ISO datetime. */
  lastUsedAt?: string;
  createdAt: string;
}

export type QuickAddInput = Omit<QuickAdd, 'id' | 'useCount' | 'lastUsedAt' | 'createdAt'>;
