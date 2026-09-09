import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Screen title, e.g. "Overview" or "Groceries". */
  title: ReactNode;
  /** Line under the title: a period ("August 2026"), a member name, a count. */
  subtitle?: ReactNode;
  /** Small label above the title ("Household", "Goal"). */
  eyebrow?: ReactNode;
  /** Renders a back arrow that calls this handler. */
  onBack?: () => void;
  /** Accessible label for the back control. Default "Back". */
  backLabel?: string;
  /** Leading slot before the title (an Avatar for personal screens). */
  leading?: ReactNode;
  /** Right-aligned actions (a Button, a MemberChip, an icon button). */
  actions?: ReactNode;
  /** Larger title for top-level screens. */
  size?: 'md' | 'lg';
}

/**
 * PageHeader - the title bar at the top of every screen, with optional back
 * navigation, eyebrow, subtitle and right-aligned actions.
 * @category Layout
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  backLabel = 'Back',
  leading,
  actions,
  size = 'md',
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <header className={cx('bdg-page-header', `bdg-page-header--${size}`, className)} {...rest}>
      {onBack && (
        <button type="button" className="bdg-page-header__back" onClick={onBack} aria-label={backLabel}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12.5 4.5L7 10l5.5 5.5" />
          </svg>
        </button>
      )}
      {leading != null && <div className="bdg-page-header__leading">{leading}</div>}
      <div className="bdg-page-header__text">
        {eyebrow != null && <div className="bdg-page-header__eyebrow">{eyebrow}</div>}
        <h1 className="bdg-page-header__title">{title}</h1>
        {subtitle != null && <div className="bdg-page-header__subtitle">{subtitle}</div>}
      </div>
      {actions != null && <div className="bdg-page-header__actions">{actions}</div>}
    </header>
  );
}
