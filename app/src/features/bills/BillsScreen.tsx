import { useEffect, useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, PageHeader, StatCard, Tabs, formatMoneyAuto } from '@budget-app/ui';
import { ScreenActions } from '../../components/ScreenActions';
import { useHousehold } from '../../data/store';
import { useToday } from '../../lib/useToday';
import { BillFormDialog } from './BillFormDialog';
import { BillRow } from './BillRow';
import { BillSheet } from './BillSheet';
import { SubscriptionsReview } from './SubscriptionsReview';
import { formatDueDate, todayIso } from './dates';
import { groupByDue, selectBills, selectBillsSummary, toBillView, type BillFilter } from './selectors';
import { useBills } from './store';
import { FREQUENCY_LABEL, KIND_LABEL, type Bill, type BillInput } from './types';
import './bills.css';

type Panel = { type: 'create' } | { type: 'view'; id: string } | { type: 'edit'; id: string } | { type: 'delete'; id: string } | null;

interface Notice {
  tone: 'success' | 'info';
  title: string;
  body?: string;
}

/**
 * Bills tab: subscriptions and recurring bills grouped by when they are due,
 * with what they add up to per month, what needs paying this week, and the
 * add / pay / edit / pause / delete flows. Marking a bill paid logs a
 * purchase in the household store so it shows up in Activity and budgets.
 */
interface BillsScreenProps {
  /** Opens the Paydays sub-screen (income on a schedule). */
  onOpenPaydays?: () => void;
}

export function BillsScreen({ onOpenPaydays }: BillsScreenProps = {}) {
  const { categories, members, household, addTransaction } = useHousehold();
  const { bills, isSample, addBill, updateBill, removeBill, markPaid, setPaused } = useBills();
  const [filter, setFilter] = useState<BillFilter>('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Re-dates at midnight and when the app returns to the foreground (QA L9/MF-6):
  // this screen IS due-date math, so a frozen "today" mislabels every bucket.
  const now = useToday();
  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const summary = selectBillsSummary(bills, now);
  const shown = selectBills(bills, filter, now);
  const groups = groupByDue(shown);
  const count = (kind: Bill['kind']) => bills.filter((b) => b.kind === kind).length;
  // The two stat cards follow the selected tab, so the Subscriptions tab adds up subscriptions only.
  const shownActive = shown.filter((b) => !b.paused);
  const shownMonthly = shownActive.reduce((sum, b) => sum + b.monthly, 0);
  const shownAttention = shownActive.filter((b) => b.days <= 7);
  // Overdue rows owe every missed occurrence, not one (QA7 B-1).
  const shownAttentionTotal = shownAttention.reduce((sum, b) => sum + (b.arrearsCount > 0 ? b.arrearsTotal : b.amount), 0);
  const noun = filter === 'subscription' ? 'subscription' : 'bill';

  const byId = (id: string) => bills.find((b) => b.id === id);
  const categoryOf = (bill: Bill) => categories.find((c) => c.id === bill.categoryId);
  const memberOf = (bill: Bill) => members.find((m) => m.id === bill.memberId);

  const selected = panel && panel.type !== 'create' ? byId(panel.id) : undefined;
  const viewing = panel?.type === 'view' && selected ? toBillView(selected, now) : null;
  const editing = panel?.type === 'edit' ? selected : undefined;

  // The row a panel is on vanished under it (the partner deleted it and a pull
  // applied): close the panel and say so, instead of the edit form morphing into
  // "Add a bill" and saving a brand-new row (audit UX-9).
  useEffect(() => {
    if (!panel || panel.type === 'create' || selected) return;
    setPanel(null);
    setNotice({ tone: 'info', title: 'That bill was removed on another device' });
  }, [panel, selected]);

  const openView = (id: string) => setPanel({ type: 'view', id });

  const pay = (bill: Bill) => {
    const result = markPaid(bill.id);
    if (!result) return;
    addTransaction({
      kind: 'expense',
      amount: bill.amount,
      categoryId: bill.categoryId,
      memberId: bill.memberId,
      title: bill.name,
      shared: bill.shared,
      recurring: true,
      // The settled occurrence's own due date: three catch-up taps used to log
      // three identical rows with nothing telling them apart (QA7 B-2).
      note: `${KIND_LABEL[bill.kind]} · ${FREQUENCY_LABEL[bill.frequency]} · due ${formatDueDate(result.paidDue, now)}`,
      accountId: bill.accountId,
    });
    setNotice({
      tone: 'success',
      title: `${bill.name} marked as paid`,
      // One tap pays one occurrence, so a bill several periods behind is still
      // overdue after this payment - say so instead of looking done.
      body: `${money(bill.amount)} logged to Activity. Next due ${formatDueDate(result.bill.nextDue, now)}.${result.bill.nextDue < todayIso(now) ? ' Still overdue - mark it paid again to catch up.' : ''}`,
    });
    setPanel(null);
  };

  const submitForm = (input: BillInput) => {
    if (editing) {
      updateBill(editing.id, input);
      setNotice({ tone: 'success', title: `${input.name.trim() || editing.name} updated` });
      setPanel({ type: 'view', id: editing.id });
    } else {
      const bill = addBill(input);
      setNotice({ tone: 'success', title: `${bill.name} added`, body: `${money(bill.amount)} ${FREQUENCY_LABEL[bill.frequency].toLowerCase()}, next due ${formatDueDate(bill.nextDue, now)}.` });
      setPanel(null);
    }
  };

  const togglePause = (bill: Bill) => {
    setPaused(bill.id, !bill.paused);
    setNotice({ tone: 'info', title: bill.paused ? `${bill.name} resumed` : `${bill.name} paused`, body: bill.paused ? undefined : 'It stays in the list but is left out of totals and reminders.' });
  };

  const confirmDelete = (bill: Bill) => {
    removeBill(bill.id);
    setNotice({ tone: 'info', title: `${bill.name} deleted`, body: 'Past payments stay in Activity.' });
    setPanel(null);
  };

  const oldestOverdue = summary.overdue[0];

  return (
    <div className="bdg-stack">
      <PageHeader
        size="lg"
        title="Bills"
        subtitle="Recurring bills & subscriptions"
        actions={
          <div className="bdg-row bdg-gap-2">
            <Button size="sm" onClick={() => setPanel({ type: 'create' })} iconStart={<span aria-hidden="true">+</span>}>
              Add
            </Button>
            {onOpenPaydays && (
              <Button size="sm" variant="ghost" onClick={onOpenPaydays}>
                Paydays
              </Button>
            )}
            <ScreenActions />
          </div>
        }
      />

      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.body}
        </Alert>
      )}

      {oldestOverdue && (
        <Alert
          tone="danger"
          title={summary.overdue.length === 1 ? `${oldestOverdue.name} is overdue` : `${summary.overdue.length} bills are overdue`}
          action={
            <Button size="sm" variant="ghost" onClick={() => openView(oldestOverdue.id)}>
              Review
            </Button>
          }
        >
          {summary.overdue.length === 1
            ? oldestOverdue.arrearsCount > 1
              ? `${money(oldestOverdue.arrearsTotal)} across ${oldestOverdue.arrearsTruncated ? `${oldestOverdue.arrearsCount}+` : oldestOverdue.arrearsCount} missed payments${oldestOverdue.arrearsTruncated ? ' (the count stops there - audit MON-7)' : ''} - the oldest was due ${formatDueDate(oldestOverdue.nextDue, now)}.`
              : `${money(oldestOverdue.amount)} was due ${formatDueDate(oldestOverdue.nextDue, now)}.`
            : `${money(summary.overdueTotal)} in total, counting every missed payment. The oldest is ${oldestOverdue.name}, due ${formatDueDate(oldestOverdue.nextDue, now)}.`}
        </Alert>
      )}

      <div className="bdg-grid-2">
        <StatCard label="Per month" value={shownMonthly} currency={currency} direction="spend" caption={`${shownActive.length} active`} compact />
        <StatCard
          label="To pay this week"
          value={shownAttentionTotal}
          currency={currency}
          direction="spend"
          caption={shownAttention.length === 0 ? 'Nothing due' : `${shownAttention.length} ${shownAttention.length === 1 ? noun : `${noun}s`}`}
          compact
        />
      </div>

      <Tabs
        fullWidth
        aria-label="Filter bills"
        value={filter}
        onChange={(v) => setFilter(v as BillFilter)}
        items={[
          { value: 'all', label: 'All', count: bills.length },
          { value: 'bill', label: 'Bills', count: count('bill') },
          { value: 'subscription', label: 'Subscriptions', count: count('subscription') },
        ]}
      />

      {filter === 'subscription' && <SubscriptionsReview subscriptions={shown} categoryOf={categoryOf} currency={currency} />}

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="🧾"
            title={filter === 'all' ? 'No bills yet' : filter === 'bill' ? 'No recurring bills yet' : 'No subscriptions yet'}
            description={
              filter === 'subscription'
                ? 'Tag the services you pay for - streaming, gym, storage - as subscriptions and this tab lines them up by cost, so you can decide together what is worth keeping.'
                : 'Add your rent, power, insurance and subscriptions with the date they are due, and this tab will keep track of what is coming up.'
            }
            action={<Button onClick={() => setPanel({ type: 'create' })}>{filter === 'subscription' ? 'Add a subscription' : 'Add a bill'}</Button>}
          />
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.bucket} className="bdg-stack bdg-gap-2" aria-label={group.title}>
            <div className="bills-group__head">
              <h2 className="bdg-section-title">{group.title}</h2>
              <span className="bills-group__total">{group.bucket === 'paused' ? `${group.items.length} paused` : money(group.total)}</span>
            </div>
            <Card padding="none">
              {group.items.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  category={categoryOf(bill)}
                  member={memberOf(bill)}
                  currency={currency}
                  onOpen={() => openView(bill.id)}
                  onPaid={!bill.paused && bill.days <= 7 ? () => pay(bill) : undefined}
                />
              ))}
            </Card>
          </section>
        ))
      )}

      {isSample && bills.length > 0 && <p className="bdg-text-xs bdg-text-subtle">Showing sample bills. Add or change one and the list becomes yours.</p>}

      <BillFormDialog
        open={panel?.type === 'create' || (panel?.type === 'edit' && !!editing)}
        bill={editing}
        initialKind={filter === 'subscription' ? 'subscription' : 'bill'}
        onClose={() => setPanel(editing ? { type: 'view', id: editing.id } : null)}
        onSubmit={submitForm}
      />

      <BillSheet
        bill={viewing}
        onClose={() => setPanel(null)}
        onEdit={() => viewing && setPanel({ type: 'edit', id: viewing.id })}
        onPaid={() => viewing && pay(viewing)}
        onTogglePause={() => viewing && togglePause(viewing)}
        onDelete={() => viewing && setPanel({ type: 'delete', id: viewing.id })}
      />

      <Dialog
        open={panel?.type === 'delete' && !!selected}
        size="sm"
        onClose={() => selected && openView(selected.id)}
        title={`Delete ${selected?.name ?? 'this bill'}?`}
        description="It will be removed from your bills. Past payments stay in Activity."
        footer={
          <>
            <Button variant="secondary" onClick={() => selected && openView(selected.id)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => selected && confirmDelete(selected)}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
