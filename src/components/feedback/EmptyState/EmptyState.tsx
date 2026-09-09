import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Illustration slot: an emoji, an SVG, or an Avatar. Rendered in a tinted circle. */
  icon?: ReactNode;
  /** One short line saying what is empty: "No purchases yet". */
  title: ReactNode;
  /** What to do about it: "Log your first purchase to start tracking today's spend." */
  description?: ReactNode;
  /** Primary call to action (a Button). */
  action?: ReactNode;
  /** Tighter padding for use inside cards. */
  compact?: boolean;
}

/**
 * EmptyState - the friendly placeholder for a list or screen with nothing
 * in it yet, with a clear next step. Every list in the app should have one.
 * @category Feedback
 */
export function EmptyState({ icon, title, description, action, compact = false, className, ...rest }: EmptyStateProps) {
  return (
    <div className={cx('bdg-empty', compact && 'bdg-empty--compact', className)} {...rest}>
      {icon != null && (
        <div className="bdg-empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="bdg-empty__title">{title}</div>
      {description != null && <div className="bdg-empty__description">{description}</div>}
      {action != null && <div className="bdg-empty__action">{action}</div>}
    </div>
  );
}
