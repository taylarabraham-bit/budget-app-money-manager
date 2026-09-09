// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from './Tabs';

// Tabs use a roving tabindex: exactly one tab is reachable with the Tab key
// and the arrows move between the rest. The onboarding Sharing step could
// leave the SELECTED tab disabled, at which point no tab was reachable and the
// whole list vanished from the keyboard (audit DS-9). The app also draws form
// choices as tabs, which a screen reader announced as "tab 1 of 2" (UI-21).

afterEach(cleanup);

const items = [
  { value: 'equal', label: 'Equal' },
  { value: 'income', label: 'By income' },
  { value: 'custom', label: 'Custom' },
];

const tabIndexOf = (name: string) => screen.getByRole('tab', { name }).tabIndex;

describe('one tab is always reachable - DS-9', () => {
  it('is the active tab in the ordinary case', () => {
    render(<Tabs items={items} value="income" />);
    expect(tabIndexOf('By income')).toBe(0);
    expect(tabIndexOf('Equal')).toBe(-1);
  });

  it('falls back to the first enabled tab when the value matches nothing', () => {
    render(<Tabs items={items} value="nothing" />);
    expect(tabIndexOf('Equal')).toBe(0);
  });

  it('falls back when the active tab is disabled', () => {
    render(<Tabs items={[items[0]!, { ...items[1]!, disabled: true }, items[2]!]} value="income" />);
    expect(tabIndexOf('By income')).toBe(-1);
    expect(tabIndexOf('Equal')).toBe(0);
    expect(tabIndexOf('Custom')).toBe(-1);
  });
});

describe('arrow keys', () => {
  it('select the next enabled tab and move focus onto it', async () => {
    const onChange = vi.fn();
    render(<Tabs items={[items[0]!, { ...items[1]!, disabled: true }, items[2]!]} defaultValue="equal" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Equal' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('custom');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Custom' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('equal');
  });
});

describe('semantics', () => {
  it('is a tablist of selected tabs by default', () => {
    render(<Tabs items={items} value="equal" aria-label="Sharing" />);
    expect(screen.getByRole('tablist', { name: 'Sharing' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Equal' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Custom' }).getAttribute('aria-selected')).toBe('false');
  });

  it('becomes a radiogroup of checked radios for a form choice - UI-21', async () => {
    const onChange = vi.fn();
    render(<Tabs role="radiogroup" items={items} value="equal" onChange={onChange} aria-label="How to split" />);
    expect(screen.getByRole('radiogroup', { name: 'How to split' })).toBeDefined();
    expect(screen.queryByRole('tablist')).toBeNull();
    const equal = screen.getByRole('radio', { name: 'Equal' });
    expect(equal.getAttribute('aria-checked')).toBe('true');
    expect(equal.getAttribute('aria-selected')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Custom' }).getAttribute('aria-checked')).toBe('false');
    await userEvent.click(equal);
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('income');
  });
});
