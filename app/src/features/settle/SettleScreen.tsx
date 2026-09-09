import { useMemo, useState } from 'react';
import { Alert, Amount, Button, Card, Dialog, EmptyState, MemberChip, PageHeader, StatCard, formatMoneyAuto } from '@budget-app/ui';
import { TransactionDialog } from '../../components/TransactionDialog';
import { firstName } from '../../data/split';
import { useHousehold } from '../../data/store';
import type { TransactionRecord } from '../../data/types';
import { dateOnly, formatLongDate } from '../../lib/dates';
import { LedgerRow } from './LedgerRow';
import { balanceSentence, pairAwaiting, pairNet, selectLedger } from './selectors';
import { useSettlements } from './store';
import { SettleUpDialog } from './SettleUpDialog';
import { METHOD_LABEL, type Settlement } from './types';
import './settle.css';

interface SettleScreenProps {
  onBack: () => void;
}

/**
 * The full settle-up view between the signed-in member and one other member:
 * the balance, a warning for purchases not yet counted, and the history of
 * shared purchases and payments with running balances.
 */
export function SettleScreen({ onBack }: SettleScreenProps) {
  const state = useHousehold();
  const { household, members, categories, currentMemberId } = state;
  const { settlements, addSettlement, removeSettlement } = useSettlements();
  const currency = household.currency;
  const me = members.find((m) => m.id === currentMemberId);
  const others = members.filter((m) => m.id !== currentMemberId);
  const [otherId, setOtherId] = useState<string>(others[0]?.id ?? '');
  const other = others.find((m) => m.id === otherId) ?? others[0];
  const [settleOpen, setSettleOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Settlement | null>(null);
  const [viewingTxn, setViewingTxn] = useState<TransactionRecord | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const ledger = useMemo(() => (me && other ? selectLedger(state, settlements, me.id, other.id) : []), [state, settlements, me, other]);
  const net = me && other ? pairNet(state, settlements, me.id, other.id) : 0;
  const awaiting = me && other ? pairAwaiting(state, me.id, other.id) : 0;
  const otherName = other ? firstName(other.name) : 'your partner';
  const sentence = balanceSentence(net, otherName);

  if (!me || !other) {
    return (
      <div className="bdg-stack settle">
        <PageHeader size="lg" title="Settle up" onBack={onBack} backLabel="Back" />
        <EmptyState icon="🤝" title="Nobody to settle with yet" description="Add your partner on the Household tab and shared purchases will be split between you." />
      </div>
    );
  }

  return (
    <div className="bdg-stack settle">
      <PageHeader
        size="lg"
        title="Settle up"
        subtitle={`Between you and ${otherName}`}
        onBack={onBack}
        backLabel="Back"
        actions={
          <Button size="sm" onClick={() => setSettleOpen(true)}>
            Settle up
          </Button>
        }
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {awaiting !== 0 && (
        <Alert tone="warning" title={`${formatMoneyAuto(Math.abs(awaiting), { currency })} is waiting on confirmation`}>
          Shared purchases that are pending or disputed are left out of the balance until they are confirmed.
        </Alert>
      )}

      <StatCard
        tone="primary"
        label={sentence}
        value={Math.abs(net)}
        currency={currency}
        caption={(() => {
          const purchases = ledger.filter((e) => e.kind === 'purchase' && !e.excluded).length;
          const payments = ledger.filter((e) => e.kind === 'settlement').length;
          return `${purchases} shared ${purchases === 1 ? 'purchase' : 'purchases'} · ${payments} ${payments === 1 ? 'payment' : 'payments'}`;
        })()}
        icon="🤝"
      />

      {others.length > 1 && (
        <div className="bdg-row bdg-wrap bdg-gap-2" role="group" aria-label="Settle with">
          {others.map((m) => (
            <MemberChip key={m.id} name={m.name} color={m.color} selected={m.id === other.id} onSelect={() => setOtherId(m.id)} />
          ))}
        </div>
      )}

      <h2 className="bdg-section-title">History</h2>
      <Card padding="none">
        {ledger.length === 0 ? (
          <EmptyState compact icon="🧾" title="No shared purchases yet" description={`Tick "Split with ${otherName}" when logging a purchase.`} />
        ) : (
          ledger.map((entry) => (
            <LedgerRow
              key={`${entry.kind}:${entry.id}`}
              entry={entry}
              viewerId={me.id}
              otherName={otherName}
              members={members}
              categories={categories}
              currency={currency}
              onClick={() => (entry.kind === 'settlement' ? setViewing(entry.source as Settlement) : setViewingTxn(entry.source as TransactionRecord))}
            />
          ))
        )}
      </Card>

      <SettleUpDialog
        open={settleOpen}
        me={me}
        other={other}
        net={net}
        currency={currency}
        onClose={() => setSettleOpen(false)}
        onSubmit={(input) => {
          const s = addSettlement(input);
          setSettleOpen(false);
          if (s) setNotice(`${formatMoneyAuto(s.amount, { currency })} recorded.`);
        }}
      />

      <TransactionDialog transaction={viewingTxn} onClose={() => setViewingTxn(null)} />

      {viewing && (
        <Dialog
          open
          onClose={() => {
            setViewing(null);
            setConfirmRemove(false);
          }}
          size="sm"
          title={`${viewing.fromMemberId === me.id ? 'You' : firstName(members.find((m) => m.id === viewing.fromMemberId)?.name ?? '')} paid ${viewing.toMemberId === me.id ? 'you' : firstName(members.find((m) => m.id === viewing.toMemberId)?.name ?? '')}`}
          description={formatLongDate(dateOnly(viewing.date))}
          footer={
            confirmRemove ? (
              <>
                <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    removeSettlement(viewing.id);
                    setViewing(null);
                    setConfirmRemove(false);
                    setNotice('Payment removed - the balance has been recalculated.');
                  }}
                >
                  Remove payment
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setViewing(null)}>
                  Close
                </Button>
                <Button variant="danger" onClick={() => setConfirmRemove(true)}>
                  Remove
                </Button>
              </>
            )
          }
        >
          <div className="bdg-stack bdg-gap-2">
            <Amount value={viewing.amount} currency={currency} size="display" weight="bold" />
            <span className="bdg-text-sm bdg-text-muted">{[viewing.method ? METHOD_LABEL[viewing.method] : undefined, viewing.note].filter(Boolean).join(' · ') || 'Payment'}</span>
            {confirmRemove && <Alert tone="warning">Removing a payment puts its amount back on the balance.</Alert>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
