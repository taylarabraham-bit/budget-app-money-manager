import type { HTMLAttributes } from 'react';
import { cx } from '../../../lib/cx';
import { initialsOf, memberColorFor } from '../../../lib/format';
import type { MemberColor } from '../../../lib/types';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Member's display name - used for initials, the accessible label and the default colour. */
  name: string;
  /** Photo URL. Initials render when absent or while loading. */
  src?: string;
  /** Member colour. Derived deterministically from `name` when omitted, so the same person always matches. */
  color?: MemberColor;
  /** Diameter: xs 24, sm 32, md 40, lg 56, xl 80px. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Small status dot in the corner (e.g. the currently active member). */
  status?: 'none' | 'active';
}

/**
 * Avatar - a household member's initials or photo in their member colour.
 * Shown wherever something is attributed to a person: transactions, goals,
 * the header of their personal budget.
 * @category Household
 */
export function Avatar({ name, src, color, size = 'md', status = 'none', className, ...rest }: AvatarProps) {
  const tone = color ?? memberColorFor(name);
  return (
    <span
      className={cx('bdg-avatar', `bdg-avatar--${size}`, `bdg-avatar--${tone}`, status === 'active' && 'bdg-avatar--active', className)}
      role="img"
      aria-label={name}
      title={name}
      {...rest}
    >
      {src ? <img className="bdg-avatar__img" src={src} alt="" /> : <span className="bdg-avatar__initials">{initialsOf(name)}</span>}
      {status === 'active' && <span className="bdg-avatar__status" aria-hidden="true" />}
    </span>
  );
}
