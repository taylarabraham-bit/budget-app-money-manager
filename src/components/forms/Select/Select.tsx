import { forwardRef, useId, type ChangeEventHandler, type SelectHTMLAttributes } from 'react';
import { cx } from '../../../lib/cx';
import type { Size } from '../../../lib/types';

export interface SelectOption {
  /** Value submitted / reported by onChange. */
  value: string;
  /** Visible label. */
  label: string;
  /** Greys the option out. */
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Visible label above the control. */
  label: string;
  /** Keep the label accessible but not visible (filter bars). */
  hideLabel?: boolean;
  /** Options to choose from (categories, members, accounts). */
  options: SelectOption[];
  /** Placeholder shown while nothing is selected. */
  placeholder?: string;
  /** Helper text under the control. */
  hint?: string;
  /** Error message; turns the control red. */
  error?: string;
  /** Control height: sm 32px, md 40px, lg 48px. */
  size?: Size;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Controlled selected value. */
  value?: string;
  /** Initial value for uncontrolled use. */
  defaultValue?: string;
  /** Change handler (event-based, like a native select). */
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  /** Disables the control. */
  disabled?: boolean;
  /** Marks the field required. */
  required?: boolean;
  /** Form field name. */
  name?: string;
  /**
   * Label of the disabled option shown when the value matches no option - an
   * account or member since removed - so the stale choice is visible instead
   * of the first option standing in for it (audit UX-5 / DS-3). Default "Unknown".
   */
  unknownLabel?: string;
}

/**
 * Select - a labelled native dropdown for picking a category, household
 * member or account. Native so it uses the platform picker on Android.
 * @category Forms
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel = false, options, placeholder, hint, error, size = 'md', fullWidth = false, className, id, disabled, defaultValue, value, unknownLabel = 'Unknown', ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? `bdg-select-${autoId}`;
  const descId = `${selectId}-desc`;
  const message = error ?? hint;
  const uncontrolledDefault = value === undefined && defaultValue === undefined && placeholder ? '' : defaultValue;
  // A value no option carries would make the browser show the first option
  // while the form keeps (and re-saves) the ghost id; a disabled sentinel
  // option holds the value instead so the stale choice can be seen.
  const current = value !== undefined ? value : defaultValue;
  const stale = current !== undefined && !(current === '' && placeholder) && !options.some((o) => o.value === current);
  return (
    <div
      className={cx(
        'bdg-field',
        'bdg-select',
        `bdg-field--${size}`,
        fullWidth && 'bdg-field--full',
        error && 'bdg-field--error',
        disabled && 'bdg-field--disabled',
        className,
      )}
    >
      <label htmlFor={selectId} className={cx('bdg-field__label', hideLabel && 'bdg-sr-only')}>
        {label}
      </label>
      <div className="bdg-field__control">
        <select
          ref={ref}
          id={selectId}
          className="bdg-field__input bdg-select__native"
          disabled={disabled}
          value={value}
          defaultValue={uncontrolledDefault}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? descId : undefined}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {stale && (
            <option value={current} disabled>
              {unknownLabel}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="bdg-select__chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8l4 4 4-4" />
          </svg>
        </span>
      </div>
      {message && (
        <div id={descId} className={cx('bdg-field__message', error && 'bdg-field__message--error')}>
          {message}
        </div>
      )}
    </div>
  );
});
