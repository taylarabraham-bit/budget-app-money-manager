import { useEffect, useState } from 'react';
import { Alert, Amount, Avatar, Badge, Button, Dialog, TextField, formatMoneyAuto } from '@budget-app/ui';
import { describeSplit, firstName, isShared, shareOf, splitShares } from '../data/split';
import { useReceiptUrl } from '../data/receipts';
import { useHousehold } from '../data/store';
import { KIND_ICON, accountById, useAccounts } from '../features/accounts';
import { useLogPurchase } from './LogPurchaseProvider';
import type { TransactionRecord } from '../data/types';

interface TransactionDialogProps {
  transaction: TransactionRecord | null;
  onClose: () => void;
}

/**
 * Detail view for one purchase or income entry: how a shared purchase is
 * split, confirm / dispute when it is waiting on you, "make personal" for a
 * disputed one you logged, and a two-step delete.
 */
export function TransactionDialog({ transaction, onClose }: TransactionDialogProps) {
  const { categories, members, household, currentMemberId, removeTransaction, confirmTransaction, disputeTransaction, updateTransaction } = useHousehold();
  const { accounts } = useAccounts();
  const [confirming, setConfirming] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const { edit } = useLogPurchase();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const receiptUrl = useReceiptUrl(transaction?.id ?? null, !!transaction?.hasReceipt);
  useEffect(() => {
    if (!transaction) {
      setConfirming(false);
      setDisputing(false);
      setReason('');
      setReceiptOpen(false);
    }
  }, [transaction]);
  if (!transaction) return null;

  const t = transaction;
  const category = categories.find((c) => c.id === t.categoryId);
  const member = members.find((m) => m.id === t.memberId);
  // Who LOGGED it: the partner can log a shared purchase with "Paid by" set to the reader (audit UX-11).
  const logger = members.find((m) => m.id === (t.loggedBy ?? t.memberId));
  const when = new Date(t.date).toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const isIncome = t.amount > 0;
  const currency = household.currency;
  const shared = !isIncome && isShared(t);
  const shares = shared ? splitShares(t, household, members) : [];
  const myShare = shared ? shareOf(t, currentMemberId, household, members) : 0;
  const awaitingMe = !!t.needsApprovalFrom?.includes(currentMemberId);
  const loggedByMe = (t.loggedBy ?? t.memberId) === currentMemberId;
  const awaitingNames = (t.needsApprovalFrom ?? []).map((id) => firstName(members.find((m) => m.id === id)?.name ?? 'someone'));
  const disputer = t.disputed ? firstName(members.find((m) => m.id === t.disputed!.byMemberId)?.name ?? 'Someone') : null;

  if (confirming) {
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title={isIncome ? 'Delete this income?' : 'Delete this purchase?'}
        description={`This removes ${t.title} from ${category?.name ?? 'the log'}. It cannot be undone.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                removeTransaction(t.id);
                onClose();
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    );
  }

  const footer = awaitingMe ? (
    disputing ? (
      <>
        <Button variant="secondary" onClick={() => setDisputing(false)}>
          Back
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            disputeTransaction(t.id, currentMemberId, reason);
            onClose();
          }}
        >
          Send dispute
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={() => setDisputing(true)}>
          Dispute
        </Button>
        <Button
          onClick={() => {
            confirmTransaction(t.id, currentMemberId);
            onClose();
          }}
        >
          Confirm
        </Button>
      </>
    )
  ) : (
    // Last = primary slot (top on phone sheets, right on desktop), so Edit goes last and Delete first.
    <>
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete
      </Button>
      {shared && t.disputed && loggedByMe && (
        <Button
          variant="secondary"
          onClick={() => {
            updateTransaction(t.id, { shared: false });
            onClose();
          }}
        >
          Make personal
        </Button>
      )}
      <Button
        variant="secondary"
        onClick={() => {
          // Close first so the two dialogs never stack.
          onClose();
          edit(t);
        }}
      >
        Edit
      </Button>
    </>
  );

  return (
    <Dialog open onClose={onClose} title={t.title} description={when} footer={footer}>
      <div className="bdg-stack">
        <div className="bdg-row-between">
          <Amount value={t.amount} currency={currency} size="display" weight="bold" tone={isIncome ? 'positive' : 'neutral'} signDisplay={isIncome ? 'exceptZero' : 'auto'} />
          <div className="bdg-row bdg-gap-1 bdg-wrap">
            {t.pending && !t.needsApprovalFrom?.length && !t.disputed && <Badge tone="neutral">Pending</Badge>}
            {!!t.needsApprovalFrom?.length && !t.disputed && <Badge tone="info">Awaiting {awaitingNames.join(' & ')}</Badge>}
            {t.disputed && <Badge tone="warning">Disputed</Badge>}
            {t.recurring && <Badge tone="info">Recurring</Badge>}
            {shared && <Badge tone="positive">Shared</Badge>}
          </div>
        </div>
        {awaitingMe && !disputing && (
          <Alert tone="info" title={`${firstName(logger?.name ?? 'Your partner')} logged this as shared`}>
            Your share is {formatMoneyAuto(myShare, { currency })}. Confirm to count it towards what you owe, or dispute it if something is off.
          </Alert>
        )}
        {disputing && (
          <TextField label="What's wrong?" placeholder="e.g. I wasn't there that night" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth autoFocus />
        )}
        {t.disputed && !disputing && (
          <Alert tone="warning" title={`${disputer} disputed this purchase`}>
            {t.disputed.reason ? `"${t.disputed.reason}" · ` : ''}It stays in the log but is left out of the settle-up balance{loggedByMe ? ' - make it personal, delete it, or talk it through.' : '.'}
          </Alert>
        )}
        <div className="txn-detail">
          <div className="txn-detail__row">
            <span className="txn-detail__label">{isIncome ? 'Source' : 'Category'}</span>
            <span className="txn-detail__value">
              {category?.icon} {category?.name ?? 'Uncategorised'}
            </span>
          </div>
          <div className="txn-detail__row">
            <span className="txn-detail__label">{isIncome ? 'Earned by' : 'Paid by'}</span>
            <span className="txn-detail__value bdg-row bdg-gap-2">
              {member && <Avatar name={member.name} color={member.color} size="xs" />}
              {member?.name ?? 'Unknown'}
            </span>
          </div>
          <div className="txn-detail__row">
            <span className="txn-detail__label">Budget</span>
            <span className="txn-detail__value">{shared ? `Shared · ${describeSplit(shares, members, currency)}` : `${member ? firstName(member.name) : 'Personal'}'s personal budget`}</span>
          </div>
          {shared && myShare > 0 && (
            <div className="txn-detail__row">
              <span className="txn-detail__label">Your share</span>
              <span className="txn-detail__value">{formatMoneyAuto(myShare, { currency })}</span>
            </div>
          )}
          {t.accountId && (
            <div className="txn-detail__row">
              <span className="txn-detail__label">{isIncome ? 'Paid into' : 'Paid with'}</span>
              <span className="txn-detail__value">
                {(() => {
                  const account = accountById(accounts, t.accountId);
                  return account ? `${KIND_ICON[account.kind]} ${account.name}` : 'An account since removed';
                })()}
              </span>
            </div>
          )}
          {t.note && (
            <div className="txn-detail__row">
              <span className="txn-detail__label">Note</span>
              <span className="txn-detail__value">{t.note}</span>
            </div>
          )}
          {t.hasReceipt && (
            <div className="txn-detail__row">
              <span className="txn-detail__label">Receipt</span>
              <span className="txn-detail__value">
                {receiptUrl ? (
                  <button type="button" className="receipt-thumb" onClick={() => setReceiptOpen((o) => !o)} aria-expanded={receiptOpen} aria-label={receiptOpen ? 'Shrink receipt photo' : 'Show receipt photo'}>
                    <img className="receipt-thumb__img" src={receiptUrl} alt="Receipt" />
                  </button>
                ) : (
                  <span className="bdg-text-muted">Photo not found on this device</span>
                )}
              </span>
            </div>
          )}
        </div>
        {receiptOpen && receiptUrl && (
          <button type="button" className="receipt-view" onClick={() => setReceiptOpen(false)} aria-label="Shrink receipt photo">
            <img className="receipt-view__img" src={receiptUrl} alt="Receipt, full size" />
          </button>
        )}
      </div>
    </Dialog>
  );
}
