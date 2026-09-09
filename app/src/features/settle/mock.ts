import { daysAgo } from '../../data/mock';
import type { Settlement } from './types';

/** Sample payments between the two adults of the mock household (ids match data/mock.ts). Dates are relative to now. */
export function sampleSettlements(): Settlement[] {
  return [
    { id: 's_1', fromMemberId: 'm_sam', toMemberId: 'm_priya', amount: 40, date: daysAgo(15, 18), method: 'transfer', note: 'Groceries catch-up', createdAt: daysAgo(15, 18) },
    { id: 's_2', fromMemberId: 'm_priya', toMemberId: 'm_sam', amount: 25, date: daysAgo(45, 12), method: 'cash', createdAt: daysAgo(45, 12) },
  ];
}
