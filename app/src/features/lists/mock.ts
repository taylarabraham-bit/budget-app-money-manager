import type { ListItem } from './types';

const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();

/** Sample lists for the mock household (ids match data/mock.ts). */
export function sampleListItems(): ListItem[] {
  return [
    { id: 'li_milk', list: 'shopping', name: 'Milk', estimatedAmount: 4.2, categoryId: 'c_groceries', addedBy: 'm_priya', createdAt: ago(2) },
    { id: 'li_eggs', list: 'shopping', name: 'Eggs', estimatedAmount: 5.5, categoryId: 'c_groceries', addedBy: 'm_sam', createdAt: ago(2, 3) },
    { id: 'li_coffee', list: 'shopping', name: 'Coffee beans', estimatedAmount: 14, categoryId: 'c_groceries', addedBy: 'm_sam', createdAt: ago(1) },
    { id: 'li_soap', list: 'shopping', name: 'Dish soap', estimatedAmount: 3.8, categoryId: 'c_home', addedBy: 'm_priya', createdAt: ago(1, 5) },
    { id: 'li_bananas', list: 'shopping', name: 'Bananas', categoryId: 'c_groceries', addedBy: 'm_maya', createdAt: ago(0, 6) },
    { id: 'li_bread', list: 'shopping', name: 'Bread', estimatedAmount: 3.5, categoryId: 'c_groceries', addedBy: 'm_priya', createdAt: ago(3), checked: true, checkedAt: ago(0, 2) },
    { id: 'li_desk', list: 'wish', name: 'Standing desk', estimatedAmount: 450, categoryId: 'c_home', addedBy: 'm_priya', createdAt: ago(10), priority: 'high', url: 'https://example.com/desk' },
    { id: 'li_airfryer', list: 'wish', name: 'Air fryer', estimatedAmount: 120, categoryId: 'c_home', addedBy: 'm_sam', createdAt: ago(8), priority: 'medium' },
    { id: 'li_montreal', list: 'wish', name: 'Weekend in Montreal', estimatedAmount: 600, categoryId: 'c_fun', addedBy: 'm_sam', createdAt: ago(6), priority: 'low', note: 'Long weekend in October' },
    { id: 'li_headphones', list: 'wish', name: 'Noise-cancelling headphones', estimatedAmount: 280, categoryId: 'c_fun', addedBy: 'm_maya', createdAt: ago(4), priority: 'medium' },
  ];
}
