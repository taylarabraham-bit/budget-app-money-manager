// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Select } from './Select';

// React shows the FIRST option when a controlled value matches none, so an
// edit form for a purchase whose account had been deleted displayed "Not
// tracked" while quietly re-saving the dead id (audit UX-5 / DS-3). A disabled
// sentinel option now holds the stale value where it can be seen.

afterEach(cleanup);

const options = [
  { value: 'none', label: 'Not tracked' },
  { value: 'acc-1', label: 'Everyday' },
];

const native = () => screen.getByRole('combobox', { name: 'Paid with' }) as HTMLSelectElement;
const selectedText = () => native().selectedOptions[0]?.textContent;

describe('a stale value stays visible', () => {
  it('shows "Unknown", disabled and selected, instead of the first option', () => {
    render(<Select label="Paid with" options={options} value="acc-deleted" onChange={() => {}} />);
    expect(native().value).toBe('acc-deleted');
    expect(selectedText()).toBe('Unknown');
    expect(native().selectedOptions[0]?.disabled).toBe(true);
  });

  it('takes a caller-supplied label', () => {
    render(<Select label="Paid with" options={options} value="acc-deleted" unknownLabel="An account since removed" onChange={() => {}} />);
    expect(selectedText()).toBe('An account since removed');
  });

  it('adds nothing for a value the options carry', () => {
    render(<Select label="Paid with" options={options} value="acc-1" onChange={() => {}} />);
    expect(selectedText()).toBe('Everyday');
    expect(screen.queryByRole('option', { name: 'Unknown' })).toBeNull();
  });

  it('lets an empty value fall on the placeholder', () => {
    render(<Select label="Paid with" options={options} placeholder="Choose an account" value="" onChange={() => {}} />);
    expect(selectedText()).toBe('Choose an account');
    expect(screen.queryByRole('option', { name: 'Unknown' })).toBeNull();
  });

  it('covers a stale uncontrolled default too', () => {
    render(<Select label="Paid with" options={options} defaultValue="gone" />);
    expect(selectedText()).toBe('Unknown');
  });
});
