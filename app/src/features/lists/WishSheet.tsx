import { Alert, Amount, Badge, Button, Dialog, MemberChip } from '@budget-app/ui';
import { useHousehold } from '../../data/store';
import { dateOnly, formatLongDate } from '../../lib/dates';
import { PRIORITY_LABEL, PRIORITY_TONE, type ListItem } from './types';

interface WishSheetProps {
  item: ListItem | null;
  onClose: () => void;
  onEdit: () => void;
  onBought: () => void;
  onMakeGoal: () => void;
  onOpenGoal: () => void;
  onToShopping: () => void;
  onDelete: () => void;
}

/** Detail sheet for one wish: the price, who wants it, and what to do with it. */
export function WishSheet({ item, onClose, onEdit, onBought, onMakeGoal, onOpenGoal, onToShopping, onDelete }: WishSheetProps) {
  const { categories, members, household, goals } = useHousehold();
  if (!item) return null;
  const category = categories.find((c) => c.id === item.categoryId);
  const member = members.find((m) => m.id === item.addedBy);
  const goal = item.goalId ? goals.find((g) => g.id === item.goalId) : undefined;
  const priority = item.priority ?? 'medium';
  // Only an http(s) link is rendered as one: a synced or imported "javascript:"
  // url must never reach an href (audit SEC-3, belt-and-braces to the store guard).
  const safeUrl = item.url && /^https?:\/\//i.test(item.url) ? item.url : undefined;
  return (
    <Dialog
      open
      onClose={onClose}
      title={item.name}
      description={item.checked ? 'Bought' : `${PRIORITY_LABEL[priority]} priority`}
      footer={
        <>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          {!item.checked && <Button onClick={onBought}>Bought it</Button>}
        </>
      }
    >
      <div className="bdg-stack">
        <div className="bill-sheet__hero">
          {item.estimatedAmount ? <Amount value={item.estimatedAmount} currency={household.currency} size="xl" weight="bold" /> : <span className="bdg-text-muted">No price yet</span>}
          <div className="bdg-row bdg-gap-1">
            <Badge tone={PRIORITY_TONE[priority]} dot>
              {PRIORITY_LABEL[priority]}
            </Badge>
            {goal && (
              <Badge tone="positive" size="sm">
                Saving
              </Badge>
            )}
          </div>
        </div>
        <dl className="bill-sheet__facts">
          <dt>Wanted by</dt>
          <dd>{member ? <MemberChip name={member.name} color={member.color} size="sm" /> : '—'}</dd>
          <dt>Category</dt>
          <dd>{category ? `${category.icon} ${category.name}` : 'Uncategorised'}</dd>
          {item.url && (
            <>
              <dt>Link</dt>
              <dd>
                {safeUrl ? (
                  <a className="bdg-truncate list-sheet__link" href={safeUrl} target="_blank" rel="noopener noreferrer">
                    {safeUrl}
                  </a>
                ) : (
                  <span className="bdg-truncate">{item.url}</span>
                )}
              </dd>
            </>
          )}
          <dt>Added</dt>
          <dd>{formatLongDate(dateOnly(item.createdAt))}</dd>
          {goal && (
            <>
              <dt>Goal</dt>
              <dd>
                {goal.icon} {goal.name} · {Math.round((goal.saved / goal.target) * 100)}% saved
              </dd>
            </>
          )}
          {item.note && (
            <>
              <dt>Note</dt>
              <dd>{item.note}</dd>
            </>
          )}
        </dl>
        {!item.estimatedAmount && <Alert tone="warning">Add an estimated price to turn this into a goal.</Alert>}
        <div className="bill-sheet__secondary">
          <div className="bdg-row bdg-gap-2 bdg-wrap">
            {goal ? (
              <Button size="sm" variant="ghost" onClick={onOpenGoal}>
                Open goal
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={onMakeGoal} disabled={!item.estimatedAmount || !!item.checked}>
                Turn into a goal
              </Button>
            )}
            {!item.checked && (
              <Button size="sm" variant="ghost" onClick={onToShopping}>
                Add to shopping list
              </Button>
            )}
          </div>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
