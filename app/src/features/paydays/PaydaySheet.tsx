import { Amount, Badge, Button, Dialog, MemberChip } from '@budget-app/ui';
import { useHousehold } from '../../data/store';
import { KIND_ICON, accountById, useAccounts } from '../accounts';
import { formatLongDate } from '../../lib/dates';
import { FREQUENCY_LABEL, FREQUENCY_SUFFIX } from '../../lib/frequency';
import type { PaydayView } from './selectors';

interface PaydaySheetProps {
  payday: PaydayView | null;
  onClose: () => void;
  onEdit: () => void;
  onReceived: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}

const badgeTone = (p: PaydayView) => (p.paused ? 'neutral' : p.bucket === 'expected' ? 'negative' : p.bucket === 'today' ? 'positive' : p.bucket === 'week' ? 'info' : 'neutral');

/** Detail sheet for one payday: the amount, when it is expected, whose it is, and the actions. */
export function PaydaySheet({ payday, onClose, onEdit, onReceived, onTogglePause, onDelete }: PaydaySheetProps) {
  const { categories, members, household } = useHousehold();
  const { accounts } = useAccounts();
  if (!payday) return null;
  const category = categories.find((c) => c.id === payday.categoryId);
  const member = members.find((m) => m.id === payday.memberId);
  const account = accountById(accounts, payday.accountId);
  return (
    <Dialog
      open
      onClose={onClose}
      title={payday.name}
      description={`${FREQUENCY_LABEL[payday.frequency]}${payday.variable ? ' · amount varies' : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          {payday.paused ? <Button onClick={onTogglePause}>Resume</Button> : <Button onClick={onReceived}>Received</Button>}
        </>
      }
    >
      <div className="bdg-stack">
        <div className="bill-sheet__hero">
          <span className="bill-sheet__amount">
            <Amount value={payday.amount} currency={household.currency} size="xl" weight="bold" tone={payday.paused ? 'muted' : 'positive'} signDisplay="never" />
            <span className="bill-sheet__period">{FREQUENCY_SUFFIX[payday.frequency]}</span>
          </span>
          <Badge tone={badgeTone(payday)} dot>
            {payday.dueText}
          </Badge>
        </div>
        <dl className="bill-sheet__facts">
          <dt>Next expected</dt>
          <dd>{formatLongDate(payday.nextDate)}</dd>
          <dt>Repeats</dt>
          <dd>{FREQUENCY_LABEL[payday.frequency]}</dd>
          <dt>Whose</dt>
          <dd>{member ? <MemberChip name={member.name} color={member.color} size="sm" /> : '—'}</dd>
          <dt>Logged as</dt>
          <dd>{category ? `${category.icon} ${category.name}` : 'Income'}</dd>
          <dt>Last received</dt>
          <dd>{payday.lastReceived ? formatLongDate(payday.lastReceived) : 'Not yet'}</dd>
          {account && (
            <>
              <dt>Paid into</dt>
              <dd>{`${KIND_ICON[account.kind]} ${account.name}`}</dd>
            </>
          )}
          {payday.note && (
            <>
              <dt>Note</dt>
              <dd>{payday.note}</dd>
            </>
          )}
        </dl>
        <div className="bill-sheet__secondary">
          <Button size="sm" variant="ghost" onClick={onTogglePause}>
            {payday.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
