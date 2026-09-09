import { useEffect, useState } from 'react';
import { Alert, Amount, AmountInput, Badge, Button, Dialog, formatMoneyAuto } from '@budget-app/ui';
import { firstName, fromCents, toCents } from '../../data/split';
import { useHousehold } from '../../data/store';
import { formatLongDate, todayIso } from '../../lib/dates';
import { useToday } from '../../lib/useToday';
import { currentCardCycle, minPaymentCents, monthlyInterestCents, payoffWithFixedPayment, payoffWithMinimumOnly } from './interest';
import type { AccountView } from './selectors';
import { KIND_LABEL } from './types';

interface AccountSheetProps {
  account: AccountView | null;
  /** Local day of the newest payment logged into this account - tells the card cycle "missed" from "handled". */
  lastPaymentOn?: string;
  onClose: () => void;
  onEdit: () => void;
  /** Opens the move-money dialog (preset to pay this card when it is one). */
  onMove: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const monthsText = (months: number) => (months >= 24 ? `${plural(Math.round(months / 12), 'year')}` : plural(months, 'month'));

/**
 * Detail sheet for one account. For credit cards this is where "what does it
 * cost if we don't pay the whole balance?" gets answered: the live statement
 * window, the minimum payment, and an estimator that takes a payment amount
 * and shows the interest carrying the rest would cost.
 */
export function AccountSheet({ account, lastPaymentOn, onClose, onEdit, onMove, onToggleArchive, onDelete }: AccountSheetProps) {
  const { household, members } = useHousehold();
  const now = useToday();
  // The estimator's payment defaults to paying in full; reset per card.
  const [pay, setPay] = useState<number | null>(null);
  const [payTouched, setPayTouched] = useState(false);
  useEffect(() => {
    setPay(null);
    setPayTouched(false);
  }, [account?.id]);

  if (!account) return null;
  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const member = members.find((m) => m.id === account.memberId);
  const credit = account.kind === 'credit';
  const owedCents = account.balanceCents;
  const owes = credit && owedCents > 0;

  const cycle = credit && account.statementDay !== undefined ? currentCardCycle(account.statementDay, account.dueDaysAfterStatement ?? 25, todayIso(now), lastPaymentOn) : null;
  // The stored floor is money (dollars); the interest helpers work in cents.
  const minFloorCents = account.minPaymentFloor !== undefined ? toCents(account.minPaymentFloor) : undefined;
  const minCents = credit ? minPaymentCents(owedCents, account.minPaymentPercent, minFloorCents) : null;

  // The estimator: what carrying the rest costs.
  const payment = payTouched ? pay ?? 0 : fromCents(Math.max(0, owedCents));
  // Never below zero: a negative "payment" used to grow the carried balance past what is owed (audit MON-10).
  const paymentCents = Math.min(Math.max(0, toCents(payment)), Math.max(0, owedCents));
  const carriedCents = Math.max(0, owedCents - paymentCents);
  const apr = account.apr;
  const monthlyCents = apr !== undefined ? monthlyInterestCents(carriedCents, apr) : 0;
  const projection = apr !== undefined && carriedCents > 0 && payTouched && paymentCents > 0 ? payoffWithFixedPayment(owedCents, apr, paymentCents) : null;
  const minProjection = apr !== undefined && owes ? payoffWithMinimumOnly(owedCents, apr, account.minPaymentPercent, minFloorCents) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={account.name}
      description={`${KIND_LABEL[account.kind]} · ${member ? `${firstName(member.name)}'s` : 'Joint'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button onClick={onMove}>{credit ? 'Log a payment' : 'Move money'}</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <div className="acct-sheet__hero">
          <span className="acct-sheet__amount">
            {/* An overpaid card is IN CREDIT: shown positive, not as red "owing" under a "Paid off" badge (QA7 A-10). */}
            <Amount value={credit && account.balanceCents < 0 ? -account.balance : account.balance} currency={currency} size="xl" weight="bold" tone={owes || (!credit && account.balanceCents < 0) ? 'negative' : 'neutral'} />
            <span className="acct-sheet__period">{credit ? (account.balanceCents < 0 ? 'in credit' : 'owing') : 'balance'}</span>
          </span>
          {credit && !owes && (
            <Badge tone="positive" dot>
              Paid off
            </Badge>
          )}
          {credit && owes && cycle && (
            <Badge tone={cycle.overdue ? 'negative' : cycle.closed ? 'warning' : 'neutral'} dot>
              {cycle.overdue ? `Was due ${formatLongDate(cycle.dueDate)}` : `Pay by ${formatLongDate(cycle.dueDate)}`}
            </Badge>
          )}
        </div>
        <dl className="acct-sheet__facts">
          {credit && account.availableCredit !== null && (
            <>
              <dt>Available credit</dt>
              <dd>{`${money(account.availableCredit)} of ${money(account.creditLimit ?? 0)}`}</dd>
            </>
          )}
          {credit && (
            <>
              <dt>Interest rate</dt>
              <dd>{apr !== undefined ? `${apr}% p.a.` : 'Not set'}</dd>
            </>
          )}
          {cycle && (
            <>
              <dt>{cycle.closed ? 'Statement closed' : 'Statement closes'}</dt>
              <dd>{formatLongDate(cycle.statementDate)}</dd>
              <dt>{cycle.overdue ? 'Payment was due' : 'Payment due'}</dt>
              <dd>{formatLongDate(cycle.dueDate)}</dd>
            </>
          )}
          {credit && minCents !== null && minCents > 0 && (
            <>
              <dt>Minimum payment</dt>
              <dd>{money(fromCents(minCents))}</dd>
            </>
          )}
          <dt>Started at</dt>
          <dd>{money(account.openingBalance)}</dd>
          {account.note && (
            <>
              <dt>Note</dt>
              <dd>{account.note}</dd>
            </>
          )}
        </dl>

        {credit && owes && apr === undefined && (
          <Alert tone="info" title="Add the card's interest rate">
            Edit this card and set its rate (% p.a.) to see what carrying the balance costs.
          </Alert>
        )}

        {credit && owes && apr !== undefined && (
          <div className="acct-sheet__whatif bdg-stack bdg-gap-2">
            <span className="bdg-text-sm bdg-font-medium">If you don't pay it all</span>
            <AmountInput
              label={cycle && !cycle.overdue ? `If you pay this much by ${formatLongDate(cycle.dueDate)}` : 'If you pay this much'}
              currency={currency}
              value={payTouched ? pay : fromCents(owedCents)}
              onValueChange={(v) => {
                setPay(v);
                setPayTouched(true);
              }}
              fullWidth
            />
            {carriedCents <= 0 ? (
              <Alert tone="success">Paying the whole {money(fromCents(owedCents))} means no interest - the interest-free days keep working.</Alert>
            ) : (
              <div className="bdg-stack bdg-gap-1">
                <span className="bdg-text-sm">
                  Carrying {money(fromCents(carriedCents))} costs ≈ <strong>{money(fromCents(monthlyCents))} in interest next month</strong> at {apr}% p.a.
                </span>
                {projection && (
                  <span className="bdg-text-sm bdg-text-muted">
                    Paying {money(fromCents(paymentCents))} every month clears the card in {monthsText(projection.months)} (≈ {money(fromCents(projection.interestCents))} interest all up).
                  </span>
                )}
                {payTouched && paymentCents > 0 && !projection && <span className="bdg-text-sm bdg-text-muted">Paying {money(fromCents(paymentCents))} a month never beats the interest - it would not pay the card off.</span>}
              </div>
            )}
            {minProjection && minCents !== null && minCents > 0 && carriedCents > 0 && (
              <span className="bdg-text-xs bdg-text-muted">
                Minimum payments only ({money(fromCents(minCents))} to start): {monthsText(minProjection.months)} and ≈ {money(fromCents(minProjection.interestCents))} in interest.
              </span>
            )}
            <span className="bdg-text-xs bdg-text-subtle">
              Estimates. Banks charge daily interest on average balances, and once a balance carries over, new purchases usually start collecting interest straight away.
            </span>
          </div>
        )}

        <div className="acct-sheet__secondary">
          <Button size="sm" variant="ghost" onClick={onToggleArchive}>
            {account.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
