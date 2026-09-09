import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { formatMoney } from '../../../lib/format';

export interface TrendPoint {
  /** Axis label under the bar: "Mon", "12", "Wk 3". */
  label: string;
  /** Bar value (money by default). Negative values render as a bar below the baseline. */
  value: number;
}

export interface TrendBarsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** One entry per bar, oldest first. 5-14 bars read best. */
  data: TrendPoint[];
  /** Index of the bar to emphasise (defaults to the last one - today). `null` for none. */
  highlightIndex?: number | null;
  /** ISO currency code used by the default value formatter. Default "USD". */
  currency?: string;
  /** Override how values are written (for non-money data). */
  formatValue?: (value: number) => string;
  /** Bar colour. `primary` (default), `positive`, `negative`, `accent`. */
  tone?: 'primary' | 'positive' | 'negative' | 'accent';
  /** Chart height in px (bars area only). Default 96. */
  height?: number;
  /** Draw a dashed reference line at this value (a daily target, an average). */
  reference?: number;
  /** Label for the reference line, e.g. "Goal". */
  referenceLabel?: ReactNode;
  /** Print the highlighted bar's value above it. Default true. */
  showValue?: boolean;
}

/**
 * TrendBars - a small bar chart for the last N days/weeks of earnings or
 * spend, with an optional target line. Pure CSS; no charting library.
 * @category Finance
 */
export function TrendBars({
  data,
  highlightIndex,
  currency = 'USD',
  formatValue,
  tone = 'primary',
  height = 96,
  reference,
  referenceLabel,
  showValue = true,
  className,
  ...rest
}: TrendBarsProps) {
  const fmt = formatValue ?? ((v: number) => formatMoney(v, { currency, wholeOnly: Number.isInteger(v) || Math.abs(v) >= 100 }));
  const hi = highlightIndex === undefined ? data.length - 1 : highlightIndex;
  const values = data.map((d) => (Number.isFinite(d.value) ? d.value : 0));
  const maxAbs = Math.max(1, ...values.map(Math.abs), reference != null ? Math.abs(reference) : 0);
  const hasNegative = values.some((v) => v < 0);
  const refPct = reference != null ? (Math.abs(reference) / maxAbs) * 100 : null;
  return (
    <div className={cx('bdg-trend', `bdg-trend--${tone}`, hasNegative && 'bdg-trend--bipolar', className)} role="img" aria-label={`${data.length} bars, ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}`} {...rest}>
      <div className="bdg-trend__plot" style={{ height }}>
        {refPct != null && (
          <div className="bdg-trend__reference" style={{ bottom: `${hasNegative ? 50 + refPct / 2 : refPct}%` }}>
            {referenceLabel != null && <span className="bdg-trend__reference-label">{referenceLabel}</span>}
          </div>
        )}
        {data.map((d, i) => {
          const v = values[i] ?? 0;
          const pct = (Math.abs(v) / maxAbs) * (hasNegative ? 50 : 100);
          const active = i === hi;
          return (
            <div key={`${d.label}-${i}`} className={cx('bdg-trend__col', active && 'bdg-trend__col--active', v < 0 && 'bdg-trend__col--negative')}>
              {showValue && active && <span className="bdg-trend__value">{fmt(v)}</span>}
              <div
                className="bdg-trend__bar"
                style={hasNegative ? (v < 0 ? { top: '50%', height: `${pct}%` } : { bottom: '50%', height: `${pct}%` }) : { height: `${Math.max(pct, v === 0 ? 2 : 0)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="bdg-trend__axis">
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`} className={cx('bdg-trend__label', i === hi && 'bdg-trend__label--active')}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
