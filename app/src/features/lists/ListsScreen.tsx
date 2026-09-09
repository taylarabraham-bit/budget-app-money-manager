import { useMemo, useState, type FormEvent } from 'react';
import { Alert, AmountInput, Button, Card, Dialog, EmptyState, PageHeader, ProgressBar, StatCard, Tabs, TextField, formatMoneyAuto } from '@budget-app/ui';
import { useLogPurchase } from '../../components/LogPurchaseProvider';
import { useHousehold } from '../../data/store';
import { ListItemDialog } from './ListItemDialog';
import { batchPurchaseDraft, selectCategoryMonth, selectShopping, selectWish } from './selectors';
import { ShoppingRow } from './ShoppingRow';
import { useLists } from './store';
import { DEFAULT_SHOPPING_CATEGORY, DEFAULT_WISH_CATEGORY, type ListItem, type ListKind } from './types';
import { WishFormDialog } from './WishFormDialog';
import { WishRow } from './WishRow';
import { WishSheet } from './WishSheet';
import './lists.css';

interface ListsScreenProps {
  initialList?: ListKind;
  onBack: () => void;
  onOpenGoals: () => void;
}

type Panel = { type: 'edit-item'; id: string } | { type: 'add-wish' } | { type: 'edit-wish'; id: string } | { type: 'view-wish'; id: string } | { type: 'delete'; id: string } | { type: 'clear' } | null;

interface Notice {
  tone: 'success' | 'info';
  title: string;
  body?: string;
}

/**
 * Lists sub-screen: the shared shopping list (quick add, tick off, log items
 * or the whole trip as purchases) and the wish list (bigger wants that can
 * become goals or purchases).
 */
export function ListsScreen({ initialList = 'shopping', onBack, onOpenGoals }: ListsScreenProps) {
  const state = useHousehold();
  const { categories, members, household, addGoal } = state;
  const { items, isSample, addItem, updateItem, removeItem, toggleChecked, clearChecked, markBought, moveToList, linkGoal } = useLists();
  const { open: openLog } = useLogPurchase();
  const [tab, setTab] = useState<ListKind>(initialList);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickAmount, setQuickAmount] = useState<number | null>(null);

  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const shopping = useMemo(() => selectShopping(items), [items]);
  const wish = useMemo(() => selectWish(items), [items]);
  const groceries = useMemo(() => selectCategoryMonth(state, DEFAULT_SHOPPING_CATEGORY), [state]);
  const byId = (id: string) => items.find((i) => i.id === id);
  const categoryOf = (i: ListItem) => categories.find((c) => c.id === i.categoryId);
  const memberOf = (i: ListItem) => members.find((m) => m.id === i.addedBy);
  const selected = panel && 'id' in panel ? byId(panel.id) : undefined;

  // The default ids only exist while their categories do - a household that disabled
  // Groceries must not get items (or purchases) filed under a dangling id (QA UX-7).
  const resolveCategory = (preferred: string | undefined) => {
    const expense = categories.filter((c) => c.kind === 'expense');
    return (preferred && expense.some((c) => c.id === preferred) ? preferred : undefined) ?? expense[0]?.id ?? '';
  };

  const quickAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;
    addItem({ list: 'shopping', name: quickName, estimatedAmount: quickAmount, categoryId: resolveCategory(DEFAULT_SHOPPING_CATEGORY) });
    setQuickName('');
    setQuickAmount(null);
  };

  const logItem = (item: ListItem) => {
    const isWish = item.list === 'wish';
    openLog({
      source: isWish ? 'wish-list' : 'shopping-list',
      initial: { kind: 'expense', amount: item.estimatedAmount ?? null, title: item.name, categoryId: resolveCategory(item.categoryId ?? (isWish ? DEFAULT_WISH_CATEGORY : DEFAULT_SHOPPING_CATEGORY)), shared: !isWish, note: isWish ? 'From the wish list' : undefined },
      onSaved: (record) => {
        markBought([item.id], record.id);
        setNotice({ tone: 'success', title: `${item.name} logged`, body: `${money(Math.abs(record.amount))} added to Activity.` });
      },
    });
    setPanel(null);
  };

  const boughtAll = () => {
    const ids = shopping.unchecked.map((i) => i.id);
    openLog({
      source: 'shopping-list',
      initial: batchPurchaseDraft(shopping.unchecked, categories),
      onSaved: (record) => {
        markBought(ids, record.id);
        setNotice({ tone: 'success', title: `${ids.length} items logged as one purchase`, body: `${money(Math.abs(record.amount))} added to Activity.` });
      },
    });
  };

  const makeGoal = (item: ListItem) => {
    if (!item.estimatedAmount) return;
    const goal = addGoal({ name: item.name, icon: categoryOf(item)?.icon ?? '⭐', target: item.estimatedAmount, contributorIds: [item.addedBy] });
    linkGoal(item.id, goal.id);
    setPanel(null);
    setNotice({ tone: 'success', title: 'Goal created', body: `${goal.name} is now under Goals - add money to it whenever you can.` });
  };

  const toggle = (item: ListItem) => {
    toggleChecked(item.id);
    if (item.checked && item.transactionId) setNotice({ tone: 'info', title: 'Unticked', body: 'The purchase stays in Activity.' });
  };

  const confirmDelete = (item: ListItem) => {
    removeItem(item.id);
    setPanel(null);
    setNotice({ tone: 'info', title: `${item.name} removed` });
  };

  const wishSelected = panel?.type === 'view-wish' ? selected ?? null : null;

  return (
    <div className="bdg-stack lists">
      <PageHeader
        size="lg"
        eyebrow="Household"
        title="Lists"
        subtitle={tab === 'shopping' ? (shopping.unchecked.length ? `${shopping.unchecked.length} to buy · ~${money(shopping.estimate)}` : 'Nothing to buy') : wish.open.length ? `${wish.open.length} want${wish.open.length === 1 ? '' : 's'} · ${money(wish.total)}` : 'Nothing wished for yet'}
        onBack={onBack}
        backLabel="Back"
        actions={
          tab === 'wish' ? (
            <Button size="sm" onClick={() => setPanel({ type: 'add-wish' })} iconStart={<span aria-hidden="true">+</span>}>
              Add a wish
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={shopping.checked.length === 0} onClick={() => setPanel({ type: 'clear' })}>
              Clear checked
            </Button>
          )
        }
      />

      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.body}
        </Alert>
      )}

      <Tabs
        variant="segmented"
        fullWidth
        aria-label="List"
        value={tab}
        onChange={(v) => setTab(v as ListKind)}
        items={[
          { value: 'shopping', label: 'Shopping', count: shopping.unchecked.length },
          { value: 'wish', label: 'Wish list', count: wish.open.length },
        ]}
      />

      {tab === 'shopping' && (
        <>
          <Card padding="sm">
            <form className="list-add" onSubmit={quickAdd}>
              <TextField label="Item" placeholder="Milk, bread, …" value={quickName} onChange={(e) => setQuickName(e.target.value)} autoComplete="off" enterKeyHint="done" fullWidth />
              <AmountInput label="Est. price" currency={currency} value={quickAmount} onValueChange={setQuickAmount} />
              <Button type="submit" size="md">
                Add
              </Button>
            </form>
          </Card>

          {groceries.category && groceries.limit > 0 && (shopping.estimate > 0 || groceries.spent > 0) && (
            <Card padding="sm">
              <ProgressBar
                size="sm"
                label={`${groceries.category.icon} ${groceries.category.name} after this trip`}
                value={groceries.spent + shopping.estimate}
                max={groceries.limit}
                tone={groceries.spent + shopping.estimate > groceries.limit ? 'negative' : 'primary'}
                valueLabel={`${money(groceries.left - shopping.estimate)} left`}
              />
            </Card>
          )}

          <section className="bdg-stack bdg-gap-2" aria-label="To buy">
            <div className="bills-group__head">
              <h2 className="bdg-section-title">To buy ({shopping.unchecked.length})</h2>
              <span className="bills-group__total">
                ~{money(shopping.estimate)}
                {shopping.unpricedCount ? ` · ${shopping.unpricedCount} unpriced` : ''}
              </span>
            </div>
            <Card
              padding="none"
              footer={
                shopping.unchecked.length > 0 ? (
                  <Button variant="secondary" fullWidth onClick={boughtAll}>
                    Bought everything · log ~{money(shopping.estimate)}
                  </Button>
                ) : undefined
              }
            >
              {shopping.unchecked.length === 0 ? (
                <EmptyState compact icon="🛒" title="Your list is empty" description="Add things to buy, tick them off in the store, then log the trip as one purchase." />
              ) : (
                shopping.unchecked.map((item) => (
                  <ShoppingRow key={item.id} item={item} category={categoryOf(item)} member={memberOf(item)} currency={currency} onToggle={() => toggle(item)} onEdit={() => setPanel({ type: 'edit-item', id: item.id })} onLog={() => logItem(item)} />
                ))
              )}
            </Card>
          </section>

          {shopping.checked.length > 0 && (
            <section className="bdg-stack bdg-gap-2" aria-label="Checked">
              <div className="bills-group__head">
                <h2 className="bdg-section-title">Checked ({shopping.checked.length})</h2>
              </div>
              <Card padding="none">
                {shopping.checked.map((item) => (
                  <ShoppingRow key={item.id} item={item} category={categoryOf(item)} member={memberOf(item)} currency={currency} onToggle={() => toggle(item)} onEdit={() => setPanel({ type: 'edit-item', id: item.id })} />
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      {tab === 'wish' && (
        <>
          <div className="bdg-grid-2">
            <StatCard compact label="Wanted" value={wish.total} currency={currency} caption={`${wish.open.length} thing${wish.open.length === 1 ? '' : 's'}`} icon="⭐" wholeOnly />
            <StatCard compact label="High priority" value={wish.byPriority.high} currency={currency} caption={`${wish.open.filter((i) => (i.priority ?? 'medium') === 'high').length} item${wish.open.filter((i) => (i.priority ?? 'medium') === 'high').length === 1 ? '' : 's'}`} icon="🔥" wholeOnly />
          </div>
          <Card padding="none">
            {wish.open.length === 0 ? (
              <EmptyState icon="⭐" title="Nothing on the wish list" description="Bigger things you'd like one day. Add a price and the household can see what is worth saving for." action={<Button onClick={() => setPanel({ type: 'add-wish' })}>Add a wish</Button>} />
            ) : (
              wish.open.map((item) => <WishRow key={item.id} item={item} category={categoryOf(item)} member={memberOf(item)} currency={currency} onOpen={() => setPanel({ type: 'view-wish', id: item.id })} />)
            )}
          </Card>
          {wish.bought.length > 0 && (
            <section className="bdg-stack bdg-gap-2" aria-label="Bought">
              <div className="bills-group__head">
                <h2 className="bdg-section-title">Bought ({wish.bought.length})</h2>
              </div>
              <Card padding="none">
                {wish.bought.map((item) => (
                  <WishRow key={item.id} item={item} category={categoryOf(item)} member={memberOf(item)} currency={currency} onOpen={() => setPanel({ type: 'view-wish', id: item.id })} />
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      {isSample && <p className="bdg-text-xs bdg-text-subtle">Showing sample lists. Add or tick something and they become yours.</p>}

      <ListItemDialog
        open={panel?.type === 'edit-item' && !!selected}
        item={panel?.type === 'edit-item' ? selected : undefined}
        onClose={() => setPanel(null)}
        onSubmit={(input) => {
          if (selected) updateItem(selected.id, input);
          setPanel(null);
        }}
        onDelete={() => selected && setPanel({ type: 'delete', id: selected.id })}
      />

      <WishFormDialog
        open={panel?.type === 'add-wish' || (panel?.type === 'edit-wish' && !!selected)}
        item={panel?.type === 'edit-wish' ? selected : undefined}
        onClose={() => setPanel(panel?.type === 'edit-wish' && selected ? { type: 'view-wish', id: selected.id } : null)}
        onSubmit={(input) => {
          if (panel?.type === 'edit-wish' && selected) {
            updateItem(selected.id, input);
            setPanel({ type: 'view-wish', id: selected.id });
          } else {
            const item = addItem({ ...input, list: 'wish' });
            setPanel(null);
            setNotice({ tone: 'success', title: `${item.name} added to the wish list` });
          }
        }}
      />

      <WishSheet
        item={wishSelected}
        onClose={() => setPanel(null)}
        onEdit={() => wishSelected && setPanel({ type: 'edit-wish', id: wishSelected.id })}
        onBought={() => wishSelected && logItem(wishSelected)}
        onMakeGoal={() => wishSelected && makeGoal(wishSelected)}
        onOpenGoal={onOpenGoals}
        onToShopping={() => {
          if (!wishSelected) return;
          moveToList(wishSelected.id, 'shopping');
          setPanel(null);
          setTab('shopping');
          setNotice({ tone: 'info', title: `${wishSelected.name} moved to the shopping list` });
        }}
        onDelete={() => wishSelected && setPanel({ type: 'delete', id: wishSelected.id })}
      />

      <Dialog
        open={panel?.type === 'delete' && !!selected}
        size="sm"
        onClose={() => setPanel(null)}
        title={`Remove ${selected?.name ?? 'this item'}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => selected && confirmDelete(selected)}>
              Remove
            </Button>
          </>
        }
      />

      <Dialog
        open={panel?.type === 'clear'}
        size="sm"
        onClose={() => setPanel(null)}
        title={`Clear ${shopping.checked.length} checked item${shopping.checked.length === 1 ? '' : 's'}?`}
        description="Purchases already logged stay in Activity."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const n = clearChecked('shopping');
                setPanel(null);
                setNotice({ tone: 'info', title: `${n} item${n === 1 ? '' : 's'} cleared` });
              }}
            >
              Clear
            </Button>
          </>
        }
      />
    </div>
  );
}
