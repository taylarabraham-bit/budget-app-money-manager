import { Amount, Button, formatMoneyAuto } from '@budget-app/ui';
import type { Category, HouseholdMember } from '../../data/types';
import type { BillView } from './selectors';
import { FREQUENCY_LABEL, FREQUENCY_SUFFIX } from './types';

interface BillRowProps {
  bill: BillView;
  category?: Category;
  member?: HouseholdMember;
  currency: string;
  /** Tap on the row body (opens the detail sheet). */
  onOpen: () => void;
  /** Quick "Paid" action; shown only when provided (bills needing attention). */
  onPaid?: () => void;
  /** Smaller icon for the Home card. */
  compact?: boolean;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * One subscription or bill: category icon, name, due status and the cost with
 * its period. The body is a button that opens the detail sheet; the optional
 * "Paid" button sits beside it so the two controls never nest.
 */
export function BillRow({ bill, category, member, currency, onOpen, onPaid, compact = false }: BillRowProps) {
  const dueClass =
    bill.bucket === 'overdue' ? 'bill-row__due bill-row__due--overdue' : bill.bucket === 'today' ? 'bill-row__due bill-row__due--today' : bill.bucket === 'week' ? 'bill-row__due bill-row__due--week' : 'bill-row__due';
  // aria-label replaces the button's content for screen readers, so the amount, period and payer go in too (audit UX-12).
  const label = [bill.name, bill.dueText, `${formatMoneyAuto(bill.amount, { currency })} ${FREQUENCY_LABEL[bill.frequency].toLowerCase()}`, member ? firstName(member.name) : undefined].filter(Boolean).join(', ');
  return (
    <div className={`bill-row${compact ? ' bill-row--compact' : ''}${bill.paused ? ' bill-row--paused' : ''}`}>
      <button type="button" className="bill-row__main" onClick={onOpen} aria-label={label}>
        <span className="bill-row__icon" aria-hidden="true">
          {category?.icon ?? '🧾'}
        </span>
        <span className="bill-row__body">
          <span className="bill-row__name">{bill.name}</span>
          <span className="bill-row__meta">
            <span className={dueClass}>{bill.dueText}</span>
            <span>{FREQUENCY_LABEL[bill.frequency]}</span>
            {member && !compact && <span>{firstName(member.name)}</span>}
          </span>
        </span>
        <span className="bill-row__trailing">
          <Amount value={bill.amount} currency={currency} size="md" weight="semibold" tone={bill.paused ? 'muted' : 'neutral'} />
          <span className="bill-row__period">{FREQUENCY_SUFFIX[bill.frequency]}</span>
        </span>
      </button>
      {onPaid && (
        <Button size="sm" variant="secondary" className="bill-row__pay" onClick={onPaid} aria-label={`Mark ${bill.name} as paid`}>
          Paid
        </Button>
      )}
    </div>
  );
}
