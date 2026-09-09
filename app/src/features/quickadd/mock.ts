import type { QuickAdd } from './types';

/** Sample favourites for the mock household (category ids match data/mock.ts). */
export function sampleQuickAdds(): QuickAdd[] {
  const created = new Date().toISOString();
  return [
    { id: 'q_coffee', title: 'Coffee', amount: 4.5, kind: 'expense', categoryId: 'c_dining', icon: '☕', useCount: 12, createdAt: created },
    { id: 'q_bus', title: 'Bus fare', amount: 2.75, kind: 'expense', categoryId: 'c_transport', icon: '🚌', useCount: 9, createdAt: created },
    { id: 'q_milk', title: 'Milk run', amount: 18, kind: 'expense', categoryId: 'c_groceries', shared: true, icon: '🛒', useCount: 4, createdAt: created },
    { id: 'q_lunch', title: 'Lunch', amount: 12, kind: 'expense', categoryId: 'c_dining', icon: '🍜', useCount: 6, createdAt: created },
    { id: 'q_tutoring', title: 'Tutoring (1h)', amount: 45, kind: 'income', categoryId: 'c_income', icon: '💼', useCount: 5, createdAt: created },
    { id: 'q_freelance', title: 'Freelance hour', amount: 60, kind: 'income', categoryId: 'c_income', icon: '💻', useCount: 3, createdAt: created },
  ];
}
