import type { HTMLAttributes } from 'react';
import { cx } from '../../../lib/cx';
import { formatMoney, moneyDisplayValue, splitMoney } from '../../../lib/format';

export interface AmountProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The money value. Negative numbers are expenses/outflows. */
  value: number;
  /** ISO 4217 currency code. Default "USD". */
  currency?: string;
  /** BCP 47 locale for formatting. Default "en-US". */
  locale?: string;
  /**
   * Colour. `auto` (default) colours positive values green and negative red;
   * `neutral` keeps the text colour for balances and totals; `positive`/`negative` force a colour.
   */
  tone?: 'auto' | 'neutral' | 'positive' | 'negative' | 'muted';
  /** Sign rendering. `exceptZero` shows "+" on income. Default "auto". */
  signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
  /** Type scale: sm 14, md 16, lg 22, xl 28, display 36px. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'display';
  /** Font weight. Default semibold for lg+ and medium below. */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Hide the cents ("$1,240" instead of "$1,240.00"). */
  wholeOnly?: boolean;
  /** Abbreviate large values ("$12.4K"). */
  compact?: boolean;
  /** Strike the value through (voided / refunded). */
  struck?: boolean;
}

/**
 * Amount - the one way money is rendered: locale currency formatting,
 * tabular digits, smaller cents, and a green/red tone for income/expense.
 * @category Finance
 */
export function Amount({
  value,
  currency = 'USD',
  locale = 'en-US',
  tone = 'auto',
  signDisplay = 'auto',
  size = 'md',
  weight,
  wholeOnly = false,
  compact = false,
  struck = false,
  className,
  ...rest
}: AmountProps) {
  // Tone follows what is printed: sub-half-cent dust reads "$0.00" and must not be coloured (audit DS-6).
  const shown = moneyDisplayValue(value, { currency, wholeOnly, compact });
  const resolvedTone = tone === 'auto' ? (shown > 0 ? 'positive' : shown < 0 ? 'negative' : 'neutral') : tone;
  const resolvedWeight = weight ?? (size === 'sm' || size === 'md' ? 'medium' : 'semibold');
  const text = formatMoney(value, { currency, locale, signDisplay, wholeOnly, compact });
  const parts = compact ? null : splitMoney(value, { currency, locale, signDisplay, wholeOnly });
  return (
    <span
      className={cx('bdg-amount', `bdg-amount--${size}`, `bdg-amount--${resolvedTone}`, `bdg-amount--${resolvedWeight}`, struck && 'bdg-amount--struck', className)}
      aria-label={text}
      title={text}
      {...rest}
    >
      {parts ? (
        <>
          {parts.sign && <span className="bdg-amount__sign">{parts.sign}</span>}
          <span className="bdg-amount__whole">{parts.whole}</span>
          {parts.fraction && <span className="bdg-amount__fraction">{parts.fraction}</span>}
        </>
      ) : (
        text
      )}
    </span>
  );
}
