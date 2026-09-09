import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { formatMoney, formatPercent } from '../../../lib/format';
import type { Member } from '../../../lib/types';
import { Avatar } from '../../household/Avatar/Avatar';
import { Badge } from '../../feedback/Badge/Badge';
import { ProgressBar } from '../../feedback/ProgressBar/ProgressBar';

export interface GoalCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onClick'> {
  /** Goal name: "Holiday fund", "New laptop", "Emergency savings". */
  name: ReactNode;
  /** Target amount. */
  target: number;
  /** Amount saved so far. */
  saved: number;
  /** ISO currency code. Default "USD". */
  currency?: string;
  /** Emoji or icon shown in the tinted square. */
  icon?: ReactNode;
  /** Human deadline text: "by Dec 20", "in 4 months". */
  deadline?: ReactNode;
  /** Household members contributing; rendered as stacked avatars. */
  contributors?: Member[];
  /** `active` (default), `completed`, or `paused`. */
  status?: 'active' | 'completed' | 'paused';
  /** Suggested per-period contribution text: "$85/week to make it". */
  pace?: ReactNode;
  /** Makes the card tappable (opens the goal). */
  onClick?: () => void;
  /** Compact variant for horizontal carousels. */
  compact?: boolean;
}

/**
 * GoalCard - a savings goal with progress, remaining amount, deadline and
 * the household members contributing. Used on the Goals screen and as a
 * highlight on the overview.
 * @category Finance
 */
export function GoalCard({
  name,
  target,
  saved,
  currency = 'USD',
  icon,
  deadline,
  contributors,
  status = 'active',
  pace,
  onClick,
  compact = false,
  className,
  ...rest
}: GoalCardProps) {
  const safeTarget = target > 0 ? target : 1;
  const ratio = Math.max(0, saved) / safeTarget;
  const done = status === 'completed' || ratio >= 1;
  const remaining = Math.max(0, target - saved);
  // Floored, so $999.50 of $1,000 reads "99%" rather than "100%" beside "to go" (audit MON-14).
  const percent = formatPercent(Math.min(ratio, 1), 0, { rounding: 'floor' });
  const classes = cx('bdg-goal', compact && 'bdg-goal--compact', `bdg-goal--${done ? 'completed' : status}`, onClick && 'bdg-goal--button', className);
  const content = (
    <>
      <div className="bdg-goal__top">
        {icon != null && (
          <span className="bdg-goal__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="bdg-goal__heading">
          <span className="bdg-goal__name">{name}</span>
          {deadline != null && <span className="bdg-goal__deadline">{deadline}</span>}
        </div>
        {done ? (
          <Badge tone="positive" dot>
            Reached
          </Badge>
        ) : status === 'paused' ? (
          <Badge tone="neutral">Paused</Badge>
        ) : null}
      </div>
      <div className="bdg-goal__figures">
        <span className="bdg-goal__saved">{formatMoney(saved, { currency, wholeOnly: saved % 1 === 0 })}</span>
        <span className="bdg-goal__target">of {formatMoney(target, { currency, wholeOnly: target % 1 === 0 })}</span>
        <span className="bdg-goal__percent">{percent}</span>
      </div>
      <ProgressBar value={Math.min(saved, target)} max={safeTarget} tone={done ? 'positive' : status === 'paused' ? 'neutral' : 'primary'} size={compact ? 'sm' : 'md'} aria-label={`${percent} of goal`} />
      {!compact && (
        <div className="bdg-goal__foot">
          <span className="bdg-goal__remaining">{done ? 'Goal complete' : `${formatMoney(remaining, { currency, wholeOnly: remaining % 1 === 0 })} to go`}</span>
          {pace != null && !done && <span className="bdg-goal__pace">{pace}</span>}
          {contributors && contributors.length > 0 && (
            <span className="bdg-goal__contributors" aria-label={`Contributors: ${contributors.map((m) => m.name).join(', ')}`}>
              {contributors.slice(0, 4).map((m, i) => (
                // Keyed by id: two members called Sam must not collapse into one avatar (audit UX-14).
                <Avatar key={m.id ?? `${i}:${m.name}`} name={m.name} color={m.color} src={m.avatarUrl} size="xs" />
              ))}
              {contributors.length > 4 && <span className="bdg-goal__more">+{contributors.length - 4}</span>}
            </span>
          )}
        </div>
      )}
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
