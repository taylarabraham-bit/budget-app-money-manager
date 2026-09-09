// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Amount } from './Amount';

// Amount splits money into sign / whole / fraction so the cents can be set
// smaller than the dollars. The split is cosmetic, but two things are not: the
// pieces must still read as one number to a screen reader, and the tone must
// match the sign - a positive figure rendered in the negative colour tells the
// household the opposite of the truth at a glance.

afterEach(cleanup);

const text = (el: HTMLElement) => el.textContent ?? '';

describe('the rendered number', () => {
  it('renders the parts in order so they read as one figure', () => {
    render(<Amount value={-1234.56} />);
    expect(text(screen.getByLabelText('-$1,234.56'))).toBe('-$1,234.56');
  });

  it('carries the whole formatted amount as its accessible name', () => {
    // The visual split must never reach a screen reader as "1,234" then "56".
    render(<Amount value={1234.56} />);
    expect(screen.getByLabelText('$1,234.56')).toBeDefined();
  });

  it('separates the fraction into its own element', () => {
    const { container } = render(<Amount value={64.2} />);
    expect(container.querySelector('.bdg-amount__whole')?.textContent).toBe('$64');
    expect(container.querySelector('.bdg-amount__fraction')?.textContent).toBe('.20');
  });

  it('has no sign element for a positive figure', () => {
    const { container } = render(<Amount value={10} />);
    expect(container.querySelector('.bdg-amount__sign')).toBeNull();
  });

  it('renders compact values as a single string', () => {
    const { container } = render(<Amount value={12400} compact />);
    expect(text(screen.getByLabelText('$12.4K'))).toBe('$12.4K');
    expect(container.querySelector('.bdg-amount__fraction')).toBeNull();
  });
});

describe('tone follows the sign', () => {
  const toneOf = (el: Element | null) => [...(el?.classList ?? [])].find((c) => c.startsWith('bdg-amount--') && !c.match(/--(sm|md|lg|xl|display|regular|medium|semibold|bold|struck)$/));

  it('is positive for money in and negative for money out', () => {
    expect(toneOf(render(<Amount value={10} />).container.firstElementChild)).toBe('bdg-amount--positive');
    cleanup();
    expect(toneOf(render(<Amount value={-10} />).container.firstElementChild)).toBe('bdg-amount--negative');
  });

  it('is neutral at zero - nothing gained, nothing lost', () => {
    expect(toneOf(render(<Amount value={0} />).container.firstElementChild)).toBe('bdg-amount--neutral');
  });

  it('can be overridden explicitly', () => {
    expect(toneOf(render(<Amount value={-10} tone="muted" />).container.firstElementChild)).toBe('bdg-amount--muted');
  });

  it('follows the printed figure, so dust that shows "$0.00" is not coloured - DS-6', () => {
    expect(toneOf(render(<Amount value={-4.547e-13} />).container.firstElementChild)).toBe('bdg-amount--neutral');
    cleanup();
    expect(toneOf(render(<Amount value={0.004} />).container.firstElementChild)).toBe('bdg-amount--neutral');
    cleanup();
    expect(toneOf(render(<Amount value={-0.4} wholeOnly />).container.firstElementChild)).toBe('bdg-amount--neutral');
    cleanup();
    expect(toneOf(render(<Amount value={0.006} />).container.firstElementChild)).toBe('bdg-amount--positive');
  });
});

describe('currency precision - MF-13', () => {
  it('renders yen without a fraction', () => {
    const { container } = render(<Amount value={1500} currency="JPY" />);
    expect(screen.getByLabelText('¥1,500')).toBeDefined();
    expect(container.querySelector('.bdg-amount__fraction')).toBeNull();
  });
});

describe('formatting options reach the output', () => {
  it('honours currency and locale', () => {
    render(<Amount value={1234.5} currency="AUD" />);
    expect(screen.getByLabelText(/A\$1,234\.50/)).toBeDefined();
  });

  it('honours signDisplay', () => {
    render(<Amount value={42} signDisplay="always" />);
    expect(text(screen.getByLabelText('+$42.00'))).toBe('+$42.00');
  });

  it('drops the cents when asked', () => {
    const { container } = render(<Amount value={64.2} wholeOnly />);
    expect(container.querySelector('.bdg-amount__fraction')).toBeNull();
    expect(screen.getByLabelText('$64')).toBeDefined();
  });

  it('applies size, weight and struck as classes', () => {
    const { container } = render(<Amount value={1} size="lg" weight="bold" struck />);
    const el = container.firstElementChild!;
    expect(el.classList.contains('bdg-amount--lg')).toBe(true);
    expect(el.classList.contains('bdg-amount--bold')).toBe(true);
    expect(el.classList.contains('bdg-amount--struck')).toBe(true);
  });
});

describe('bad input never reaches the screen', () => {
  it('renders a non-finite amount as zero rather than NaN', () => {
    render(<Amount value={Number.NaN} />);
    expect(text(screen.getByLabelText('$0.00'))).toBe('$0.00');
  });

  it('shows no minus sign for sub-half-cent dust', () => {
    // A settle-up residue of -4.5e-13 must not render as "-$0.00".
    const { container } = render(<Amount value={-4.547e-13} />);
    expect(container.querySelector('.bdg-amount__sign')).toBeNull();
    expect(text(container.firstElementChild as HTMLElement)).toBe('$0.00');
  });
});
