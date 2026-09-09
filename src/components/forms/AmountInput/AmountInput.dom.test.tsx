// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AmountInput } from './AmountInput';

// Every money field in the app is CONTROLLED, and the old implementation
// re-derived the visible text from the parsed number on every keystroke.
// "4." parses to 4, re-renders as "4", the dot is destroyed, and "4.50"
// entered as 450 - a hundredfold error on the primary money path (QA O-1).
// fill()-style tests set the whole string at once and can never catch that,
// so these type per-keystroke, the way a person does.

afterEach(cleanup);

function Controlled({ initial = null as number | null, onValue = (_: number | null) => {} }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <div>
      <AmountInput
        label="Amount"
        value={value}
        onValueChange={(v) => {
          setValue(v);
          onValue(v);
        }}
      />
      <button type="button" onClick={() => setValue(null)}>
        Clear
      </button>
      <button type="button" onClick={() => setValue(12)}>
        Quick fill
      </button>
    </div>
  );
}

const field = () => screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;

describe('typing decimals into a controlled field', () => {
  it('keeps the decimal point: "4.50" is 4.50, not 450', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await userEvent.type(field(), '4.50');
    expect(field().value).toBe('4.50');
    expect(onValue).toHaveBeenLastCalledWith(4.5);
  });

  it('survives cents-first and long amounts', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await userEvent.type(field(), '0.75');
    expect(field().value).toBe('0.75');
    expect(onValue).toHaveBeenLastCalledWith(0.75);

    await userEvent.clear(field());
    await userEvent.type(field(), '12.99');
    expect(field().value).toBe('12.99');
    expect(onValue).toHaveBeenLastCalledWith(12.99);
  });

  it('keeps a leading minus so an overdrawn balance can be typed', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await userEvent.type(field(), '-3.50');
    expect(field().value).toBe('-3.50');
    expect(onValue).toHaveBeenLastCalledWith(-3.5);
  });

  it('still never lets a comma into the field (the d7775cb decision)', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await userEvent.type(field(), '1,50');
    // What you see is exactly what parses: the comma never appears.
    expect(field().value).toBe('150');
    expect(onValue).toHaveBeenLastCalledWith(150);
  });

  it('snaps to the canonical form on blur', async () => {
    render(<Controlled />);
    await userEvent.type(field(), '4.5');
    expect(field().value).toBe('4.5');
    await userEvent.tab();
    expect(field().value).toBe('4.50');
  });

  it('clearing the field reports null and shows empty', async () => {
    const onValue = vi.fn();
    render(<Controlled initial={7} onValue={onValue} />);
    expect(field().value).toBe('7');
    await userEvent.clear(field());
    expect(field().value).toBe('');
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('an external value change wins over a half-typed draft', async () => {
    render(<Controlled />);
    await userEvent.type(field(), '4.');
    expect(field().value).toBe('4.');
    await userEvent.click(screen.getByRole('button', { name: 'Quick fill' }));
    expect(field().value).toBe('12');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(field().value).toBe('');
  });
});

describe('uncontrolled mode is unchanged', () => {
  it('renders the default and types freely', async () => {
    render(<AmountInput label="Amount" defaultValue={4.5} />);
    expect(field().value).toBe('4.50');
    await userEvent.clear(field());
    await userEvent.type(field(), '9.99');
    expect(field().value).toBe('9.99');
  });
});

// The split editor and the onboarding limits keep a plain number in state and
// coerce a cleared field to 0. Backspacing then showed "0" at once and typing
// "35" produced "035" (audit DS-4).
function Coerced({ initial = 40 }: { initial?: number }) {
  const [value, setValue] = useState<number>(initial);
  return (
    <div>
      <AmountInput label="Amount" value={value} onValueChange={(v) => setValue(v ?? 0)} />
      <output data-testid="held">{value}</output>
    </div>
  );
}

describe('a parent that never holds null - DS-4', () => {
  it('lets the field be emptied while the parent holds 0', async () => {
    render(<Coerced />);
    await userEvent.clear(field());
    expect(field().value).toBe('');
    expect(screen.getByTestId('held').textContent).toBe('0');
  });

  it('types a fresh number after a clear without a leading zero', async () => {
    render(<Coerced />);
    await userEvent.clear(field());
    await userEvent.type(field(), '35');
    expect(field().value).toBe('35');
    expect(screen.getByTestId('held').textContent).toBe('35');
  });

  it('keeps a half-typed second dot instead of snapping to 0', async () => {
    render(<Coerced initial={0} />);
    await userEvent.clear(field());
    await userEvent.type(field(), '1.2.');
    expect(field().value).toBe('1.2.');
    await userEvent.tab();
    // Blur snaps to what the parent holds: the unparsable draft coerced to 0.
    expect(field().value).toBe('0');
  });

  it('still lets an external change through', async () => {
    render(<Controlled initial={0} />);
    await userEvent.clear(field());
    await userEvent.click(screen.getByRole('button', { name: 'Quick fill' }));
    expect(field().value).toBe('12');
  });
});

describe('a pasted amount with mixed separators is refused - DS-13', () => {
  it('leaves the field as it was rather than reading 1.234,56 as 1.23', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await userEvent.click(field());
    await userEvent.paste('1.234,56');
    expect(field().value).toBe('');
    expect(onValue).not.toHaveBeenCalled();
  });

  it('still takes a thousands-grouped paste', async () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    await userEvent.click(field());
    await userEvent.paste('1,234.56');
    expect(field().value).toBe('1234.56');
    expect(onValue).toHaveBeenLastCalledWith(1234.56);
  });
});

describe('keyboard and precision follow the field - DS-19, MF-13', () => {
  it('asks for the decimal keypad by default and the full keyboard when negatives are allowed', () => {
    const { rerender } = render(<AmountInput label="Amount" />);
    expect(field().getAttribute('inputmode')).toBe('decimal');
    rerender(<AmountInput label="Amount" allowNegative />);
    expect(field().getAttribute('inputmode')).toBe('text');
  });

  it('takes its placeholder and precision from the currency', () => {
    const { rerender } = render(<AmountInput label="Amount" />);
    expect(field().placeholder).toBe('0.00');
    rerender(<AmountInput label="Amount" currency="JPY" />);
    expect(field().placeholder).toBe('0');
    cleanup();
    render(<AmountInput label="Amount" currency="JPY" defaultValue={1500} />);
    expect(field().value).toBe('1500');
  });

  it('snaps a yen draft to a whole number on blur', async () => {
    function Yen() {
      const [value, setValue] = useState<number | null>(null);
      return <AmountInput label="Amount" currency="JPY" value={value} onValueChange={setValue} />;
    }
    render(<Yen />);
    await userEvent.type(field(), '1500');
    await userEvent.tab();
    expect(field().value).toBe('1500');
  });
});
