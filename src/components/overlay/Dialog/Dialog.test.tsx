// @vitest-environment jsdom
import { useState, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, closeTopDialog, openDialogCount } from './Dialog';

// Every dialog in the app is this component. A keyboard or switch-access user
// used to open "Delete this purchase?" and find Tab wandering the page behind
// the scrim, then land on <body> when it closed (audit UX-13 / UI-3), and a
// flick past the end of a sheet scrolled the Overview underneath (UI-4 / DS-15).
//
// jsdom has no `inert`. The Dialog only marks the page where the platform
// supports it, so the property is polyfilled here as the attribute reflection
// browsers implement; jsdom's focus() still ignores it, which is what lets the
// focus-leak test below simulate a WebView without inert.

beforeAll(() => {
  if (!('inert' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'inert', {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute('inert');
      },
      set(this: HTMLElement, on: boolean) {
        if (on) this.setAttribute('inert', '');
        else this.removeAttribute('inert');
      },
    });
  }
});
afterEach(cleanup);

function Host({ children, footer, hideClose = false }: { children?: ReactNode; footer?: ReactNode; hideClose?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Log purchase" footer={footer} hideClose={hideClose}>
        {children}
      </Dialog>
    </div>
  );
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'Open' }));

describe('initial focus', () => {
  it('moves to the first field in the body', async () => {
    render(
      <Host>
        <input aria-label="Amount" />
        <input aria-label="Note" />
      </Host>,
    );
    await open();
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
  });

  it('prefers the footer over the close control when the body has no fields', async () => {
    render(
      <Host
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button">Delete</button>
          </>
        }
      />,
    );
    await open();
    // The first footer control is the safe one on a destructive confirm.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('takes the close control when it is all there is, else the panel itself', async () => {
    render(<Host />);
    await open();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    cleanup();
    render(<Host hideClose />);
    await open();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('leaves a child autoFocus alone', async () => {
    render(
      <Host>
        <input aria-label="Amount" />
        <input aria-label="Note" autoFocus />
      </Host>,
    );
    await open();
    expect(document.activeElement).toBe(screen.getByLabelText('Note'));
  });
});

describe('focus stays inside and comes back', () => {
  it('cycles Tab within the panel', async () => {
    render(
      <Host footer={<button type="button">Save</button>}>
        <input aria-label="Amount" />
      </Host>,
    );
    await open();
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
    await userEvent.tab();
    // Past the last control, Tab wraps to the first: the close control in the header.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
  });

  it('stays on the panel when nothing inside is focusable', async () => {
    render(<Host hideClose />);
    await open();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('pulls focus back when it lands behind the scrim', async () => {
    const { container } = render(
      <Host>
        <input aria-label="Amount" />
      </Host>,
    );
    await open();
    const behind = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Behind')!;
    behind.focus();
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
  });

  it('gives focus back to the opener on close', async () => {
    render(
      <Host>
        <input aria-label="Amount" />
      </Host>,
    );
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }));
  });
});

describe('the page behind', () => {
  it('is made inert while the dialog is open and released after', () => {
    const { container, rerender } = render(
      <div>
        <button type="button">Behind</button>
        <Dialog open title="A" />
      </div>,
    );
    const behind = container.querySelector('button')!;
    expect(behind.hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();
    rerender(
      <div>
        <button type="button">Behind</button>
        <Dialog open={false} title="A" />
      </div>,
    );
    expect(behind.hasAttribute('inert')).toBe(false);
  });

  it('has its scroll locked, once, for as long as any dialog is open', () => {
    const { rerender } = render(
      <>
        <Dialog open title="A" />
        <Dialog open title="B" />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <>
        <Dialog open title="A" />
        <Dialog open={false} title="B" />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <>
        <Dialog open={false} title="A" />
        <Dialog open={false} title="B" />
      </>,
    );
    expect(document.body.style.overflow).toBe('');
  });
});

describe('stacking', () => {
  it('only the top dialog answers Escape, and closeTopDialog closes that one', async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    render(
      <>
        <Dialog open title="A" onClose={closeA} />
        <Dialog open title="B" onClose={closeB} />
      </>,
    );
    expect(openDialogCount()).toBe(2);
    await userEvent.keyboard('{Escape}');
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    expect(closeTopDialog()).toBe(true);
    expect(closeB).toHaveBeenCalledTimes(2);
    expect(closeA).not.toHaveBeenCalled();
  });
});
