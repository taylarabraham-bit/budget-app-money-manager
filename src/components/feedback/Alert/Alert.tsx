import type { AriaRole, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Meaning and colour: `info` neutral notice, `success` saved/achieved, `warning` nearing a limit, `danger` over budget or failed. */
  tone?: 'info' | 'success' | 'warning' | 'danger';
  /** Bold first line. */
  title?: ReactNode;
  /** Body text. */
  children?: ReactNode;
  /** Action slot rendered after the text (a ghost Button). */
  action?: ReactNode;
  /** Renders a close control that calls this handler. */
  onDismiss?: () => void;
  /** Replace the default tone icon. */
  icon?: ReactNode;
  /**
   * ARIA role. Warning and danger alerts default to `alert` (announced at once)
   * and the rest to `status`; pass `note` for explanatory text that is part of
   * a dialog, so it does not interrupt the title being read (audit UI-22).
   */
  role?: AriaRole;
}

const ICONS: Record<NonNullable<AlertProps['tone']>, ReactNode> = {
  info: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.5v.5" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.5 10.5l2.5 2.5 4.5-5" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3.5l7 12.5H3l7-12.5z" />
      <path d="M10 8.5v3.5M10 14.2v.3" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
    </svg>
  ),
};

/**
 * Alert - an inline message tied to the content around it: "You're $40
 * over on Dining this month", "Goal reached". Not a toast; it stays put.
 * @category Feedback
 */
export function Alert({ tone = 'info', title, children, action, onDismiss, icon, role, className, ...rest }: AlertProps) {
  return (
    <div className={cx('bdg-alert', `bdg-alert--${tone}`, className)} role={role ?? (tone === 'danger' || tone === 'warning' ? 'alert' : 'status')} {...rest}>
      <span className="bdg-alert__icon" aria-hidden="true">
        {icon ?? ICONS[tone]}
      </span>
      <div className="bdg-alert__content">
        {title != null && <div className="bdg-alert__title">{title}</div>}
        {children != null && <div className="bdg-alert__body">{children}</div>}
        {action != null && <div className="bdg-alert__action">{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="bdg-alert__dismiss" onClick={onDismiss} aria-label="Dismiss">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}
