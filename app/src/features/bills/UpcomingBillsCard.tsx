import { Button, Card, EmptyState, formatMoneyAuto } from '@budget-app/ui';
import { useHousehold } from '../../data/store';
import { BillRow } from './BillRow';
import { selectBillsSummary } from './selectors';
import { useBills } from './store';
import './bills.css';

interface UpcomingBillsCardProps {
  /** Navigate to the Bills tab (the "See all" action and row taps). */
  onSeeAll: () => void;
  /** How many rows to show. Default 3. */
  limit?: number;
}

/**
 * Home-screen card: the next few bills that need paying (overdue first),
 * with the week's total in the subtitle. Drop it on Overview and pass a
 * handler that switches to the Bills tab.
 */
export function UpcomingBillsCard({ onSeeAll, limit = 3 }: UpcomingBillsCardProps) {
  const { categories, members, household } = useHousehold();
  const { bills } = useBills();
  const summary = selectBillsSummary(bills);
  const rows = summary.attention.slice(0, limit);
  const more = summary.attention.length - rows.length;
  return (
    <Card
      title="Upcoming bills"
      subtitle={summary.attention.length === 0 ? 'Nothing due this week' : `${formatMoneyAuto(summary.attentionTotal, { currency: household.currency })} to pay this week`}
      padding="none"
      actions={
        <Button size="sm" variant="ghost" onClick={onSeeAll}>
          See all
        </Button>
      }
      footer={more > 0 ? <span className="bdg-text-sm bdg-text-muted">{`${more} more this week`}</span> : undefined}
    >
      {rows.length === 0 ? (
        <EmptyState compact icon="🧾" title="All paid up" description="No bills or subscriptions are due in the next 7 days." />
      ) : (
        rows.map((bill) => (
          <BillRow
            key={bill.id}
            bill={bill}
            category={categories.find((c) => c.id === bill.categoryId)}
            member={members.find((m) => m.id === bill.memberId)}
            currency={household.currency}
            onOpen={onSeeAll}
            compact
          />
        ))
      )}
    </Card>
  );
}
