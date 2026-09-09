// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GoalCard } from './GoalCard';

// A $999.50 of $1,000 goal read "100%" next to "$0.50 to go" (audit MON-14),
// and two contributors with the same name were keyed by name, so React
// dropped one avatar and warned (UX-14).

afterEach(cleanup);

describe('the percentage', () => {
  it('never says 100% before the goal is reached', () => {
    render(<GoalCard name="Laptop" target={1000} saved={999.5} />);
    expect(screen.getByText('99%')).toBeDefined();
    expect(screen.getByText('$0.50 to go')).toBeDefined();
    expect(screen.queryByText('Reached')).toBeNull();
  });

  it('says 100% once it is', () => {
    render(<GoalCard name="Laptop" target={1000} saved={1000} />);
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByText('Reached')).toBeDefined();
  });
});

describe('contributors', () => {
  it('are keyed by id, so two members called Sam both appear without a key warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <GoalCard
        name="Holiday"
        target={2000}
        saved={500}
        contributors={[
          { id: 'm1', name: 'Sam' },
          { id: 'm2', name: 'Sam' },
        ]}
      />,
    );
    expect(screen.getAllByRole('img', { name: 'Sam' }).length).toBe(2);
    expect(error.mock.calls.some((args) => String(args[0]).includes('same key'))).toBe(false);
  });

  it('survive members without an id', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<GoalCard name="Holiday" target={2000} saved={500} contributors={[{ name: 'Sam' }, { name: 'Sam' }]} />);
    expect(screen.getAllByRole('img', { name: 'Sam' }).length).toBe(2);
    expect(error.mock.calls.some((args) => String(args[0]).includes('same key'))).toBe(false);
  });
});
