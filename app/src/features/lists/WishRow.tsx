import { Amount, Avatar, Badge, formatMoneyAuto } from '@budget-app/ui';
import { firstName } from '../../data/split';
import type { Category, HouseholdMember } from '../../data/types';
import { dateOnly, formatShortDate } from '../../lib/dates';
import { PRIORITY_LABEL, PRIORITY_TONE, type ListItem } from './types';

interface WishRowProps {
  item: ListItem;
  category?: Category;
  member?: HouseholdMember;
  currency: string;
  onOpen: () => void;
}

/** "Sep 1" for a stored datetime; nothing for a row whose stamp is not a string (a tampered pull must not throw in render - audit SEC-3). */
const dayText = (iso: unknown): string => (typeof iso === 'string' && iso ? formatShortDate(dateOnly(iso)) : '');

/** One wish: icon, name, priority, who wants it, and the estimated price. */
export function WishRow({ item, category, member, currency, onOpen }: WishRowProps) {
  const priority = item.priority ?? 'medium';
  // aria-label replaces the button's content for screen readers, so the price and owner go in too (audit UX-12).
  const label = [item.name, `${PRIORITY_LABEL[priority]} priority`, member ? firstName(member.name) : undefined, item.estimatedAmount ? formatMoneyAuto(item.estimatedAmount, { currency }) : 'no price', item.checked ? 'bought' : undefined]
    .filter(Boolean)
    .join(', ');
  return (
    <div className={`bill-row${item.checked ? ' bill-row--paused' : ''}`}>
      <button type="button" className="bill-row__main" onClick={onOpen} aria-label={label}>
        <span className="bill-row__icon" aria-hidden="true">
          {category?.icon ?? '⭐'}
        </span>
        <span className="bill-row__body">
          <span className="bill-row__name">{item.name}</span>
          <span className="bill-row__meta">
            <Badge tone={PRIORITY_TONE[priority]} size="sm">
              {PRIORITY_LABEL[priority]}
            </Badge>
            {member && (
              <span className="bdg-row bdg-gap-1">
                <Avatar name={member.name} color={member.color} size="xs" />
                {firstName(member.name)}
              </span>
            )}
            <span>{item.checked ? `bought ${dayText(item.checkedAt)}`.trim() : `added ${dayText(item.createdAt)}`.trim()}</span>
            {item.goalId && (
              <Badge tone="positive" size="sm">
                Saving
              </Badge>
            )}
          </span>
        </span>
        <span className="bill-row__trailing">{item.estimatedAmount ? <Amount value={item.estimatedAmount} currency={currency} size="md" weight="semibold" /> : <span className="bdg-text-xs bdg-text-muted">no price</span>}</span>
      </button>
    </div>
  );
}
