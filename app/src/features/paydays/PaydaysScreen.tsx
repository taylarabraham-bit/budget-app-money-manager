import { useEffect, useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, PageHeader, StatCard, formatMoneyAuto } from '@budget-app/ui';
import { firstName } from '../../data/split';
import { useHousehold } from '../../data/store';
import { combineDateTime, formatShortDate, toHhmm, todayIso } from '../../lib/dates';
import { FREQUENCY_LABEL } from '../../lib/frequency';
import { useToday } from '../../lib/useToday';
import { PaydayFormDialog } from './PaydayFormDialog';
import { PaydayRow } from './PaydayRow';
import { PaydaySheet } from './PaydaySheet';
import { ReceiveDialog } from './ReceiveDialog';
import { groupPaydays, selectPaydays, selectPaydaysSummary, toPaydayView } from './selectors';
import { usePaydays } from './store';
import type { IncomeSchedule, IncomeScheduleInput } from './types';
import './paydays.css';

interface PaydaysScreenProps {
  onBack: () => void;
}

type Panel = { type: 'create' } | { type: 'view'; id: string } | { type: 'edit'; id: string } | { type: 'delete'; id: string } | { type: 'receive'; id: string } | null;

interface Notice {
  tone: 'success' | 'info';
  title: string;
  body?: string;
}

/** A calendar day as a local datetime: noon for past days, the current time for today. */
function receivedAt(day: string): string {
  return combineDateTime(day, day === todayIso() ? toHhmm(new Date()) : '12:00');
}

/**
 * Paydays sub-screen (under Bills): when each person's pay arrives, what it
 * adds up to per month, and the add / received / edit / pause / delete
 * flows. Marking a payday received logs the income in the household store so
 * it shows in Activity and today's earnings, and rolls the date forward.
 */
export function PaydaysScreen({ onBack }: PaydaysScreenProps) {
  const { categories, members, household, addTransaction } = useHousehold();
  const { schedules, isSample, addSchedule, updateSchedule, removeSchedule, setPaused, markReceived } = usePaydays();
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Refreshes at midnight and on app-visible, so Today/Tomorrow buckets never go stale (QA L9 class).
  const now = useToday();
  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const summary = selectPaydaysSummary(schedules, members, now);
  const groups = groupPaydays(selectPaydays(schedules, now));

  const byId = (id: string) => schedules.find((s) => s.id === id);
  const categoryOf = (s: IncomeSchedule) => categories.find((c) => c.id === s.categoryId);
  const memberOf = (s: IncomeSchedule) => members.find((m) => m.id === s.memberId);

  const selected = panel && panel.type !== 'create' ? byId(panel.id) : undefined;
  const viewing = panel?.type === 'view' && selected ? toPaydayView(selected, now) : null;
  const editing = panel?.type === 'edit' ? selected : undefined;
  const receiving = panel?.type === 'receive' ? selected ?? null : null;

  // The row a panel is on vanished under it (the partner deleted it and a pull
  // applied): close the panel and say so, instead of the edit form morphing into
  // "Add a payday" and saving a brand-new row (audit UX-9).
  useEffect(() => {
    if (!panel || panel.type === 'create' || selected) return;
    setPanel(null);
    setNotice({ tone: 'info', title: 'That payday was removed on another device' });
  }, [panel, selected]);

  const openView = (id: string) => setPanel({ type: 'view', id });

  const receive = (schedule: IncomeSchedule, amount?: number, receivedOn?: string) => {
    const result = markReceived(schedule.id, { amount, receivedOn });
    if (!result) return;
    addTransaction({
      kind: 'income',
      amount: result.amount,
      categoryId: schedule.categoryId,
      memberId: schedule.memberId,
      title: schedule.name,
      recurring: true,
      note: `${FREQUENCY_LABEL[schedule.frequency]} pay`,
      date: receivedAt(receivedOn ?? todayIso()),
      accountId: schedule.accountId,
    });
    setNotice({
      tone: 'success',
      title: `${schedule.name} received`,
      // One tap logs one occurrence; several periods behind stays "expected" until each is received.
      body: `${money(result.amount)} logged to Activity. Next ${formatShortDate(result.schedule.nextDate, now)}.${result.schedule.nextDate < todayIso(now) ? ' Still behind - mark it received again to catch up.' : ''}`,
    });
    setPanel(null);
  };

  const startReceive = (schedule: IncomeSchedule) => (schedule.variable ? setPanel({ type: 'receive', id: schedule.id }) : receive(schedule));

  const submitForm = (input: IncomeScheduleInput) => {
    if (editing) {
      updateSchedule(editing.id, input);
      setNotice({ tone: 'success', title: `${input.name.trim() || editing.name} updated` });
      setPanel({ type: 'view', id: editing.id });
    } else {
      const s = addSchedule(input);
      setNotice({ tone: 'success', title: `${s.name} added`, body: `${money(s.amount)} ${FREQUENCY_LABEL[s.frequency].toLowerCase()}, next ${formatShortDate(s.nextDate, now)}.` });
      setPanel(null);
    }
  };

  const togglePause = (s: IncomeSchedule) => {
    setPaused(s.id, !s.paused);
    setNotice({ tone: 'info', title: s.paused ? `${s.name} resumed` : `${s.name} paused`, body: s.paused ? undefined : 'It stays in the list but is left out of the forecast.' });
  };

  const confirmDelete = (s: IncomeSchedule) => {
    removeSchedule(s.id);
    setNotice({ tone: 'info', title: `${s.name} deleted`, body: 'Income already logged stays in Activity.' });
    setPanel(null);
  };

  const next = summary.next;
  const nextMember = next ? members.find((m) => m.id === next.memberId) : undefined;

  return (
    <div className="bdg-stack paydays">
      <PageHeader
        size="lg"
        title="Paydays"
        subtitle="Salary & regular income"
        onBack={onBack}
        backLabel="Bills"
        actions={
          <Button size="sm" onClick={() => setPanel({ type: 'create' })} iconStart={<span aria-hidden="true">+</span>}>
            Add
          </Button>
        }
      />

      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.body}
        </Alert>
      )}

      <div className="bdg-grid-2">
        <StatCard
          tone="primary"
          label="Next payday"
          valueText={next ? (next.days < 0 ? 'Expected' : next.days === 0 ? 'Today' : next.days === 1 ? 'Tomorrow' : `${next.days} days`) : 'Not set'}
          caption={
            next
              ? // A payday several periods behind says how many are still owed (audit MF-11 / MON-13).
                `${formatShortDate(next.nextDate, now)} · ${nextMember ? `${firstName(nextMember.name)}'s ` : ''}${next.name} · ${money(next.amount)}${next.awaitingCount > 1 ? ` · ${next.awaitingTruncated ? `${next.awaitingCount}+` : next.awaitingCount} not received, ${money(next.awaitingTotal)}` : ''}`
              : 'Add when pay arrives and Overview will count down to it.'
          }
          icon="📅"
        />
        <StatCard compact label="Expected per month" value={summary.monthlyTotal} currency={currency} caption={`${summary.activeCount} active${summary.pausedCount ? ` · ${summary.pausedCount} paused` : ''}`} icon="💼" />
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="💼"
            title="No paydays yet"
            description="Add when salary or regular income lands, and the Overview will count down to it and plan what is safe to spend until then."
            action={<Button onClick={() => setPanel({ type: 'create' })}>Add a payday</Button>}
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
              {group.items.map((p) => (
                <PaydayRow key={p.id} payday={p} category={categoryOf(p)} member={memberOf(p)} currency={currency} onOpen={() => openView(p.id)} onReceived={!p.paused && p.days <= 7 ? () => startReceive(p) : undefined} />
              ))}
            </Card>
          </section>
        ))
      )}

      {isSample && schedules.length > 0 && <p className="bdg-text-xs bdg-text-subtle">Showing sample paydays. Add or change one and the list becomes yours.</p>}

      <PaydayFormDialog open={panel?.type === 'create' || (panel?.type === 'edit' && !!editing)} payday={editing} onClose={() => setPanel(editing ? { type: 'view', id: editing.id } : null)} onSubmit={submitForm} />

      <PaydaySheet
        payday={viewing}
        onClose={() => setPanel(null)}
        onEdit={() => viewing && setPanel({ type: 'edit', id: viewing.id })}
        onReceived={() => viewing && startReceive(viewing)}
        onTogglePause={() => viewing && togglePause(viewing)}
        onDelete={() => viewing && setPanel({ type: 'delete', id: viewing.id })}
      />

      <ReceiveDialog payday={receiving} currency={currency} onClose={() => receiving && openView(receiving.id)} onSubmit={(amount, on) => receiving && receive(receiving, amount, on)} />

      <Dialog
        open={panel?.type === 'delete' && !!selected}
        size="sm"
        onClose={() => selected && openView(selected.id)}
        title={`Delete ${selected?.name ?? 'this payday'}?`}
        description="It will be removed from your paydays. Income already logged stays in Activity."
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
