import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, PageHeader, StatCard, formatMoneyAuto } from '@budget-app/ui';
import { ScreenActions } from '../../components/ScreenActions';
import { useHousehold } from '../../data/store';
import { dateOnly, formatShortDate } from '../../lib/dates';
import { AccountFormDialog } from './AccountFormDialog';
import { AccountRow } from './AccountRow';
import { AccountSheet } from './AccountSheet';
import { TransferDialog } from './TransferDialog';
import { accountById, lastPaymentOn, selectAccountsSummary, toAccountViews } from './selectors';
import { useAccounts } from './store';
import type { Account, AccountInput, AccountTransfer } from './types';
import './accounts.css';

interface AccountsScreenProps {
  onBack: () => void;
}

type Panel =
  | { type: 'create' }
  | { type: 'view'; id: string }
  | { type: 'edit'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'archive'; id: string }
  | { type: 'move'; toAccountId?: string }
  /** Confirming the removal of one recent move (a transfer id, not an account). */
  | { type: 'remove-move'; id: string }
  | null;

interface Notice {
  tone: 'success' | 'info';
  title: string;
  body?: string;
}

/**
 * Accounts sub-screen: where the household's money sits. Bank balances and
 * card debt derived from what is logged, transfers between accounts, and per
 * card the interest terms that make "what if we don't pay it all?" answerable.
 */
export function AccountsScreen({ onBack }: AccountsScreenProps) {
  const { household, members, transactions } = useHousehold();
  const { accounts, transfers, addAccount, updateAccount, removeAccount, setArchived, addTransfer, removeTransfer } = useAccounts();
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const views = useMemo(() => toAccountViews(accounts, transfers, transactions), [accounts, transfers, transactions]);
  const summary = selectAccountsSummary(views);
  const live = views.filter((v) => !v.archived);
  const banks = live.filter((v) => v.kind !== 'credit');
  const cards = live.filter((v) => v.kind === 'credit');
  const archived = views.filter((v) => v.archived);
  const memberOf = (a: Account) => members.find((m) => m.id === a.memberId);

  const selected = panel && panel.type !== 'create' && panel.type !== 'move' && panel.type !== 'remove-move' ? views.find((v) => v.id === panel.id) ?? null : null;
  const editing = panel?.type === 'edit' ? selected ?? undefined : undefined;
  const removingMove = panel?.type === 'remove-move' ? transfers.find((t) => t.id === panel.id) : undefined;

  // The row a panel is on vanished under it (the partner deleted it and a pull
  // applied): close the panel and say so, instead of the edit form morphing into
  // "Add an account" and saving a brand-new row (audit UX-9).
  useEffect(() => {
    if (!panel || panel.type === 'create' || panel.type === 'move') return;
    if (panel.type === 'remove-move' ? removingMove : selected) return;
    setPanel(null);
    setNotice({ tone: 'info', title: panel.type === 'remove-move' ? 'That move was already removed' : 'That account was removed on another device' });
  }, [panel, selected, removingMove]);

  const submitForm = (input: AccountInput) => {
    if (editing) {
      updateAccount(editing.id, input);
      setNotice({ tone: 'success', title: `${input.name.trim() || editing.name} updated` });
      setPanel({ type: 'view', id: editing.id });
    } else {
      const account = addAccount(input);
      setNotice({ tone: 'success', title: `${account.name} added`, body: account.kind === 'credit' ? 'Purchases you put on it and payments you log move what it owes.' : 'Point purchases, income and bills at it and the balance tracks itself.' });
      setPanel(null);
    }
  };

  const submitMove = (input: Parameters<typeof addTransfer>[0]) => {
    const transfer = addTransfer(input);
    if (!transfer) return;
    const from = accountById(accounts, transfer.fromAccountId);
    const to = accountById(accounts, transfer.toAccountId);
    setNotice({
      tone: 'success',
      title: to?.kind === 'credit' ? `Payment to ${to.name} logged` : 'Money moved',
      body: `${money(transfer.amount)} · ${from?.name ?? 'Outside'} → ${to?.name ?? 'Outside'}`,
    });
    setPanel(null);
  };

  const confirmDelete = (account: Account) => {
    removeAccount(account.id);
    setNotice({ tone: 'info', title: `${account.name} deleted`, body: 'Entries that pointed at it stay in Activity; they just stop counting towards an account.' });
    setPanel(null);
  };

  const describeTransfer = (t: AccountTransfer) => `${accountById(accounts, t.fromAccountId)?.name ?? 'Outside'} → ${accountById(accounts, t.toAccountId)?.name ?? 'Outside'}`;
  // Newest first BY DATE: local adds prepend but sync APPENDS the partner's
  // rows, so array order would bury their payments entirely (QA7 A-6).
  const recentMoves = useMemo(() => [...transfers].sort((a, b) => (a.date === b.date ? (a.createdAt > b.createdAt ? -1 : 1) : a.date > b.date ? -1 : 1)).slice(0, 6), [transfers]);

  const doArchive = (account: (typeof views)[number]) => {
    setArchived(account.id, !account.archived);
    setNotice({ tone: 'info', title: account.archived ? `${account.name} unarchived` : `${account.name} archived`, body: account.archived ? undefined : 'It stays in history but leaves the pickers and totals.' });
    setPanel(null);
  };

  return (
    <div className="bdg-stack accounts">
      <PageHeader
        size="lg"
        title="Accounts"
        subtitle="Bank accounts & credit cards"
        onBack={onBack}
        backLabel="Overview"
        actions={
          <div className="bdg-row bdg-gap-2">
            <Button size="sm" onClick={() => setPanel({ type: 'create' })} iconStart={<span aria-hidden="true">+</span>}>
              Add
            </Button>
            <ScreenActions />
          </div>
        }
      />

      {notice && (
        <Alert tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.body}
        </Alert>
      )}

      {views.length === 0 ? (
        <Card>
          <EmptyState
            icon="🏦"
            title="Add your accounts"
            description="Bank accounts and credit cards, so every purchase can say what it was paid with - and every card can say what not paying it off would cost."
            action={
              <Button onClick={() => setPanel({ type: 'create' })} iconStart={<span aria-hidden="true">+</span>}>
                Add an account
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="bdg-grid-2 accounts-stats">
            <StatCard label="In the bank" value={summary.inBank} currency={currency} tone="primary" caption={summary.hasBank ? `Across ${banks.length} ${banks.length === 1 ? 'account' : 'accounts'}` : 'No bank accounts yet'} icon="🏦" />
            <StatCard
              label="Owing on cards"
              value={summary.owed}
              currency={currency}
              direction="spend"
              caption={
                summary.hasCards
                  ? // Credit is reported beside the debt, never netted against it (audit MF-9).
                    `${summary.owed > 0 ? `Across ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}` : 'All paid off 🎉'}${summary.cardCredit > 0 ? ` · ${formatMoneyAuto(summary.cardCredit, { currency })} in credit` : ''}`
                  : archived.some((v) => v.kind === 'credit')
                    ? 'Only archived cards'
                    : 'No credit cards yet'
              }
              icon="💳"
            />
          </div>

          {banks.length > 0 && (
            <Card title="Bank accounts" padding="none">
              {banks.map((v) => (
                <AccountRow key={v.id} account={v} member={memberOf(v)} currency={currency} onOpen={() => setPanel({ type: 'view', id: v.id })} />
              ))}
            </Card>
          )}

          {cards.length > 0 && (
            <Card title="Credit cards" padding="none">
              {cards.map((v) => (
                <AccountRow
                  key={v.id}
                  account={v}
                  member={memberOf(v)}
                  currency={currency}
                  onOpen={() => setPanel({ type: 'view', id: v.id })}
                  onPay={v.balanceCents > 0 ? () => setPanel({ type: 'move', toAccountId: v.id }) : undefined}
                />
              ))}
            </Card>
          )}

          <Card
            title="Recent moves"
            subtitle="Transfers and card payments - never counted as spending"
            padding="none"
            actions={
              <Button size="sm" variant="ghost" onClick={() => setPanel({ type: 'move' })}>
                Move money
              </Button>
            }
          >
            {recentMoves.length === 0 ? (
              <EmptyState compact icon="🔁" title="Nothing moved yet" description="Card payments, savings top-ups and cash in or out go here." />
            ) : (
              recentMoves.map((t) => (
                <div key={t.id} className="acct-move">
                  <span className="acct-move__body">
                    <span className="acct-move__route">{describeTransfer(t)}</span>
                    <span className="acct-move__meta">
                      {formatShortDate(dateOnly(t.date))}
                      {t.note ? ` · ${t.note}` : ''}
                    </span>
                  </span>
                  <span className="acct-move__amount">{money(t.amount)}</span>
                  {/* Two-step, like every other money row: one thumb-brush used to delete a card payment outright (audit UX-7 / UI-9). */}
                  <Button size="sm" variant="ghost" onClick={() => setPanel({ type: 'remove-move', id: t.id })} aria-label={`Remove the move of ${money(t.amount)} (${describeTransfer(t)})`}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </Card>

          {archived.length > 0 && (
            <Card title="Archived" padding="none">
              {archived.map((v) => (
                <AccountRow key={v.id} account={v} member={memberOf(v)} currency={currency} onOpen={() => setPanel({ type: 'view', id: v.id })} />
              ))}
            </Card>
          )}
        </>
      )}

      <AccountFormDialog
        open={panel?.type === 'create' || (panel?.type === 'edit' && !!editing)}
        account={editing}
        currentBalance={editing?.balance}
        onClose={() => setPanel(editing ? { type: 'view', id: editing.id } : null)}
        onSubmit={submitForm}
      />

      {removingMove && (
        <Dialog
          open
          size="sm"
          onClose={() => setPanel(null)}
          title="Remove this move?"
          description={`${money(removingMove.amount)} · ${describeTransfer(removingMove)} on ${formatShortDate(dateOnly(removingMove.date))}. The balances go back to before it was logged${accountById(accounts, removingMove.toAccountId)?.kind === 'credit' ? ', and the card counts as unpaid again' : ''}.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPanel(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  removeTransfer(removingMove.id);
                  setNotice({ tone: 'info', title: 'Move removed', body: `${money(removingMove.amount)} · ${describeTransfer(removingMove)} no longer counts towards either balance.` });
                  setPanel(null);
                }}
              >
                Remove
              </Button>
            </>
          }
        />
      )}

      <TransferDialog
        open={panel?.type === 'move'}
        accounts={accounts}
        preset={panel?.type === 'move' && panel.toAccountId ? { toAccountId: panel.toAccountId } : undefined}
        balanceCentsOf={(id) => views.find((v) => v.id === id)?.balanceCents}
        onClose={() => setPanel(null)}
        onSubmit={submitMove}
      />

      {panel?.type === 'view' && (
        <AccountSheet
          account={selected}
          lastPaymentOn={selected ? lastPaymentOn(selected.id, transfers) : undefined}
          onClose={() => setPanel(null)}
          onEdit={() => setPanel({ type: 'edit', id: panel.id })}
          onMove={() => setPanel({ type: 'move', toAccountId: selected?.kind === 'credit' ? panel.id : undefined })}
          onToggleArchive={() => {
            if (!selected) return;
            // Archiving a card that still owes hides real debt and stops its
            // payment reminders - say so first (QA7 L-arch).
            if (!selected.archived && selected.kind === 'credit' && selected.balanceCents > 0) {
              setPanel({ type: 'archive', id: selected.id });
              return;
            }
            doArchive(selected);
          }}
          onDelete={() => setPanel({ type: 'delete', id: panel.id })}
        />
      )}

      {panel?.type === 'archive' && selected && (
        <Dialog
          open
          onClose={() => setPanel({ type: 'view', id: panel.id })}
          title={`Archive ${selected.name}?`}
          description={`It still owes ${money(selected.balance)}. Archiving hides it from the totals and stops its payment reminders - the debt itself doesn't go anywhere.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPanel({ type: 'view', id: panel.id })}>
                Keep it
              </Button>
              <Button onClick={() => doArchive(selected)}>Archive anyway</Button>
            </>
          }
        />
      )}

      {panel?.type === 'delete' && selected && (
        <Dialog
          open
          onClose={() => setPanel({ type: 'view', id: panel.id })}
          title={`Delete ${selected.name}?`}
          description="Entries that pointed at it stay in Activity, but its balance and history here go. Archiving keeps the history instead."
          footer={
            <>
              <Button variant="secondary" onClick={() => setPanel({ type: 'view', id: panel.id })}>
                Keep it
              </Button>
              <Button variant="danger" onClick={() => confirmDelete(selected)}>
                Delete account
              </Button>
            </>
          }
        >
          <span className="bdg-text-sm bdg-text-muted">
            {selected.kind === 'credit' && selected.balanceCents > 0 ? `It still shows ${money(selected.balance)} owing.` : 'This only removes the account from the app - not from your bank.'}
          </span>
        </Dialog>
      )}
    </div>
  );
}
