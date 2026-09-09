import { Badge, Button, Checkbox, formatMoneyAuto } from '@budget-app/ui';
import { firstName } from '../../data/split';
import type { Category, HouseholdMember } from '../../data/types';
import { dateOnly, formatShortDate } from '../../lib/dates';
import type { ListItem } from './types';

interface ShoppingRowProps {
  item: ListItem;
  category?: Category;
  member?: HouseholdMember;
  currency: string;
  onToggle: () => void;
  onEdit?: () => void;
  /** Log this item alone as a purchase. */
  onLog?: () => void;
  /** Fewer controls for the Overview card. */
  compact?: boolean;
}

/** "Sep 1" for a stored datetime; nothing for a row whose stamp is not a string (a tampered pull must not throw in render - audit SEC-3). */
const dayText = (iso: unknown): string => (typeof iso === 'string' && iso ? formatShortDate(dateOnly(iso)) : '');

/** One shopping-list item: tick it off, or log it as a purchase on its own. */
export function ShoppingRow({ item, category, member, currency, onToggle, onEdit, onLog, compact = false }: ShoppingRowProps) {
  const description = item.checked
    ? `Bought ${dayText(item.checkedAt)}`.trim()
    : [item.estimatedAmount ? formatMoneyAuto(item.estimatedAmount, { currency }) : 'no price', `${category?.icon ?? '🛒'} ${category?.name ?? 'Groceries'}`, member ? firstName(member.name) : undefined].filter(Boolean).join(' · ');
  return (
    <div className={`list-row${item.checked ? ' list-row--checked' : ''}`}>
      <Checkbox label={<span className="list-row__name">{item.name}</span>} description={description} checked={!!item.checked} onChange={onToggle} />
      {!compact && (
        <span className="list-row__trailing">
          {item.transactionId && (
            <Badge tone="info" size="sm">
              Logged
            </Badge>
          )}
          {onEdit && (
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${item.name}`}>
              Edit
            </Button>
          )}
          {!item.checked && onLog && (
            <Button size="sm" variant="secondary" onClick={onLog} aria-label={`Log ${item.name} as a purchase`}>
              Log
            </Button>
          )}
        </span>
      )}
    </div>
  );
}
