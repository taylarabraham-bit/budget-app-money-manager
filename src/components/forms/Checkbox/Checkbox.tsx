import { forwardRef, useId, type ChangeEventHandler, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Label next to the box. */
  label: ReactNode;
  /** Secondary line under the label. */
  description?: ReactNode;
  /** Error message shown under the control. */
  error?: string;
  /** Controlled checked state. */
  checked?: boolean;
  /** Initial state for uncontrolled use. */
  defaultChecked?: boolean;
  /** Change handler (event-based, like a native checkbox). */
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Disables the control. */
  disabled?: boolean;
  /** Form field name. */
  name?: string;
  /** Form value when checked. */
  value?: string;
}

/**
 * Checkbox - a labelled tick box for multi-select lists and confirmations
 * ("Split with household", "Mark as recurring").
 * @category Forms
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, error, className, id, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `bdg-checkbox-${autoId}`;
  return (
    <div className={cx('bdg-checkbox', disabled && 'bdg-checkbox--disabled', error && 'bdg-checkbox--error', className)}>
      <label htmlFor={inputId} className="bdg-checkbox__row">
        <span className="bdg-checkbox__box">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            className="bdg-checkbox__input"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            {...rest}
          />
          <svg
            className="bdg-checkbox__mark"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3.5 8.5l3 3 6-6.5" />
          </svg>
        </span>
        <span className="bdg-checkbox__text">
          <span className="bdg-checkbox__label">{label}</span>
          {description && <span className="bdg-checkbox__description">{description}</span>}
        </span>
      </label>
      {error && <div className="bdg-field__message bdg-field__message--error">{error}</div>}
    </div>
  );
});
