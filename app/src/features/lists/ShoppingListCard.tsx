import { Button, Card, EmptyState, formatMoneyAuto } from '@budget-app/ui';
import { useHousehold } from '../../data/store';
import { selectListsSummary, selectShopping } from './selectors';
import { ShoppingRow } from './ShoppingRow';
import { useLists } from './store';
import type { ListKind } from './types';
import './lists.css';

interface ShoppingListCardProps {
  onOpen: (list: ListKind) => void;
  /** How many items to show. Default 3. */
  limit?: number;
}

/** Overview card: the next few things to buy (tickable), with the estimate and a link to the wish list. */
export function ShoppingListCard({ onOpen, limit = 3 }: ShoppingListCardProps) {
  const { categories, members, household } = useHousehold();
  const { items, toggleChecked } = useLists();
  const summary = selectListsSummary(items);
  const shopping = selectShopping(items);
  const rows = shopping.unchecked.slice(0, limit);
  const more = shopping.unchecked.length - rows.length;
  const currency = household.currency;
  return (
    <Card
      title="Shopping list"
      subtitle={summary.shoppingCount ? `${summary.shoppingCount} to buy · ~${formatMoneyAuto(summary.shoppingEstimate, { currency })}${summary.shoppingUnpriced ? ` · ${summary.shoppingUnpriced} unpriced` : ''}` : 'Nothing to buy'}
      padding="none"
      actions={
        <Button size="sm" variant="ghost" onClick={() => onOpen('shopping')}>
          Open
        </Button>
      }
      footer={
        <div className="bdg-row-between bdg-gap-2">
          {more > 0 ? <span className="bdg-text-sm bdg-text-muted">{more} more</span> : <span />}
          {summary.wishCount > 0 && (
            <button type="button" className="lists-card__wish" onClick={() => onOpen('wish')}>
              ⭐ Wish list · {summary.wishCount} want{summary.wishCount === 1 ? '' : 's'} · {formatMoneyAuto(summary.wishTotal, { currency })}
            </button>
          )}
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact icon="🛒" title="List is empty" description="Add the things you need to buy next." action={<Button size="sm" variant="secondary" onClick={() => onOpen('shopping')}>Add items</Button>} />
      ) : (
        rows.map((item) => <ShoppingRow key={item.id} item={item} category={categories.find((c) => c.id === item.categoryId)} member={members.find((m) => m.id === item.addedBy)} currency={currency} onToggle={() => toggleChecked(item.id)} compact />)
      )}
    </Card>
  );
}
