import { forwardRef, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'value'> {
  /** Label next to the toggle. */
  label: ReactNode;
  /** Secondary line under the label. */
  description?: ReactNode;
  /** Controlled on/off state. */
  checked?: boolean;
  /** Initial state for uncontrolled use. */
  defaultChecked?: boolean;
  /** Called with the next state when toggled. */
  onCheckedChange?: (checked: boolean) => void;
  /** Toggle size. */
  size?: 'sm' | 'md';
  /** Put the toggle before the label instead of after it. */
  labelPosition?: 'start' | 'end';
  /** Disables the toggle. */
  disabled?: boolean;
}

/**
 * Switch - an on/off toggle for settings and preferences ("Shared with
 * household", "Daily reminder"). Use Checkbox for list selection.
 * @category Forms
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    label,
    description,
    checked,
    defaultChecked = false,
    onCheckedChange,
    size = 'md',
    labelPosition = 'end',
    className,
    id,
    disabled,
    onClick,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const buttonId = id ?? `bdg-switch-${autoId}`;
  // The name is the label alone; the description is announced after it, so a
  // 25-word setting is not read out as one run-on name (audit UI-21).
  const labelId = `${buttonId}-label`;
  const descId = `${buttonId}-desc`;
  const isControlled = checked !== undefined;
  const [inner, setInner] = useState(defaultChecked);
  const on = isControlled ? Boolean(checked) : inner;
  return (
    <div
      className={cx(
        'bdg-switch',
        `bdg-switch--${size}`,
        labelPosition === 'start' && 'bdg-switch--label-start',
        disabled && 'bdg-switch--disabled',
        className,
      )}
    >
      <button
        ref={ref}
        id={buttonId}
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        className={cx('bdg-switch__track', on && 'bdg-switch__track--on')}
        disabled={disabled}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          const next = !on;
          if (!isControlled) setInner(next);
          onCheckedChange?.(next);
        }}
        {...rest}
      >
        <span className="bdg-switch__thumb" aria-hidden="true" />
      </button>
      <label htmlFor={buttonId} className="bdg-switch__text">
        <span id={labelId} className="bdg-switch__label">
          {label}
        </span>
        {description && (
          <span id={descId} className="bdg-switch__description">
            {description}
          </span>
        )}
      </label>
    </div>
  );
});
