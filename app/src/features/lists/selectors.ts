import { parseIsoDate } from '@budget-app/ui';
import type { LogPurchasePrefill } from '../../components/LogPurchaseProvider';
import { isBillPayment } from '../../data/selectors';
import type { HouseholdState } from '../../data/store';
import type { Category } from '../../data/types';
import { DEFAULT_SHOPPING_CATEGORY, PRIORITY_ORDER, type ListItem, type WishPriority } from './types';

const byCreated = (a: ListItem, b: ListItem) => a.createdAt.localeCompare(b.createdAt);
const byCheckedDesc = (a: ListItem, b: ListItem) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? '');
const sumEstimates = (items: ListItem[]) => items.reduce((acc, i) => acc + (i.estimatedAmount ?? 0), 0);

export interface ShoppingView {
  unchecked: ListItem[];
  checked: ListItem[];
  /** Sum of the unchecked estimates. */
  estimate: number;
  pricedCount: number;
  unpricedCount: number;
}

export function selectShopping(items: ListItem[]): ShoppingView {
  const shopping = items.filter((i) => i.list === 'shopping');
  const unchecked = shopping.filter((i) => !i.checked).sort(byCreated);
  return {
    unchecked,
    checked: shopping.filter((i) => !!i.checked).sort(byCheckedDesc),
    estimate: sumEstimates(unchecked),
    pricedCount: unchecked.filter((i) => i.estimatedAmount).length,
    unpricedCount: unchecked.filter((i) => !i.estimatedAmount).length,
  };
}

export interface WishView {
  open: ListItem[];
  bought: ListItem[];
  total: number;
  byPriority: Record<WishPriority, number>;
}

export function selectWish(items: ListItem[]): WishView {
  const wish = items.filter((i) => i.list === 'wish');
  const open = wish.filter((i) => !i.checked).sort((a, b) => PRIORITY_ORDER.indexOf(a.priority ?? 'medium') - PRIORITY_ORDER.indexOf(b.priority ?? 'medium') || b.createdAt.localeCompare(a.createdAt));
  const byPriority: Record<WishPriority, number> = { high: 0, medium: 0, low: 0 };
  for (const i of open) byPriority[i.priority ?? 'medium'] += i.estimatedAmount ?? 0;
  return { open, bought: wish.filter((i) => !!i.checked).sort(byCheckedDesc), total: sumEstimates(open), byPriority };
}

export interface ListsSummary {
  shoppingCount: number;
  shoppingEstimate: number;
  shoppingUnpriced: number;
  wishCount: number;
  wishTotal: number;
}

export function selectListsSummary(items: ListItem[]): ListsSummary {
  const s = selectShopping(items);
  const w = selectWish(items);
  return { shoppingCount: s.unchecked.length, shoppingEstimate: s.estimate, shoppingUnpriced: s.unpricedCount, wishCount: w.open.length, wishTotal: w.total };
}

/** Month-to-date spend vs limit for one category - "Groceries after this trip". Same maths as the Overview budgets. */
export function selectCategoryMonth(state: HouseholdState, categoryId: string, now: Date = new Date()): { category: Category | undefined; spent: number; limit: number; left: number } {
  const category = state.categories.find((c) => c.id === categoryId);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Bounded on BOTH ends like every other month selector: a future-dated row from a
  // fast-clock peer must not inflate this month's bar (QA UX-10).
  const spent = state.transactions
    .filter((t) => t.categoryId === categoryId && t.amount < 0 && !isBillPayment(t) && parseIsoDate(t.date) >= monthStart && parseIsoDate(t.date) < nextMonthStart)
    .reduce((acc, t) => acc - t.amount, 0);
  const limit = category?.limit ?? 0;
  return { category, spent, limit, left: limit - spent };
}

/** Prefill for "Bought everything": the priced estimates as one shared purchase with the item names as the note. */
export function batchPurchaseDraft(items: ListItem[], categories: Category[]): LogPurchasePrefill {
  const names = items.map((i) => i.name);
  let note = names.join(', ');
  if (note.length > 140) {
    let shown = 0;
    let acc = '';
    for (const n of names) {
      const next = acc ? `${acc}, ${n}` : n;
      if (next.length > 120) break;
      acc = next;
      shown += 1;
    }
    // A first name too long to fit whole is clipped, never dropped: the note used to
    // collapse to a bare " +1 more" with no item names at all (QA UX-9).
    if (!acc && names[0]) {
      acc = `${names[0].slice(0, 117)}…`;
      shown = 1;
    }
    note = shown >= names.length ? acc : `${acc} +${names.length - shown} more`;
  }
  const categoryId = categories.some((c) => c.id === DEFAULT_SHOPPING_CATEGORY) ? DEFAULT_SHOPPING_CATEGORY : categories.find((c) => c.kind === 'expense')?.id;
  return { kind: 'expense', amount: sumEstimates(items) || null, categoryId, title: `Shopping · ${items.length} item${items.length === 1 ? '' : 's'}`, shared: true, note };
}
