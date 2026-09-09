import { Avatar, Badge, BudgetBar, Button, Dialog, EmptyState, ProgressBar, StatCard, TransactionItem, formatMoneyAuto, formatPercent } from '@budget-app/ui';
import type { MemberSummary } from '../data/selectors';
import { firstName as splitFirstName, isShared, shareOf } from '../data/split';
import { useHousehold } from '../data/store';

interface MemberDetailDialogProps {
  summary: MemberSummary | null;
  onClose: () => void;
  onEdit: () => void;
  onOpenActivity?: () => void;
}

/**
 * One member's personal budget for the month: spend against their limit,
 * what they earned, the categories they spent most in and their latest
 * purchases. Opened from "View budget" on the Household screen.
 */
export function MemberDetailDialog({ summary, onClose, onEdit, onOpenActivity }: MemberDetailDialogProps) {
  const { household, categories, members, currentMemberId } = useHousehold();
  if (!summary) return null;
  const { member } = summary;
  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const firstName = splitFirstName(member.name);
  // Cents-compared in the selector; never true for a no-cap member (limit 0, QA MF-3).
  const { hasLimit, over } = summary;
  const categoryOf = (id: string) => categories.find((c) => c.id === id);

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="bdg-row bdg-gap-2">
          <Avatar name={member.name} color={member.color} size="sm" status={member.id === currentMemberId ? 'active' : 'none'} />
          <span>{`${firstName}'s budget`}</span>
        </span>
      }
      description={`${member.role} · ${summary.monthLabel}`}
      footer={
        <>
          <Button variant="secondary" onClick={onEdit}>
            Edit member
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="bdg-stack">
        <ProgressBar
          value={hasLimit ? summary.spent : 0}
          max={Math.max(summary.limit, 1)}
          tone={over ? 'negative' : member.color}
          size="lg"
          label={hasLimit ? `${money(summary.spent)} of ${money(summary.limit)}` : `${money(summary.spent)} spent this month`}
          valueLabel={
            over ? (
              <Badge tone="negative" size="sm">{`${money(summary.spent - summary.limit)} over`}</Badge>
            ) : hasLimit ? (
              `${money(summary.left)} left · ${summary.daysLeft} days`
            ) : (
              `No cap · ${summary.daysLeft} days`
            )
          }
          aria-label={hasLimit ? `${formatPercent(Math.min(summary.ratio, 1))} of monthly budget used` : 'No monthly cap set'}
        />
        <div className="bdg-grid-2">
          <StatCard compact label="Spent" value={summary.spent} currency={currency} direction="spend" caption={`${summary.count} ${summary.count === 1 ? 'purchase' : 'purchases'}`} />
          <StatCard compact label="Earned" value={summary.earned} currency={currency} tone="auto" caption={summary.sharedSpent > 0 ? `${money(summary.sharedSpent)} spent on shared` : 'Nothing shared yet'} />
        </div>

        <div className="member-detail__section">
          <h3 className="bdg-section-title">Top categories</h3>
          {summary.topCategories.length === 0 ? (
            <EmptyState compact title="Nothing spent this month" description="Categories appear here as purchases are logged." />
          ) : (
            summary.topCategories.map((row) => (
              <BudgetBar key={row.category.id} category={row.category.name} spent={row.spent} limit={row.limit} currency={currency} icon={row.category.icon} color={row.category.color} show="spent" />
            ))
          )}
        </div>

        <div className="member-detail__section">
          <div className="bdg-row-between">
            <h3 className="bdg-section-title">Recent</h3>
            {onOpenActivity && (
              <Button variant="ghost" size="sm" onClick={onOpenActivity}>
                See all
              </Button>
            )}
          </div>
          {summary.recent.length === 0 ? (
            <EmptyState compact icon="🧾" title="No purchases yet" description={`${firstName} hasn't logged anything this month.`} />
          ) : (
            <div className="member-detail__rows">
              {summary.recent.map((t) => {
                const cat = categoryOf(t.categoryId);
                // A shared row shows the sticker price; the figure that counts against
                // THIS member is their share, the way Overview's scoped Recent says it (audit MF-15).
                const shared = isShared(t) && t.amount < 0;
                const shareNote = shared ? `${member.id === currentMemberId ? 'Your' : `${firstName}'s`} share ${money(shareOf(t, member.id, household, members))}` : undefined;
                return (
                  <TransactionItem
                    key={t.id}
                    title={t.title}
                    amount={t.amount}
                    currency={currency}
                    category={cat?.name}
                    when={new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    icon={cat?.icon}
                    note={shared ? [t.note, shareNote].filter(Boolean).join(' · ') : t.note}
                    recurring={t.recurring}
                    pending={t.pending}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
