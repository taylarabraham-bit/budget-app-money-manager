import { forwardRef, useId, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react';
import { cx } from '../../../lib/cx';
import { currencyFractionDigits, currencySymbol } from '../../../lib/format';
import type { Size } from '../../../lib/types';

export interface AmountInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'defaultValue' | 'onChange' | 'type' | 'prefix'> {
  /** Visible label, e.g. "Amount". */
  label: string;
  /** ISO currency code shown as the in-field symbol; also sets the precision (two decimals, none for yen). Default "USD". */
  currency?: string;
  /** Controlled numeric value; `null` when empty. */
  value?: number | null;
  /** Initial value for uncontrolled use. */
  defaultValue?: number | null;
  /** Called with the parsed number (or `null` when the field is cleared). */
  onValueChange?: (value: number | null) => void;
  /** Helper text under the field. */
  hint?: string;
  /** Error message; turns the field red. */
  error?: string;
  /** Control height: sm 32px, md 40px, lg 48px. `lg` is the default - amounts are the main thing people type. */
  size?: Size;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Placeholder shown while empty. Defaults to a zero in the currency's precision: "0.00", or "0" for yen. */
  placeholder?: string;
  /** Disables the field. */
  disabled?: boolean;
  /** Marks the field required. */
  required?: boolean;
  /** Form field name. */
  name?: string;
  /**
   * The amount may be negative (an overdrawn balance, a refund). Phone keypads
   * for the decimal input mode have no minus key, so a signed field asks for
   * the full keyboard instead (audit DS-19). A leading minus is accepted either way.
   */
  allowNegative?: boolean;
}

/** Canonical text for a value: whole numbers bare, fractions in the currency's precision (audit MF-13). */
function toText(v: number | null | undefined, digits: number): string {
  if (v == null || Number.isNaN(v)) return '';
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

function sameAmount(a: number | null, b: number | null): boolean {
  return a === b || (a === null && b === null);
}

/**
 * Digits, dots and a minus only. Commas are NOT accepted - they used to be
 * stripped before parsing, which silently read a European-style "1,50" as 150,
 * a hundredfold error. Now a comma simply never enters the field, so what you
 * see is exactly what parses.
 */
export function sanitizeAmountText(value: string): string {
  return value.replace(/[^0-9.-]/g, '');
}

/** The number a sanitized field reads as; `null` while empty or unparsable. */
export function parseAmountText(raw: string): number | null {
  if (raw === '' || raw === '-') return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * A paste carrying a comma alongside another separator is a European decimal
 * comma ("1.234,56") or nonsense ("12,34.5"): stripping the comma would read
 * the first as 1.23456, a hundredfold error, so the change is refused and the
 * field keeps what it had. Plain thousands grouping ("1,234.56", "1,234,567")
 * is unambiguous and still accepted (audit DS-13).
 */
export function hasMixedSeparators(value: string): boolean {
  const numeric = value.replace(/[^0-9.,-]/g, '');
  if (!numeric.includes(',')) return false;
  if (numeric.replace(/[^.,]/g, '').length < 2) return false;
  return !/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(numeric);
}

/**
 * AmountInput - the money field for logging a purchase or setting a limit.
 * Shows the currency symbol, uses a decimal keyboard on mobile, and reports
 * a parsed number via `onValueChange`.
 * @category Forms
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  {
    label,
    currency = 'USD',
    value,
    defaultValue,
    onValueChange,
    onBlur,
    hint,
    error,
    size = 'lg',
    fullWidth = false,
    className,
    id,
    disabled,
    placeholder,
    allowNegative = false,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `bdg-amount-${autoId}`;
  const descId = `${inputId}-desc`;
  const digits = currencyFractionDigits(currency);
  const isControlled = value !== undefined;
  const [inner, setInner] = useState(toText(defaultValue, digits));
  // While the user is typing into a controlled field the raw text lives here,
  // so transient states the number can't represent ("4.", "-", "0.7") survive
  // the value round-trip. Deriving the text from the parsed value on every
  // keystroke destroyed them: "4." parses to 4, re-renders as "4", and typing
  // "4.50" ended up as 450 - the hundredfold error this field exists to avoid.
  const [draft, setDraft] = useState<string | null>(null);
  if (isControlled && draft !== null) {
    const parsed = parseAmountText(draft);
    // A blank or half-typed draft ("", "-", "1.2.") parses to null; a parent
    // that never holds null coerces that to 0 and hands 0 straight back. That
    // is the draft's own value, not an external change, so it survives -
    // otherwise the field could never be emptied and typing after a clear
    // showed "035" (audit DS-4).
    const compatible = sameAmount(parsed, value ?? null) || (parsed === null && value === 0);
    if (!compatible) {
      // The parent moved the value out from under the draft (form reset, a
      // quick-fill chip): the external value wins and the draft is dropped.
      setDraft(null);
    }
  }
  const text = isControlled ? (draft ?? toText(value, digits)) : inner;
  const message = error ?? hint;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (hasMixedSeparators(e.target.value)) return; // refused; React puts the previous text back
    const raw = sanitizeAmountText(e.target.value);
    if (isControlled) setDraft(raw);
    else setInner(raw);
    onValueChange?.(parseAmountText(raw));
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setDraft(null);
    onBlur?.(e);
  };

  return (
    <div
      className={cx(
        'bdg-field',
        'bdg-amount-input',
        `bdg-field--${size}`,
        fullWidth && 'bdg-field--full',
        error && 'bdg-field--error',
        disabled && 'bdg-field--disabled',
        className,
      )}
    >
      <label htmlFor={inputId} className="bdg-field__label">
        {label}
      </label>
      <div className="bdg-field__control">
        <span className="bdg-field__adornment bdg-field__adornment--prefix bdg-amount-input__symbol">{currencySymbol(currency)}</span>
        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode={allowNegative ? 'text' : 'decimal'}
          autoComplete="off"
          className="bdg-field__input bdg-amount-input__input"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder ?? (0).toFixed(digits)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? descId : undefined}
          {...rest}
        />
        <span className="bdg-field__adornment bdg-field__adornment--suffix bdg-amount-input__code">{currency}</span>
      </div>
      {message && (
        <div id={descId} className={cx('bdg-field__message', error && 'bdg-field__message--error')}>
          {message}
        </div>
      )}
    </div>
  );
});
