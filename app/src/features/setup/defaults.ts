import { currencySymbol } from '@budget-app/ui';
import type { Category } from '../../data/types';

// What a brand-new household starts with. The ids `c_home`, `c_subs` and
// `c_income` are referenced by other features (bill defaults, income logging),
// so they must exist in every household.

export function DEFAULT_CATEGORIES(): Category[] {
  return [
    { id: 'c_groceries', name: 'Groceries', icon: '🛒', color: 'primary', limit: 400, kind: 'expense' },
    { id: 'c_dining', name: 'Dining out', icon: '🍜', color: 'coral', limit: 200, kind: 'expense' },
    { id: 'c_transport', name: 'Transport', icon: '🚌', color: 'sky', limit: 120, kind: 'expense' },
    { id: 'c_home', name: 'Home & utilities', icon: '🏠', color: 'lime', limit: 800, kind: 'expense' },
    { id: 'c_fun', name: 'Fun', icon: '🎮', color: 'violet', limit: 100, kind: 'expense' },
    { id: 'c_subs', name: 'Subscriptions', icon: '🎵', color: 'rose', limit: 60, kind: 'expense' },
    { id: 'c_health', name: 'Health', icon: '💊', color: 'amber', limit: 80, kind: 'expense' },
    { id: 'c_shopping', name: 'Shopping', icon: '🛍️', color: 'coral', limit: 150, kind: 'expense' },
    { id: 'c_income', name: 'Income', icon: '💼', color: 'primary', limit: 0, kind: 'income' },
  ];
}

/** A curated list - `Intl.supportedValuesOf('currency')` is not available under the app's TS lib target. */
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'INR', 'ZAR', 'SGD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'PHP', 'KES', 'NGN'] as const;

export function currencyOptions(current?: string): Array<{ value: string; label: string }> {
  const codes: string[] = [...CURRENCY_CODES];
  if (current && !codes.includes(current)) codes.unshift(current);
  return codes.map((code) => ({ value: code, label: `${code} · ${currencySymbol(code)}` }));
}
