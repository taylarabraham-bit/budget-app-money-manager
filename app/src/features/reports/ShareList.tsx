import type { ReactNode } from 'react';
import { ProgressBar, formatPercent, type MemberColor } from '@budget-app/ui';

export interface ShareRow {
  id: string;
  label: ReactNode;
  value: number;
  /** The whole (the bar fills value/max). */
  max: number;
  tone?: 'primary' | MemberColor;
  valueLabel: ReactNode;
  /** Secondary line under the bar. */
  sub?: ReactNode;
  /** Fraction vs last month; renders as a coloured ±% (spend up = negative tone). */
  vsLastMonth?: number | null;
  /** Whether an increase is bad (spend) or good (income). */
  higherIsWorse?: boolean;
}

/** Rows of "share of the whole" bars - categories by spend, people by what they paid. */
export function ShareList({ rows }: { rows: ShareRow[] }) {
  return (
    <div className="share-list">
      {rows.map((row) => {
        const delta = row.vsLastMonth;
        const up = delta != null && delta > 0;
        const worse = row.higherIsWorse ?? true;
        return (
          <div key={row.id} className="share-row">
            <ProgressBar size="sm" label={row.label} value={row.value} max={row.max || 1} tone={row.tone ?? 'primary'} valueLabel={row.valueLabel} />
            {(row.sub || delta !== undefined) && (
              <div className="share-row__sub bdg-text-xs bdg-text-muted">
                {row.sub}
                {delta !== undefined && (
                  <span className={delta == null ? '' : (up ? worse : !worse) ? 'bdg-text-negative' : 'bdg-text-positive'}>
                    {row.sub ? ' · ' : ''}
                    {delta == null ? 'new this month' : `${up ? '+' : ''}${formatPercent(delta)} vs last month`}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
