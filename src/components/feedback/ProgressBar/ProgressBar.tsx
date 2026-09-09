import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import type { MemberColor, Tone } from '../../../lib/types';

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Current value (0..max). Values above `max` render full with the overflow state. */
  value: number;
  /** Scale end. Default 100. */
  max?: number;
  /** Bar colour: a status tone, `primary`, or a member colour for per-person bars. */
  tone?: Tone | 'primary' | MemberColor;
  /** Bar thickness: sm 4px, md 8px, lg 12px. */
  size?: 'sm' | 'md' | 'lg';
  /** Text label rendered above the bar (left). */
  label?: ReactNode;
  /** Text rendered above the bar (right), e.g. "42%" or "$120 left". */
  valueLabel?: ReactNode;
  /** Animated stripe while the value is unknown. */
  indeterminate?: boolean;
}

/**
 * ProgressBar - a horizontal fill showing how much of a budget, goal or
 * period has been used. BudgetBar and GoalCard build on it; use it directly
 * for anything else.
 * @category Feedback
 */
export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  size = 'md',
  label,
  valueLabel,
  indeterminate = false,
  className,
  // The naming props belong on the element that carries role="progressbar",
  // not on the wrapper: spread with the rest they landed on an unlabelled div
  // and every caller's carefully built aria-label was announced by nothing.
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const ratio = Number.isFinite(value) ? value / safeMax : 0;
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const over = ratio > 1;
  // Reported like the fill is drawn: never "NaN" or a value under aria-valuemin (audit DS-8).
  const now = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, safeMax));
  const hasHeader = label != null || valueLabel != null;
  return (
    <div
      className={cx('bdg-progress', `bdg-progress--${size}`, `bdg-progress--${tone}`, over && 'bdg-progress--over', indeterminate && 'bdg-progress--indeterminate', className)}
      {...rest}
    >
      {hasHeader && (
        <div className="bdg-progress__header">
          {label != null && <span className="bdg-progress__label">{label}</span>}
          {valueLabel != null && <span className="bdg-progress__value">{valueLabel}</span>}
        </div>
      )}
      <div
        className="bdg-progress__track"
        role="progressbar"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={indeterminate ? undefined : now}
      >
        <div className="bdg-progress__fill" style={indeterminate ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  );
}
