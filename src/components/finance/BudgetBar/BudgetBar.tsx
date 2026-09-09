import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { formatMoney, formatMoneyAuto } from '../../../lib/format';
import type { MemberColor } from '../../../lib/types';
import { ProgressBar } from '../../feedback/ProgressBar/ProgressBar';

export interface BudgetBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onClick'> {
  /** Budget category name: "Groceries", "Transport". */
  category: ReactNode;
  /** Amount spent so far in the period. */
  spent: number;
  /** The limit for the period. Pass 0 for a category with no limit - the bar shows spend only and never reads as over. */
  limit: number;
  /** ISO currency code. Default "USD". */
  currency?: string;
  /** Category accent colour. Default `primary`. */
  color?: 'primary' | MemberColor;
  /** Emoji or icon for the category, shown in a tinted square. */
  icon?: ReactNode;
  /** Period hint under the category: "Aug 1-31", "This week". */
  period?: ReactNode;
  /** What the right-hand figure shows: money `left` (default) or `spent`. */
  show?: 'left' | 'spent';
  /** Fraction of the limit at which the bar turns amber. Default 0.85. */
  warnAt?: number;
  /** Makes the row tappable (opens the category). */
  onClick?: () => void;
}

/**
 * BudgetBar - one category's spend against its limit: name, icon, amounts
 * and a progress bar that turns amber near the limit and red over it.
 * Stack them for the budget overview.
 * @category Finance
 */
export function BudgetBar({
  category,
  spent,
  limit,
  currency = 'USD',
  color = 'primary',
  icon,
  period,
  show = 'left',
  warnAt = 0.85,
  onClick,
  className,
  ...rest
}: BudgetBarProps) {
  // Cents, not floats: purchases summing to 100.30000000000001 against a $100.30
  // limit are exactly AT the limit, never "$0.00 over" (matches the selectors).
  const centsSpent = Math.round(spent * 100);
  const centsLimit = Math.round(limit * 100);
  const unlimited = centsLimit <= 0;
  const safeLimit = unlimited ? 0 : limit;
  const ratio = unlimited ? 0 : centsSpent / centsLimit;
  const over = !unlimited && centsSpent > centsLimit;
  const warn = !unlimited && !over && ratio >= warnAt;
  const left = (centsLimit - centsSpent) / 100;
  const tone = over ? 'negative' : warn ? 'warning' : color;
  const figure = unlimited
    ? `${formatMoneyAuto(spent, { currency })} spent`
    : over
      ? `${formatMoneyAuto(Math.abs(left), { currency })} over`
      : show === 'left'
        ? `${formatMoneyAuto(left, { currency })} left`
        : `${formatMoneyAuto(spent, { currency })} spent`;
  const classes = cx(
    'bdg-budget-bar',
    `bdg-budget-bar--${color}`,
    over && 'bdg-budget-bar--over',
    warn && 'bdg-budget-bar--warn',
    onClick && 'bdg-budget-bar--button',
    className,
  );
  const content = (
    <>
      {icon != null && (
        <span className="bdg-budget-bar__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="bdg-budget-bar__main">
        <div className="bdg-budget-bar__row">
          <span className="bdg-budget-bar__category">
            <span className="bdg-budget-bar__name">{category}</span>
            {period != null && <span className="bdg-budget-bar__period">{period}</span>}
          </span>
          <span className={cx('bdg-budget-bar__figure', over && 'bdg-budget-bar__figure--over')}>{figure}</span>
        </div>
        <ProgressBar
          value={unlimited ? 0 : spent}
          max={safeLimit || 1}
          tone={tone}
          size="sm"
          aria-label={unlimited ? `${formatMoney(spent, { currency })} spent, no monthly limit` : `${formatMoney(spent, { currency })} of ${formatMoney(safeLimit, { currency })}`}
        />
        <div className="bdg-budget-bar__meta">
          <span>{unlimited ? 'No monthly limit' : `${formatMoneyAuto(spent, { currency })} of ${formatMoneyAuto(safeLimit, { currency })}`}</span>
          <span>{unlimited ? '' : `${Math.round(Math.min(ratio, 9.99) * 100)}%`}</span>
        </div>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} {...(rest as HTMLAttributes<HTMLButtonElement>)}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} {...rest}>
      {content}
    </div>
  );
}
