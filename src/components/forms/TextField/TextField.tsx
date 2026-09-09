import { forwardRef, useId, type ChangeEventHandler, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import type { Size } from '../../../lib/types';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** Visible label above the field. Always provide one; use `hideLabel` to keep it for screen readers only. */
  label: string;
  /** Keep the label accessible but not visible (search boxes, inline edits). */
  hideLabel?: boolean;
  /** Helper text under the field. */
  hint?: string;
  /** Error message; turns the field red and replaces the hint. */
  error?: string;
  /** Adornment inside the field, before the text (currency symbol, icon). */
  prefix?: ReactNode;
  /** Adornment inside the field, after the text (unit, clear button). */
  suffix?: ReactNode;
  /** Control height: sm 32px, md 40px, lg 48px. */
  size?: Size;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Controlled value. */
  value?: string;
  /** Initial value for uncontrolled use. */
  defaultValue?: string;
  /** Change handler (event-based, like a native input). */
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Placeholder shown while empty. */
  placeholder?: string;
  /** Input type. Default "text". Use AmountInput for money. */
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'date' | 'time' | 'number';
  /** Disables the field. */
  disabled?: boolean;
  /** Marks the field required. */
  required?: boolean;
  /** Form field name. */
  name?: string;
}

/**
 * TextField - a labelled single-line input with hint, error and in-field
 * prefix/suffix adornments. Use AmountInput for money.
 * @category Forms
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel = false, hint, error, prefix, suffix, size = 'md', fullWidth = false, className, id, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `bdg-field-${autoId}`;
  const descId = `${inputId}-desc`;
  const message = error ?? hint;
  return (
    <div
      className={cx(
        'bdg-field',
        `bdg-field--${size}`,
        fullWidth && 'bdg-field--full',
        error && 'bdg-field--error',
        disabled && 'bdg-field--disabled',
        className,
      )}
    >
      <label htmlFor={inputId} className={cx('bdg-field__label', hideLabel && 'bdg-sr-only')}>
        {label}
      </label>
      <div className="bdg-field__control">
        {prefix != null && <span className="bdg-field__adornment bdg-field__adornment--prefix">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className="bdg-field__input"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? descId : undefined}
          {...rest}
        />
        {suffix != null && <span className="bdg-field__adornment bdg-field__adornment--suffix">{suffix}</span>}
      </div>
      {message && (
        <div id={descId} className={cx('bdg-field__message', error && 'bdg-field__message--error')}>
          {message}
        </div>
      )}
    </div>
  );
});
