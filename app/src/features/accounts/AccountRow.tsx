import { Amount, Badge, Button, formatMoneyAuto } from '@budget-app/ui';
import type { HouseholdMember } from '../../data/types';
import { firstName } from '../../data/split';
import { KIND_ICON, KIND_LABEL } from './types';
import type { AccountView } from './selectors';

interface AccountRowProps {
  account: AccountView;
  member?: HouseholdMember;
  currency: string;
  /** Tap on the row body (opens the detail sheet). */
  onOpen: () => void;
  /** Quick "Pay" action for credit cards carrying a balance. */
  onPay?: () => void;
  /** Smaller icon for the Overview card. */
  compact?: boolean;
}

/**
 * One account: kind icon, name, whose it is, and the balance - what is held
 * (banks) or owed (credit cards). Mirrors BillRow so the lists read the same.
 */
export function AccountRow({ account, member, currency, onOpen, onPay, compact = false }: AccountRowProps) {
  const credit = account.kind === 'credit';
  const owes = credit && account.balanceCents > 0;
  const shownBalance = credit && account.balanceCents < 0 ? -account.balance : account.balance;
  const balanceWord = credit ? (owes ? 'owing' : account.balanceCents < 0 ? 'in credit' : 'paid off') : 'balance';
  // aria-label replaces the button's content for screen readers, so the balance and owner go in too (audit UX-12).
  const label = [account.name, KIND_LABEL[account.kind], member ? firstName(member.name) : 'Joint', `${formatMoneyAuto(shownBalance, { currency })} ${balanceWord}`, account.archived ? 'archived' : undefined]
    .filter(Boolean)
    .join(', ');
  return (
    <div className={`acct-row${compact ? ' acct-row--compact' : ''}${account.archived ? ' acct-row--archived' : ''}`}>
      <button type="button" className="acct-row__main" onClick={onOpen} aria-label={label}>
        <span className="acct-row__icon" aria-hidden="true">
          {KIND_ICON[account.kind]}
        </span>
        <span className="acct-row__body">
          <span className="acct-row__name">{account.name}</span>
          <span className="acct-row__meta">
            <span>{KIND_LABEL[account.kind]}</span>
            <span>{member ? firstName(member.name) : 'Joint'}</span>
            {credit && account.apr !== undefined && !compact && <span>{account.apr}% p.a.</span>}
            {account.archived && (
              <Badge tone="neutral" size="sm">
                Archived
              </Badge>
            )}
          </span>
        </span>
        <span className="acct-row__trailing">
          {/* An overpaid card is IN CREDIT: shown positive, never as red "owing" beside a "paid off" badge (QA7 A-10). */}
          <Amount value={shownBalance} currency={currency} size="md" weight="semibold" tone={account.archived ? 'muted' : owes || (!credit && account.balanceCents < 0) ? 'negative' : 'neutral'} />
          <span className="acct-row__period">{balanceWord}</span>
        </span>
      </button>
      {onPay && (
        <Button size="sm" variant="secondary" className="acct-row__pay" onClick={onPay} aria-label={`Log a payment to ${account.name}`}>
          Pay
        </Button>
      )}
    </div>
  );
}
