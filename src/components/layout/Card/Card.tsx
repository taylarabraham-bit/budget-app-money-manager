import { forwardRef, type HTMLAttributes, type MouseEventHandler, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional heading rendered in the card header. */
  title?: ReactNode;
  /**
   * Heading level for `title` (2-4). Cards are the sections of a screen, so
   * the title is a real heading that screen-reader navigation lands on: h3 by
   * default, h2 for top-level cards under a PageHeader (audit UI-27).
   */
  headingLevel?: 2 | 3 | 4;
  /** Smaller line under the title. */
  subtitle?: ReactNode;
  /** Right-aligned header slot (a ghost Button, a Badge, a menu). */
  actions?: ReactNode;
  /** Footer slot, separated by a hairline (totals, secondary actions). */
  footer?: ReactNode;
  /** Inner padding. `none` for edge-to-edge lists. Default `md`. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Raise the card with a shadow instead of a border. */
  elevated?: boolean;
  /** Hover/pressed affordance for tappable cards. Pair with `onClick`. */
  interactive?: boolean;
  /** Card body. */
  children?: ReactNode;
  /** Tap handler; set `interactive` too so the card shows hover/pressed states. */
  onClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * Card - the surface that groups related content on a screen: a budget
 * category, a goal, a summary block. Header, body and footer slots.
 * @category Layout
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { title, headingLevel = 3, subtitle, actions, footer, padding = 'md', elevated = false, interactive = false, className, children, onClick, onKeyDown, ...rest },
  ref,
) {
  const hasHeader = title != null || subtitle != null || actions != null;
  const activatable = interactive && onClick != null;
  const Heading: 'h2' | 'h3' | 'h4' = `h${headingLevel}`;
  return (
    <div
      ref={ref}
      className={cx(
        'bdg-card',
        `bdg-card--pad-${padding}`,
        elevated && 'bdg-card--elevated',
        interactive && 'bdg-card--interactive',
        className,
      )}
      tabIndex={activatable ? 0 : undefined}
      role={activatable ? 'button' : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        // A tappable card works from the keyboard like the button it claims to be (audit DS-11).
        if (!activatable || e.defaultPrevented || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        e.currentTarget.click();
      }}
      {...rest}
    >
      {hasHeader && (
        <div className="bdg-card__header">
          <div className="bdg-card__heading">
            {title != null && <Heading className="bdg-card__title">{title}</Heading>}
            {subtitle != null && <div className="bdg-card__subtitle">{subtitle}</div>}
          </div>
          {actions != null && <div className="bdg-card__actions">{actions}</div>}
        </div>
      )}
      {children != null && <div className="bdg-card__body">{children}</div>}
      {footer != null && <div className="bdg-card__footer">{footer}</div>}
    </div>
  );
});
