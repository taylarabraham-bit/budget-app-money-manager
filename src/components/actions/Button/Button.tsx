import { forwardRef, type ButtonHTMLAttributes, type MouseEventHandler, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import type { Size } from '../../../lib/types';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * Visual emphasis. `primary` for the one main action on a screen,
   * `secondary` for supporting actions, `ghost` for low-emphasis inline
   * actions, `danger` for destructive ones (delete a transaction, leave a household).
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Control height: sm 32px, md 40px, lg 48px. Use `lg` for the main mobile action. */
  size?: Size;
  /** Shows a spinner and disables the button while something saves. */
  loading?: boolean;
  /** Stretch to the container width (mobile primary actions, dialog footers). */
  fullWidth?: boolean;
  /** Icon placed before the label (16-20px SVG or emoji). */
  iconStart?: ReactNode;
  /** Icon placed after the label. */
  iconEnd?: ReactNode;
  /** Button label. */
  children?: ReactNode;
  /** Disables the control. */
  disabled?: boolean;
  /** Click handler. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Button - the action control. One `primary` per screen ("Log purchase",
 * "Save goal"); use `secondary`/`ghost` for everything else and `danger`
 * only for destructive actions.
 * @category Actions
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    iconStart,
    iconEnd,
    className,
    disabled,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'bdg-button',
        `bdg-button--${variant}`,
        `bdg-button--${size}`,
        fullWidth && 'bdg-button--full',
        loading && 'bdg-button--loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="bdg-button__spinner" aria-hidden="true" />}
      {iconStart && <span className="bdg-button__icon" aria-hidden="true">{iconStart}</span>}
      {children != null && <span className="bdg-button__label">{children}</span>}
      {iconEnd && <span className="bdg-button__icon" aria-hidden="true">{iconEnd}</span>}
    </button>
  );
});
