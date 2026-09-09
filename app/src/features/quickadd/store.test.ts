import { describe, expect, it } from 'vitest';
import { newId } from '../../lib/ids';
import { sampleQuickAdds } from './mock';
import { isQuickAdd } from './store';
import type { QuickAdd } from './types';

// The favourites guard is a sync and backup door: every optional field is
// type-checked (audit SEC-3) and ids follow the one shared rule (audit SEC-5).

const quick = (over: Partial<QuickAdd> = {}): QuickAdd => ({ id: 'q_1', title: 'Coffee', amount: 4.5, kind: 'expense', categoryId: 'c_dining', useCount: 0, createdAt: '2026-08-01T09:00:00', ...over });

describe('isQuickAdd', () => {
  it('accepts bare, full, generated and sample rows', () => {
    expect(isQuickAdd(quick())).toBe(true);
    expect(isQuickAdd(quick({ shared: true, icon: '☕', memberId: 'm_priya', lastUsedAt: '2026-08-02T10:00:00' }))).toBe(true);
    expect(isQuickAdd(quick({ id: newId('q') }))).toBe(true);
    for (const row of sampleQuickAdds()) expect(isQuickAdd(row)).toBe(true);
  });

  const cases: Array<[string, unknown]> = [
    ['shared', 'yes'],
    ['shared', 1],
    ['icon', 1],
    ['memberId', ''],
    ['memberId', 'm/../x'],
    ['lastUsedAt', 1],
    ['id', 'q 1'],
    ['id', ''],
    ['categoryId', 9],
    ['categoryId', 'c"x'],
    ['kind', 'transfer'],
    ['amount', '4.5'],
    ['useCount', '0'],
    ['title', undefined],
  ];
  it.each(cases)('drops a row whose %s is %j', (field, value) => {
    expect(isQuickAdd({ ...quick(), [field]: value })).toBe(false);
  });
});
