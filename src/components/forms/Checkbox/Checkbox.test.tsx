// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

// The native input is visually hidden behind an SVG tick. That is a real
// hazard: it is exactly the shape of control that ends up unreachable by
// keyboard or unlabelled, and the QA notes already record that Playwright's
// `check()` fails on it and the label has to be clicked instead.
//
// So these tests operate it the way a person does - by its label - and assert
// it stays a real, named, focusable checkbox underneath.

afterEach(cleanup);

describe('it is a real checkbox', () => {
  it('is exposed with its label as the accessible name', () => {
    render(<Checkbox label="Shared purchase" />);
    expect(screen.getByRole('checkbox', { name: 'Shared purchase' })).toBeDefined();
  });

  it('toggles when the label is clicked, not just the box', async () => {
    render(<Checkbox label="Shared purchase" />);
    const box = screen.getByRole('checkbox');
    expect((box as HTMLInputElement).checked).toBe(false);
    await userEvent.click(screen.getByText('Shared purchase'));
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  it('is reachable and operable by keyboard despite the hidden input', async () => {
    render(<Checkbox label="Shared purchase" />);
    await userEvent.tab();
    const box = screen.getByRole('checkbox');
    expect(document.activeElement).toBe(box);
    await userEvent.keyboard(' ');
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  it('reports each change to the caller', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Shared purchase" onChange={onChange} />);
    await userEvent.click(screen.getByText('Shared purchase'));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('can be driven as a controlled input', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Shared purchase" checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    await userEvent.click(box);
    // Controlled: the caller decides, so it stays unchecked until told otherwise.
    expect(box.checked).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('honours defaultChecked for the uncontrolled case', () => {
    render(<Checkbox label="Shared purchase" defaultChecked />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });
});

describe('description and error', () => {
  it('renders a description alongside the label', () => {
    render(<Checkbox label="Shared purchase" description="Split it with the household" />);
    expect(screen.getByText('Split it with the household')).toBeDefined();
    // The name must stay the label - the description must not swallow it.
    expect(screen.getByRole('checkbox', { name: /^Shared purchase/ })).toBeDefined();
  });

  it('marks itself invalid and shows the message when in error', () => {
    render(<Checkbox label="Agree" error="Please confirm" />);
    expect(screen.getByRole('checkbox').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Please confirm')).toBeDefined();
  });

  it('is not marked invalid when there is no error', () => {
    render(<Checkbox label="Agree" />);
    expect(screen.getByRole('checkbox').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('disabled', () => {
  it('cannot be toggled', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Shared purchase" disabled onChange={onChange} />);
    await userEvent.click(screen.getByText('Shared purchase'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is exposed as disabled rather than merely looking greyed out', () => {
    render(<Checkbox label="Shared purchase" disabled />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('ids', () => {
  it('generates a unique id per instance so labels never cross-wire', () => {
    render(
      <>
        <Checkbox label="First" />
        <Checkbox label="Second" />
      </>,
    );
    const [a, b] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(a!.id).not.toBe(b!.id);
  });

  it('clicking one label toggles only that one', async () => {
    render(
      <>
        <Checkbox label="First" />
        <Checkbox label="Second" />
      </>,
    );
    await userEvent.click(screen.getByText('Second'));
    const [a, b] = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(a!.checked).toBe(false);
    expect(b!.checked).toBe(true);
  });

  it('accepts an explicit id', () => {
    render(<Checkbox label="Shared" id="shared-box" />);
    expect(screen.getByRole('checkbox').id).toBe('shared-box');
  });
});
