// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

// One boundary per routed screen and per global dialog (audit UI-7): a crash on
// Lists must leave the nav, Overview and the other tabs standing, and offer a
// way back that is not "reload".

function Boom({ when }: { when: boolean }) {
  if (when) throw new Error('bad row');
  return <p>fine</p>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(cleanup);

describe('screen scope', () => {
  it('shows the recovery panel with "Back to Overview" and calls onReset', () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary scope="screen" onReset={onReset} resetKey="lists">
        <Boom when />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('bad row');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('clears the error when the route key changes, so the next screen renders', () => {
    const { rerender } = render(
      <ErrorBoundary scope="screen" resetKey="lists">
        <Boom when />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(
      <ErrorBoundary scope="screen" resetKey="overview">
        <Boom when={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('fine')).toBeTruthy();
  });
});

describe('dialog scope', () => {
  it('replaces the crashed dialog with a closable one whose Close resets and calls onReset', () => {
    const onReset = vi.fn();
    // The real wiring: onReset closes the dialog in the parent's state, in the same
    // batch as the boundary's own reset, so the child renders harmlessly afterwards.
    function Parent() {
      const [open, setOpen] = useState(true);
      return (
        <ErrorBoundary
          scope="dialog"
          onReset={() => {
            onReset();
            setOpen(false);
          }}
        >
          <Boom when={open} />
        </ErrorBoundary>
      );
    }
    render(<Parent />);
    expect(screen.getByRole('dialog').textContent).toContain('Something went wrong');
    fireEvent.click(screen.getByText('Close')); // the footer button (the header's X is labelled Close too)
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('fine')).toBeTruthy();
  });
});

describe('app scope (the root)', () => {
  it('keeps the plain reload page, with the button in the on-primary colour', () => {
    render(
      <ErrorBoundary>
        <Boom when />
      </ErrorBoundary>,
    );
    const button = screen.getByRole('button', { name: 'Reload the app' });
    expect(button.style.color).toContain('--bdg-color-on-primary');
  });
});
