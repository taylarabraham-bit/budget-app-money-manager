import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface BottomNavItem {
  /** Value reported by onChange. */
  value: string;
  /** Short label under the icon (one word). */
  label: string;
  /** 24px icon (SVG) or emoji. */
  icon: ReactNode;
  /** Count bubble on the icon (e.g. pending items). */
  badge?: number;
  /** What the count means, for the item's accessible name ("3 to confirm"). Default "<badge> pending" (audit UI-13). */
  badgeLabel?: string;
}

export interface BottomNavProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  /** Destinations, left to right. 3-5 items. */
  items: BottomNavItem[];
  /** Currently active value. */
  value: string;
  /** Called with the tapped item's value. */
  onChange?: (value: string) => void;
  /** Pin the bar to the bottom of the viewport (real app). Default false so it flows inline in previews and desktop layouts. */
  fixed?: boolean;
  /** Central raised action (the "+" that logs a purchase). */
  action?: { label: string; icon: ReactNode; onClick?: () => void };
}

/**
 * BottomNav - the mobile (Android) bottom navigation bar: 3-5 destinations
 * plus an optional raised centre action for logging a purchase.
 * @category Navigation
 */
export function BottomNav({ items, value, onChange, fixed = false, action, className, ...rest }: BottomNavProps) {
  const mid = Math.ceil(items.length / 2);
  const renderItem = (item: BottomNavItem) => {
    const active = item.value === value;
    const badge = typeof item.badge === 'number' && item.badge > 0 ? item.badge : 0;
    return (
      <button
        key={item.value}
        type="button"
        className={cx('bdg-bottom-nav__item', active && 'bdg-bottom-nav__item--active')}
        aria-current={active ? 'page' : undefined}
        // The badge sits inside the aria-hidden icon, so the count has to reach the name itself.
        aria-label={badge ? `${item.label}, ${item.badgeLabel ?? `${badge} pending`}` : undefined}
        onClick={() => onChange?.(item.value)}
      >
        <span className="bdg-bottom-nav__icon" aria-hidden="true">
          {item.icon}
          {badge > 0 && <span className="bdg-bottom-nav__badge">{badge > 99 ? '99+' : badge}</span>}
        </span>
        <span className="bdg-bottom-nav__label">{item.label}</span>
      </button>
    );
  };
  return (
    <nav className={cx('bdg-bottom-nav', fixed && 'bdg-bottom-nav--fixed', action && 'bdg-bottom-nav--with-action', className)} aria-label="Primary" {...rest}>
      {action ? (
        // Two equal halves either side of a fixed-width action slot keep the
        // "+" on the centre line whatever the item count; five destinations put
        // three in the left half rather than nudging the "+" to 58% (audit DS-10).
        <>
          <div className="bdg-bottom-nav__group">{items.slice(0, mid).map(renderItem)}</div>
          <div className="bdg-bottom-nav__action-slot">
            <button type="button" className="bdg-bottom-nav__action" onClick={action.onClick} aria-label={action.label}>
              <span aria-hidden="true">{action.icon}</span>
            </button>
          </div>
          <div className="bdg-bottom-nav__group">{items.slice(mid).map(renderItem)}</div>
        </>
      ) : (
        items.map(renderItem)
      )}
    </nav>
  );
}
