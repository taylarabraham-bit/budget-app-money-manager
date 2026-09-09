import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import type { Tone } from '../../../lib/types';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Colour meaning: `positive` income/on track, `negative` overspent, `warning` close to limit, `info` neutral facts, `neutral` default. */
  tone?: Tone;
  /** `soft` tinted (default), `solid` filled, `outline` hairline. */
  variant?: 'soft' | 'solid' | 'outline';
  /** Badge height: sm 20px, md 24px. */
  size?: 'sm' | 'md';
  /** Leading status dot. */
  dot?: boolean;
  /** Badge text - keep it to one or two words. */
  children?: ReactNode;
}

/**
 * Badge - a small status label: "On track", "Over budget", "Pending",
 * "Recurring". Tone carries the meaning; keep the text short.
 * @category Feedback
 */
export function Badge({ tone = 'neutral', variant = 'soft', size = 'md', dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx('bdg-badge', `bdg-badge--${tone}`, `bdg-badge--${variant}`, `bdg-badge--${size}`, className)} {...rest}>
      {dot && <span className="bdg-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
