// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

// The notifications switch carries a 25-word description; with aria-labelledby
// pointing at the whole label block it was announced as one run-on name
// (audit UI-21). The name is the label alone and the description follows it.

afterEach(cleanup);

describe('accessible name and description', () => {
  it('names the switch by its label only', () => {
    render(<Switch label="Dark mode" description="Applies on this device only." />);
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeDefined();
  });

  it('exposes the description separately', () => {
    render(<Switch label="Dark mode" description="Applies on this device only." />);
    expect(screen.getByRole('switch', { description: 'Applies on this device only.' })).toBeDefined();
  });

  it('has no description reference without one', () => {
    render(<Switch label="Dark mode" />);
    expect(screen.getByRole('switch').getAttribute('aria-describedby')).toBeNull();
  });
});

describe('toggling', () => {
  it('flips on click and on the label', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Dark mode" description="Applies on this device only." onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText('Dark mode'));
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
