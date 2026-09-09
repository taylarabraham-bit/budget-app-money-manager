import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { memberColorFor } from '../../../lib/format';
import type { MemberColor } from '../../../lib/types';
import { Avatar } from '../Avatar/Avatar';

export interface MemberChipProps {
  /** Member's display name. */
  name: string;
  /** Member colour; derived from the name when omitted. */
  color?: MemberColor;
  /** Photo URL for the avatar. */
  avatarUrl?: string;
  /** Small secondary text: a role ("Owner", "Parent", "Teen") or a figure ("$420 left"). */
  meta?: ReactNode;
  /** Highlighted state - the member whose budget is being viewed, or a selected filter. */
  selected?: boolean;
  /** Makes the chip a button and calls this when tapped. */
  onSelect?: () => void;
  /** Chip size. */
  size?: 'sm' | 'md';
  /** Extra class names. */
  className?: string;
}

/**
 * MemberChip - a household member as a compact, optionally selectable pill
 * (avatar + name + meta). Use a row of them to switch between personal
 * budgets or to filter transactions by who made them.
 * @category Household
 */
export function MemberChip({ name, color, avatarUrl, meta, selected = false, onSelect, size = 'md', className }: MemberChipProps) {
  const tone = color ?? memberColorFor(name);
  const classes = cx('bdg-member-chip', `bdg-member-chip--${size}`, `bdg-member-chip--${tone}`, selected && 'bdg-member-chip--selected', onSelect && 'bdg-member-chip--button', className);
  const content = (
    <>
      <Avatar name={name} color={tone} src={avatarUrl} size={size === 'sm' ? 'xs' : 'sm'} aria-hidden="true" />
      <span className="bdg-member-chip__text">
        <span className="bdg-member-chip__name">{name}</span>
        {meta != null && <span className="bdg-member-chip__meta">{meta}</span>}
      </span>
    </>
  );
  if (onSelect) {
    return (
      <button type="button" className={classes} aria-pressed={selected} onClick={onSelect}>
        {content}
      </button>
    );
  }
  return <span className={classes}>{content}</span>;
}
