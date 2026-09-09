// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

// Every bar in the app is this component: budgets, goals, subscription shares,
// shopping lists. Two things matter beyond the fill width.
//
// The naming props must land on the element carrying role="progressbar". They
// used to be spread onto the outer wrapper along with the rest of the props,
// so callers built a good aria-label ("$40.00 of $100.00") and it was
// announced by nothing - caught by BudgetBar's suite, fixed here.
//
// The value must be clamped for display without lying about being over.

afterEach(cleanup);

describe('the accessible name reaches the progressbar role', () => {
  it('puts aria-label on the role element, not the wrapper', () => {
    render(<ProgressBar value={40} max={100} aria-label="$40.00 of $100.00" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('$40.00 of $100.00');
  });

  it('forwards aria-labelledby and aria-describedby the same way', () => {
    render(
      <>
        <span id="lbl">Groceries</span>
        <span id="desc">of the monthly limit</span>
        <ProgressBar value={1} max={2} aria-labelledby="lbl" aria-describedby="desc" />
      </>,
    );
    const track = screen.getByRole('progressbar');
    expect(track.getAttribute('aria-labelledby')).toBe('lbl');
    expect(track.getAttribute('aria-describedby')).toBe('desc');
  });

  it('finds the bar by its accessible name', () => {
    render(<ProgressBar value={3} max={4} aria-label="Holiday fund" />);
    expect(screen.getByRole('progressbar', { name: 'Holiday fund' })).toBeDefined();
  });

  it('leaves other props on the wrapper', () => {
    const { container } = render(<ProgressBar value={1} max={2} data-testid="outer" id="mine" />);
    expect(container.querySelector('.bdg-progress')?.getAttribute('id')).toBe('mine');
  });
});

describe('the reported value', () => {
  it('reports the value and the maximum', () => {
    render(<ProgressBar value={40} max={100} />);
    const track = screen.getByRole('progressbar');
    expect(track.getAttribute('aria-valuenow')).toBe('40');
    expect(track.getAttribute('aria-valuemin')).toBe('0');
    expect(track.getAttribute('aria-valuemax')).toBe('100');
  });

  it('never reports past the maximum', () => {
    render(<ProgressBar value={250} max={100} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('still marks itself over when the value exceeds the maximum', () => {
    const { container } = render(<ProgressBar value={250} max={100} />);
    expect(container.querySelector('.bdg-progress--over')).not.toBeNull();
  });

  it('falls back to a sane maximum rather than dividing by zero', () => {
    render(<ProgressBar value={10} max={0} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('100');
  });

  it('omits the value entirely when indeterminate', () => {
    render(<ProgressBar value={40} max={100} indeterminate />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
  });

  it('never reports NaN or a value below the minimum - DS-8', () => {
    render(<ProgressBar value={Number.NaN} max={100} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    cleanup();
    render(<ProgressBar value={-50} max={100} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('the fill', () => {
  const width = (el: Element | null) => (el as HTMLElement | null)?.style.width;

  it('is proportional', () => {
    const { container } = render(<ProgressBar value={25} max={100} />);
    expect(width(container.querySelector('.bdg-progress__fill'))).toBe('25%');
  });

  it('is clamped at both ends so it cannot overflow its track', () => {
    const { container } = render(<ProgressBar value={250} max={100} />);
    expect(width(container.querySelector('.bdg-progress__fill'))).toBe('100%');
    cleanup();
    const neg = render(<ProgressBar value={-50} max={100} />);
    expect(width(neg.container.querySelector('.bdg-progress__fill'))).toBe('0%');
  });

  it('treats a non-finite value as empty rather than NaN%', () => {
    const { container } = render(<ProgressBar value={Number.NaN} max={100} />);
    expect(width(container.querySelector('.bdg-progress__fill'))).toBe('0%');
  });
});

describe('the optional header', () => {
  it('renders a label and a value label when given', () => {
    render(<ProgressBar value={1} max={2} label="Groceries" valueLabel="50%" />);
    expect(screen.getByText('Groceries')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
  });

  it('renders no header at all when given neither', () => {
    const { container } = render(<ProgressBar value={1} max={2} />);
    expect(container.querySelector('.bdg-progress__header')).toBeNull();
  });
});
