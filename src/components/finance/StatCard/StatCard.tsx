import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { Amount } from '../Amount/Amount';

export interface StatCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What the number is: "Today's earnings", "Spent this week", "Safe to spend". */
  label: ReactNode;
  /** The money value. Use `valueText` instead for non-money stats. */
  value?: number;
  /** Pre-formatted value for non-money stats ("14 days", "3 goals"). */
  valueText?: ReactNode;
  /** ISO currency code for `value`. Default "USD". */
  currency?: string;
  /** Change versus the comparison period as a fraction (0.12 = +12%). Renders a coloured arrow + percent. */
  change?: number;
  /** Text after the change: "vs yesterday", "vs last week". */
  changeLabel?: ReactNode;
  /**
   * Whether a rising number is good. `spend` inverts the colours so rising
   * spend reads as negative. Default `earn`.
   */
  direction?: 'earn' | 'spend';
  /** Extra line under the value ("Goal: $200/day"). */
  caption?: ReactNode;
  /** Icon or emoji in the top-right corner. */
  icon?: ReactNode;
  /** Colour emphasis of the value: `neutral` (default) keeps text colour, `auto` colours by sign, `primary` uses the brand colour. */
  tone?: 'neutral' | 'auto' | 'primary';
  /** Smaller value for dense grids. */
  compact?: boolean;
  /** Hide cents on the value. */
  wholeOnly?: boolean;
}

/**
 * StatCard - a headline number with its label and change: today's
 * earnings, this week's spend, money left in the budget. Place 2-4 in a
 * grid at the top of an overview screen.
 * @category Finance
 */
export function StatCard({
  label,
  value,
  valueText,
  currency = 'USD',
  change,
  changeLabel,
  direction = 'earn',
  caption,
  icon,
  tone = 'neutral',
  compact = false,
  wholeOnly = false,
  className,
  ...rest
}: StatCardProps) {
  const hasChange = typeof change === 'number' && Number.isFinite(change);
  const pct = hasChange ? Math.abs(change * 100) : 0;
  const pctText = Number.isInteger(Number(pct.toFixed(1))) ? pct.toFixed(0) : pct.toFixed(1);
  // A change that prints as zero is flat whichever side of zero it fell: no
  // "+0%" with a green arrow for 0.04%, and an exact 0 is flat, not "good" (audit MF-14).
  const flat = hasChange && (change === 0 || Number(pctText) === 0);
  const good = hasChange && !flat ? (direction === 'earn' ? change > 0 : change < 0) : false;
  const changeText = hasChange ? `${flat ? '' : change > 0 ? '+' : '-'}${pctText}%` : null;
  return (
    <div className={cx('bdg-stat', compact && 'bdg-stat--compact', `bdg-stat--${tone}`, className)} {...rest}>
      <div className="bdg-stat__top">
        <span className="bdg-stat__label">{label}</span>
        {icon != null && (
          <span className="bdg-stat__icon" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className="bdg-stat__value">
        {valueText != null ? (
          <span className="bdg-stat__value-text">{valueText}</span>
        ) : (
          <Amount
            value={value ?? 0}
            currency={currency}
            tone={tone === 'auto' ? 'auto' : tone === 'primary' ? 'neutral' : 'neutral'}
            size={compact ? 'lg' : 'xl'}
            weight="bold"
            wholeOnly={wholeOnly}
          />
        )}
      </div>
      {(hasChange || caption != null) && (
        <div className="bdg-stat__foot">
          {hasChange && (
            <span className={cx('bdg-stat__change', flat ? 'bdg-stat__change--flat' : good ? 'bdg-stat__change--good' : 'bdg-stat__change--bad')}>
              <svg className="bdg-stat__arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {flat ? <path d="M2.5 6h7" /> : change > 0 ? <path d="M6 9.5V2.5M2.5 6L6 2.5 9.5 6" /> : <path d="M6 2.5v7M2.5 6L6 9.5 9.5 6" />}
              </svg>
              {changeText}
            </span>
          )}
          {changeLabel != null && <span className="bdg-stat__change-label">{changeLabel}</span>}
          {caption != null && <span className="bdg-stat__caption">{caption}</span>}
        </div>
      )}
    </div>
  );
}
