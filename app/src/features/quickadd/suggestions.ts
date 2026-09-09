import type { HouseholdState } from '../../data/store';
import { dateOnly, daysUntil } from '../../lib/dates';
import type { QuickAddKind } from './types';

// Recent merchants: suggestions derived from what has already been logged,
// so typing "Tr" offers "Trader Joe's" with the category it was last logged under.

export interface MerchantSuggestion {
  title: string;
  categoryId: string;
  count: number;
  /** ISO datetime of the most recent entry. */
  lastDate: string;
  lastAmount: number;
}

const GENERIC = new Set(['', 'purchase', 'income']);

/** Most used / most recent titles for `kind`, narrowed by `query` (case-insensitive), excluding an exact match. */
export function selectMerchantSuggestions(state: HouseholdState, kind: QuickAddKind, query = '', limit = 6, now: Date = new Date()): MerchantSuggestion[] {
  const q = query.trim().toLowerCase();
  const groups = new Map<string, MerchantSuggestion>();
  for (const t of state.transactions) {
    const isIncome = t.amount > 0;
    if ((kind === 'income') !== isIncome) continue;
    const key = t.title.trim().toLowerCase();
    if (GENERIC.has(key)) continue;
    const g = groups.get(key);
    if (!g) groups.set(key, { title: t.title.trim(), categoryId: t.categoryId, count: 1, lastDate: t.date, lastAmount: Math.abs(t.amount) });
    else {
      g.count += 1;
      if (t.date > g.lastDate) {
        g.lastDate = t.date;
        g.title = t.title.trim();
        g.categoryId = t.categoryId;
        g.lastAmount = Math.abs(t.amount);
      }
    }
  }
  const score = (s: MerchantSuggestion) => {
    // Local calendar days, not raw milliseconds: the bonus must not flip partway
    // through a day, and a legacy date-only stamp must not parse as UTC midnight.
    const ageDays = -daysUntil(dateOnly(s.lastDate), now);
    return s.count + (ageDays <= 7 ? 3 : ageDays <= 30 ? 1 : 0);
  };
  return [...groups.values()]
    .filter((s) => !q || (s.title.toLowerCase().includes(q) && s.title.toLowerCase() !== q))
    .sort((a, b) => score(b) - score(a) || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}
