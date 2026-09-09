import { Amount, Badge, Button, formatMoneyAuto } from '@budget-app/ui';
import { firstName } from '../../data/split';
import type { Category, HouseholdMember } from '../../data/types';
import { FREQUENCY_LABEL, FREQUENCY_SUFFIX } from '../../lib/frequency';
import type { PaydayView } from './selectors';

interface PaydayRowProps {
  payday: PaydayView;
  category?: Category;
  member?: HouseholdMember;
  currency: string;
  onOpen: () => void;
  /** Quick "Received" action; shown only when provided (paydays due now). */
  onReceived?: () => void;
  compact?: boolean;
}

/**
 * One payday: icon, name, when it is expected, who it belongs to, and the
 * amount with its period. Same shape as a bill row (it reuses the bill-row
 * styles) so the two lists read alike.
 */
export function PaydayRow({ payday, category, member, currency, onOpen, onReceived, compact = false }: PaydayRowProps) {
  const dueClass = payday.bucket === 'expected' ? 'bill-row__due bill-row__due--overdue' : payday.bucket === 'today' ? 'bill-row__due bill-row__due--today' : payday.bucket === 'week' ? 'bill-row__due bill-row__due--week' : 'bill-row__due';
  // aria-label replaces the button's content for screen readers, so the amount, period and owner go in too (audit UX-12).
  const label = [payday.name, payday.dueText, `${formatMoneyAuto(payday.amount, { currency })} ${FREQUENCY_LABEL[payday.frequency].toLowerCase()}`, member ? firstName(member.name) : undefined, payday.variable ? 'amount varies' : undefined]
    .filter(Boolean)
    .join(', ');
  return (
    <div className={`bill-row${compact ? ' bill-row--compact' : ''}${payday.paused ? ' bill-row--paused' : ''}`}>
      <button type="button" className="bill-row__main" onClick={onOpen} aria-label={label}>
        <span className="bill-row__icon" aria-hidden="true">
          {category?.icon ?? '💼'}
        </span>
        <span className="bill-row__body">
          <span className="bill-row__name">{payday.name}</span>
          <span className="bill-row__meta">
            <span className={dueClass}>{payday.dueText}</span>
            <span>{FREQUENCY_LABEL[payday.frequency]}</span>
            {member && !compact && <span>{firstName(member.name)}</span>}
            {payday.variable && (
              <Badge tone="neutral" size="sm">
                varies
              </Badge>
            )}
          </span>
        </span>
        <span className="bill-row__trailing">
          <Amount value={payday.amount} currency={currency} size="md" weight="semibold" tone={payday.paused ? 'muted' : 'positive'} signDisplay="never" />
          <span className="bill-row__period">{FREQUENCY_SUFFIX[payday.frequency]}</span>
        </span>
      </button>
      {onReceived && (
        <Button size="sm" variant="secondary" className="bill-row__pay" onClick={onReceived} aria-label={`Mark ${payday.name} as received`}>
          Received
        </Button>
      )}
    </div>
  );
}
