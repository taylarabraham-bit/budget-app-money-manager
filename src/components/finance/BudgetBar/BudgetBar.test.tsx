// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetBar } from './BudgetBar';

// BudgetBar renders a money VERDICT - "over", "left", the amber warning - so a
// bug here tells the household something false about their budget rather than
// merely looking wrong. Two rules it has to keep:
//
//  - QA DR-3: the comparison is in whole cents. Purchases summing to
//    100.30000000000001 against a $100.30 limit are exactly AT the limit, and
//    must never render "$0.00 over".
//  - QA MF-3: limit 0 means "no cap", not "a limit of nothing" - it can never
//    read as over, however much was spent.
//
// `globals: false`, so cleanup is explicit rather than auto-registered.
afterEach(cleanup);

const bar = (props: Partial<Parameters<typeof BudgetBar>[0]> = {}) => render(<BudgetBar category="Groceries" spent={0} limit={100} {...props} />);

describe('the money figure', () => {
  it('shows what is left under the limit', () => {
    bar({ spent: 40, limit: 100 });
    expect(screen.getByText('$60 left')).toBeDefined();
  });

  it('shows the overspend when over', () => {
    bar({ spent: 120, limit: 100 });
    expect(screen.getByText('$20 over')).toBeDefined();
  });

  it('can show spend instead of what is left', () => {
    bar({ spent: 40, limit: 100, show: 'spent' });
    expect(screen.getByText('$40 spent')).toBeDefined();
  });

  it('still shows the overspend when asked for spend', () => {
    // Over is over: the figure must not quietly become "spent" and hide it.
    bar({ spent: 120, limit: 100, show: 'spent' });
    expect(screen.getByText('$20 over')).toBeDefined();
  });

  it('formats in the household currency', () => {
    bar({ spent: 40, limit: 100, currency: 'AUD' });
    expect(screen.getByText(/A\$60 left/)).toBeDefined();
  });

  it('shows cents only when they matter', () => {
    bar({ spent: 40.5, limit: 100 });
    expect(screen.getByText('$59.50 left')).toBeDefined();
  });
});

describe('the over verdict is decided in cents - QA DR-3', () => {
  it('is not over when float dust puts spend a hair past the limit', () => {
    const spent = 20.1 + 30.1 + 50.1; // 100.30000000000001
    const { container } = bar({ spent, limit: 100.3 });
    expect(screen.queryByText(/over/)).toBeNull();
    expect(screen.getByText('$0 left')).toBeDefined();
    expect(container.querySelector('.bdg-budget-bar--over')).toBeNull();
  });

  it('is not over at exactly the limit', () => {
    const { container } = bar({ spent: 100, limit: 100 });
    expect(container.querySelector('.bdg-budget-bar--over')).toBeNull();
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('is over by one cent', () => {
    const { container } = bar({ spent: 100.01, limit: 100 });
    expect(container.querySelector('.bdg-budget-bar--over')).not.toBeNull();
    expect(screen.getByText('$0.01 over')).toBeDefined();
  });
});

describe('a category with no limit - QA MF-3', () => {
  it('says so instead of inventing a ceiling', () => {
    bar({ spent: 400, limit: 0 });
    expect(screen.getByText('No monthly limit')).toBeDefined();
    expect(screen.getByText('$400 spent')).toBeDefined();
  });

  it('never reads as over, however much was spent', () => {
    const { container } = bar({ spent: 99_999, limit: 0 });
    expect(container.querySelector('.bdg-budget-bar--over')).toBeNull();
    expect(container.querySelector('.bdg-budget-bar--warn')).toBeNull();
    expect(screen.queryByText(/over/)).toBeNull();
  });

  it('shows no percentage, because there is nothing to be a percentage of', () => {
    bar({ spent: 400, limit: 0 });
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('treats a negative limit as no limit rather than going wild', () => {
    bar({ spent: 50, limit: -10 });
    expect(screen.getByText('No monthly limit')).toBeDefined();
  });
});

describe('the warning band', () => {
  it('warns from 85% by default', () => {
    expect(bar({ spent: 84, limit: 100 }).container.querySelector('.bdg-budget-bar--warn')).toBeNull();
    cleanup();
    expect(bar({ spent: 85, limit: 100 }).container.querySelector('.bdg-budget-bar--warn')).not.toBeNull();
  });

  it('takes a custom threshold', () => {
    expect(bar({ spent: 50, limit: 100, warnAt: 0.5 }).container.querySelector('.bdg-budget-bar--warn')).not.toBeNull();
  });

  it('does not warn once it is over - over supersedes', () => {
    const { container } = bar({ spent: 200, limit: 100 });
    expect(container.querySelector('.bdg-budget-bar--warn')).toBeNull();
    expect(container.querySelector('.bdg-budget-bar--over')).not.toBeNull();
  });
});

describe('the percentage', () => {
  it('rounds to whole percent', () => {
    bar({ spent: 33.33, limit: 100 });
    expect(screen.getByText('33%')).toBeDefined();
  });

  it('caps a runaway ratio so the row cannot be blown apart', () => {
    bar({ spent: 100_000, limit: 100 });
    expect(screen.getByText('999%')).toBeDefined();
  });
});

describe('accessibility and interaction', () => {
  it('labels the bar with the real amounts for a screen reader', () => {
    bar({ spent: 40, limit: 100 });
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('$40.00 of $100.00');
  });

  it('says there is no limit in the label too', () => {
    bar({ spent: 40, limit: 0 });
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('$40.00 spent, no monthly limit');
  });

  it('is a plain row by default and a button when tappable', async () => {
    expect(screen.queryByRole('button')).toBeNull();
    const onClick = vi.fn();
    bar({ onClick });
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('hides the decorative icon from assistive tech', () => {
    const { container } = bar({ icon: '🛒' });
    expect(container.querySelector('.bdg-budget-bar__icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the category and its period', () => {
    bar({ category: 'Transport', period: 'Aug 1-31' });
    expect(screen.getByText('Transport')).toBeDefined();
    expect(screen.getByText('Aug 1-31')).toBeDefined();
  });
});
