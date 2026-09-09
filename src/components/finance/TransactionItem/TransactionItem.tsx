import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import type { Member } from '../../../lib/types';
import { Avatar } from '../../household/Avatar/Avatar';
import { Badge } from '../../feedback/Badge/Badge';
import { Amount } from '../Amount/Amount';

export interface TransactionItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onClick' | 'title'> {
  /** What it was: merchant or description ("Whole Foods", "Salary"). */
  title: ReactNode;
  /** Signed amount: negative for purchases, positive for income. */
  amount: number;
  /** ISO currency code. Default "USD". */
  currency?: string;
  /** Category label shown under the title. */
  category?: ReactNode;
  /** Time or date text shown with the category ("2:40 PM", "Aug 12"). */
  when?: ReactNode;
  /** Household member who logged/made it - rendered as their avatar. */
  member?: Member;
  /** Emoji or icon for the category; shown instead of the member avatar when no member is given. */
  icon?: ReactNode;
  /** Free-text note, shown as a third line. */
  note?: ReactNode;
  /** Pending/unsettled state. */
  pending?: boolean;
  /** Shows the "Recurring" badge. */
  recurring?: boolean;
  /** Makes the row tappable (opens the transaction). */
  onClick?: () => void;
}

/**
 * TransactionItem - one row of the purchase log: who, what, when and how
 * much, with income green and spend in the text colour. Rows stack
 * edge-to-edge inside a Card or a TransactionList.
 * @category Finance
 */
export function TransactionItem({
  title,
  amount,
  currency = 'USD',
  category,
  when,
  member,
  icon,
  note,
  pending = false,
  recurring = false,
  onClick,
  className,
  ...rest
}: TransactionItemProps) {
  const classes = cx('bdg-txn', pending && 'bdg-txn--pending', onClick && 'bdg-txn--button', className);
  const content = (
    <>
      <span className="bdg-txn__leading">
        {member ? <Avatar name={member.name} color={member.color} src={member.avatarUrl} size="md" /> : <span className="bdg-txn__icon" aria-hidden="true">{icon ?? '•'}</span>}
      </span>
      <span className="bdg-txn__body">
        <span className="bdg-txn__title">{title}</span>
        {(category != null || when != null || recurring) && (
          <span className="bdg-txn__meta">
            {category != null && <span className="bdg-txn__category">{category}</span>}
            {when != null && <span className="bdg-txn__when">{when}</span>}
            {recurring && (
              <Badge size="sm" tone="info">
                Recurring
              </Badge>
            )}
          </span>
        )}
        {note != null && <span className="bdg-txn__note">{note}</span>}
      </span>
      <span className="bdg-txn__trailing">
        <Amount value={amount} currency={currency} tone={amount > 0 ? 'positive' : 'neutral'} signDisplay={amount > 0 ? 'exceptZero' : 'auto'} size="md" weight="semibold" />
        {pending && <span className="bdg-txn__pending">Pending</span>}
      </span>
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
