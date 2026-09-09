import { useMemo } from 'react';
import { Amount, Button, Card, EmptyState, formatMoneyAuto } from '@budget-app/ui';
import { useHousehold } from '../../data/store';
import { selectAccountsSummary, toAccountViews } from './selectors';
import { useAccounts } from './store';
import { KIND_ICON } from './types';
import './accounts.css';

interface AccountsCardProps {
  /** Opens the Accounts sub-screen. */
  onOpen: () => void;
}

/**
 * Overview card: the live accounts and what they hold or owe, with the
 * bank-vs-cards totals as the subtitle. Tap anything to manage them.
 */
export function AccountsCard({ onOpen }: AccountsCardProps) {
  const { household, transactions } = useHousehold();
  const { accounts, transfers } = useAccounts();
  const currency = household.currency;
  const views = useMemo(() => toAccountViews(accounts, transfers, transactions).filter((v) => !v.archived), [accounts, transfers, transactions]);
  const summary = selectAccountsSummary(views);
  const shown = views.slice(0, 4);

  return (
    <Card
      title="Accounts"
      subtitle={
        views.length > 0
          ? // Debt and credit stated separately, never netted (audit MF-9).
            `${formatMoneyAuto(summary.inBank, { currency })} in the bank${summary.hasCards ? ` · ${formatMoneyAuto(summary.owed, { currency })} on cards` : ''}${summary.cardCredit > 0 ? ` · ${formatMoneyAuto(summary.cardCredit, { currency })} in credit` : ''}`
          : undefined
      }
      padding="none"
      actions={
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Manage accounts
        </Button>
      }
    >
      {shown.length === 0 ? (
        <EmptyState compact icon="🏦" title="No accounts yet" description="Add your bank accounts and credit cards to see balances and card interest." action={<Button size="sm" onClick={onOpen}>Add accounts</Button>} />
      ) : (
        shown.map((v) => {
          const credit = v.kind === 'credit';
          const owes = credit && v.balanceCents > 0;
          // An overpaid card is IN CREDIT: shown positive with its own tag, never as a red negative (QA7 A-10, mirrored here - audit MF-10).
          const inCredit = credit && v.balanceCents < 0;
          const balance = inCredit ? -v.balance : v.balance;
          const word = owes ? 'owing' : inCredit ? 'in credit' : 'balance';
          return (
            <button key={v.id} type="button" className="acct-card-row" onClick={onOpen} aria-label={`${v.name}, ${word} ${formatMoneyAuto(balance, { currency })}`}>
              <span className="acct-card-row__icon" aria-hidden="true">
                {KIND_ICON[v.kind]}
              </span>
              <span className="acct-card-row__name">{v.name}</span>
              <span className="acct-card-row__amount">
                <Amount value={balance} currency={currency} size="sm" weight="semibold" tone={owes || (!credit && v.balanceCents < 0) ? 'negative' : 'neutral'} />
                {(owes || inCredit) && <span className="acct-card-row__tag">{word}</span>}
              </span>
            </button>
          );
        })
      )}
    </Card>
  );
}
