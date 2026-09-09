// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomNav } from './BottomNav';

// The phone nav. Its pending badge sat inside the aria-hidden icon, so a
// TalkBack user never heard that purchases were waiting (audit UI-13), and the
// raised "+" drifted to 58% of the width once the app had five destinations
// (DS-10): the destinations now sit in two equal halves either side of it.

afterEach(cleanup);

const items = [
  { value: 'overview', label: 'Overview', icon: '🏠' },
  { value: 'activity', label: 'Activity', icon: '📋', badge: 3 },
  { value: 'bills', label: 'Bills', icon: '🧾' },
  { value: 'goals', label: 'Goals', icon: '🎯' },
  { value: 'household', label: 'Household', icon: '👥' },
];

describe('the badge reaches the accessible name - UI-13', () => {
  it('names the item with its count', () => {
    render(<BottomNav items={items} value="overview" />);
    expect(screen.getByRole('button', { name: 'Activity, 3 pending' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeDefined();
  });

  it('lets the caller say what the count means', () => {
    render(<BottomNav items={items.map((i) => (i.badge ? { ...i, badgeLabel: '3 to confirm' } : i))} value="overview" />);
    expect(screen.getByRole('button', { name: 'Activity, 3 to confirm' })).toBeDefined();
  });

  it('drops the count from the name once the badge is gone', () => {
    render(<BottomNav items={items.map((i) => ({ ...i, badge: 0 }))} value="overview" />);
    expect(screen.getByRole('button', { name: 'Activity' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /pending/ })).toBeNull();
  });
});

describe('layout around the centre action - DS-10', () => {
  it('splits five destinations into two halves either side of the action', () => {
    const { container } = render(<BottomNav items={items} value="overview" action={{ label: 'Log purchase', icon: '+' }} />);
    const groups = container.querySelectorAll('.bdg-bottom-nav__group');
    expect(groups.length).toBe(2);
    expect(groups[0]!.querySelectorAll('.bdg-bottom-nav__item').length).toBe(3);
    expect(groups[1]!.querySelectorAll('.bdg-bottom-nav__item').length).toBe(2);
    const slot = container.querySelector('.bdg-bottom-nav__action-slot')!;
    expect(slot.previousElementSibling).toBe(groups[0]);
    expect(slot.nextElementSibling).toBe(groups[1]);
    expect(screen.getByRole('button', { name: 'Log purchase' })).toBeDefined();
  });

  it('keeps a flat row without an action', () => {
    const { container } = render(<BottomNav items={items} value="overview" />);
    expect(container.querySelector('.bdg-bottom-nav__group')).toBeNull();
    expect(container.querySelectorAll('.bdg-bottom-nav > .bdg-bottom-nav__item').length).toBe(5);
  });

  it('still reports taps and the current page', async () => {
    const onChange = vi.fn();
    render(<BottomNav items={items} value="overview" onChange={onChange} action={{ label: 'Log purchase', icon: '+' }} />);
    expect(screen.getByRole('button', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    await userEvent.click(screen.getByRole('button', { name: 'Goals' }));
    expect(onChange).toHaveBeenCalledWith('goals');
  });
});
