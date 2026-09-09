import { Amount, Badge, Button, Dialog, MemberChip } from '@budget-app/ui';
import { useHousehold } from '../../data/store';
import { KIND_ICON, accountById, useAccounts } from '../accounts';
import { formatDueDateLong } from './dates';
import type { BillView } from './selectors';
import { FREQUENCY_LABEL, FREQUENCY_SUFFIX, KIND_LABEL } from './types';

interface BillSheetProps {
  bill: BillView | null;
  onClose: () => void;
  onEdit: () => void;
  onPaid: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}

const badgeTone = (bill: BillView) =>
  bill.paused ? 'neutral' : bill.bucket === 'overdue' ? 'negative' : bill.bucket === 'today' ? 'warning' : bill.bucket === 'week' ? 'info' : 'neutral';

/**
 * Detail sheet for one bill: the cost, when it is due, who pays it, and the
 * actions - mark as paid, edit, pause, delete. A bottom sheet on phones.
 */
export function BillSheet({ bill, onClose, onEdit, onPaid, onTogglePause, onDelete }: BillSheetProps) {
  const { categories, members, household } = useHousehold();
  const { accounts } = useAccounts();
  if (!bill) return null;
  const category = categories.find((c) => c.id === bill.categoryId);
  const member = members.find((m) => m.id === bill.memberId);
  const account = accountById(accounts, bill.accountId);
  return (
    <Dialog
      open
      onClose={onClose}
      title={bill.name}
      description={`${KIND_LABEL[bill.kind]} · ${FREQUENCY_LABEL[bill.frequency]}`}
      footer={
        <>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          {bill.paused ? (
            <Button onClick={onTogglePause}>Resume</Button>
          ) : (
            <Button onClick={onPaid}>Mark as paid</Button>
          )}
        </>
      }
    >
      <div className="bdg-stack">
        <div className="bill-sheet__hero">
          <span className="bill-sheet__amount">
            <Amount value={bill.amount} currency={household.currency} size="xl" weight="bold" tone={bill.paused ? 'muted' : 'neutral'} />
            <span className="bill-sheet__period">{FREQUENCY_SUFFIX[bill.frequency]}</span>
          </span>
          <Badge tone={badgeTone(bill)} dot>
            {bill.dueText}
          </Badge>
        </div>
        <dl className="bill-sheet__facts">
          <dt>Next due</dt>
          <dd>{formatDueDateLong(bill.nextDue)}</dd>
          <dt>Repeats</dt>
          <dd>{FREQUENCY_LABEL[bill.frequency]}</dd>
          <dt>Category</dt>
          <dd>{category ? `${category.icon} ${category.name}` : 'Uncategorised'}</dd>
          <dt>Paid by</dt>
          <dd>{member ? <MemberChip name={member.name} color={member.color} size="sm" meta={bill.shared ? 'Split with household' : undefined} /> : '—'}</dd>
          <dt>Last paid</dt>
          <dd>{bill.lastPaid ? formatDueDateLong(bill.lastPaid) : 'Not yet'}</dd>
          {account && (
            <>
              <dt>Paid from</dt>
              <dd>{`${KIND_ICON[account.kind]} ${account.name}`}</dd>
            </>
          )}
          {bill.note && (
            <>
              <dt>Note</dt>
              <dd>{bill.note}</dd>
            </>
          )}
        </dl>
        <div className="bill-sheet__secondary">
          <Button size="sm" variant="ghost" onClick={onTogglePause}>
            {bill.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
