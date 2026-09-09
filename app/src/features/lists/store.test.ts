import { describe, expect, it } from 'vitest';
import { newId } from '../../lib/ids';
import { sampleListItems } from './mock';
import { isListItem } from './store';
import type { ListItem } from './types';

// The list-item guard is a sync and backup door. One malformed row used to
// pass it, persist, sync, and crash the Lists tab on every device (ShoppingRow
// slices `checkedAt`), and a `javascript:` url reached an href (audit SEC-3);
// ids, own and foreign, follow the one shared rule (audit SEC-5).

const item = (over: Partial<ListItem> = {}): ListItem => ({ id: 'li_1', list: 'wish', name: 'Desk', addedBy: 'm_priya', createdAt: '2026-08-01T09:00:00', ...over });

describe('isListItem', () => {
  it('accepts a bare row, a fully populated one, generated ids and the sample list', () => {
    expect(isListItem(item())).toBe(true);
    expect(isListItem(item({ estimatedAmount: 450, categoryId: 'c_home', checked: true, checkedAt: '2026-08-02T10:00:00', transactionId: 't_1', priority: 'high', url: 'https://example.com/desk', goalId: 'g_1', note: 'hi' }))).toBe(true);
    expect(isListItem(item({ id: newId('li'), transactionId: newId('t'), goalId: newId('g') }))).toBe(true);
    for (const row of sampleListItems()) expect(isListItem(row)).toBe(true);
  });

  const optional: Array<[string, unknown]> = [
    ['estimatedAmount', '4.20'],
    ['categoryId', 4],
    ['categoryId', 'c home'],
    ['checked', 'yes'],
    ['checkedAt', 1],
    ['checkedAt', null],
    ['transactionId', 7],
    ['transactionId', 't/../x'],
    ['priority', 'urgent'],
    ['url', 'javascript:alert(1)'],
    ['url', 'example.com/desk'],
    ['url', 42],
    ['goalId', {}],
    ['goalId', ''],
    ['note', ['x']],
  ];
  it.each(optional)('drops a row whose optional %s is %j', (field, value) => {
    expect(isListItem({ ...item(), [field]: value })).toBe(false);
  });

  const required: Array<[string, unknown]> = [
    ['id', ''],
    ['id', 'li 1'],
    ['id', 'li/../1'],
    ['list', 'todo'],
    ['name', 1],
    ['addedBy', 'm/../x'],
    ['addedBy', undefined],
    ['createdAt', 1],
  ];
  it.each(required)('drops a row whose required %s is %j', (field, value) => {
    expect(isListItem({ ...item(), [field]: value })).toBe(false);
  });

  it('accepts only web URLs, case-insensitively', () => {
    expect(isListItem(item({ url: 'HTTP://example.com' }))).toBe(true);
    expect(isListItem(item({ url: 'https://example.com/a?b=c#d' }))).toBe(true);
    expect(isListItem(item({ url: 'ftp://example.com' }))).toBe(false);
    expect(isListItem(item({ url: 'data:text/html,hi' }))).toBe(false);
  });
});
