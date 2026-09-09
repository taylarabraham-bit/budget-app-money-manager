// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TransactionList, type Transaction } from './TransactionList';

// The purchase log. Its day totals coloured float dust green while printing
// "$0.00" (audit DS-6), and it re-sorted and re-grouped every row on every
// render - once per keystroke in the Activity search (UI-11).

afterEach(cleanup);

const today = new Date(2026, 7, 20, 12, 0);
const rows: Transaction[] = [
  { id: 'a', title: 'Coffee', amount: -4.5, date: '2026-08-19' },
  { id: 'b', title: 'Salary', amount: 2000, date: '2026-08-20' },
  { id: 'c', title: 'Groceries', amount: -80, date: '2026-08-20' },
];

const totals = (container: HTMLElement) => [...container.querySelectorAll('.bdg-txn-list__day-total')].map((el) => ({ text: el.textContent, positive: el.classList.contains('bdg-txn-list__day-total--positive') }));

describe('grouping', () => {
  it('groups by day, newest first, with a signed net total', () => {
    const { container } = render(<TransactionList transactions={rows} today={today} />);
    const labels = [...container.querySelectorAll('.bdg-txn-list__day-label')].map((el) => el.textContent);
    expect(labels).toEqual(['Today', 'Yesterday']);
    expect(totals(container)).toEqual([
      { text: '+$1,920.00', positive: true },
      { text: '-$4.50', positive: false },
    ]);
  });

  it('shows the empty state with nothing to list', () => {
    render(<TransactionList transactions={[]} />);
    expect(screen.getByText('No purchases yet')).toBeDefined();
  });
});

describe('a dust total is not coloured - DS-6', () => {
  it('prints $0.00 in the plain colour', () => {
    const dust: Transaction[] = [
      { id: 'a', title: 'Paid', amount: 10, date: '2026-08-20' },
      { id: 'b', title: 'Split back', amount: -10 + 4.547e-13, date: '2026-08-20' },
    ];
    const { container } = render(<TransactionList transactions={dust} today={today} />);
    expect(totals(container)).toEqual([{ text: '$0.00', positive: false }]);
  });
});

describe('grouping is memoised - UI-11', () => {
  it('does not re-sort when re-rendered with the same rows', () => {
    const sort = vi.spyOn(Array.prototype, 'sort');
    const { rerender } = render(<TransactionList transactions={rows} today={today} />);
    const afterMount = sort.mock.calls.length;
    rerender(<TransactionList transactions={rows} today={today} />);
    expect(sort.mock.calls.length).toBe(afterMount);
    rerender(<TransactionList transactions={[...rows]} today={today} />);
    expect(sort.mock.calls.length).toBe(afterMount + 1);
  });
});
