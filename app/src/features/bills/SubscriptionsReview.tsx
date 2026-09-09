import { Card, ProgressBar, formatMoneyAuto } from '@budget-app/ui';
import type { Category } from '../../data/types';
import type { BillView } from './selectors';

interface SubscriptionsReviewProps {
  /** Every bill tagged as a subscription (paused ones included - they are counted, not listed). */
  subscriptions: BillView[];
  categoryOf: (bill: BillView) => Category | undefined;
  currency: string;
}

/**
 * The "is it worth it?" view at the top of the Subscriptions tab: every active
 * subscription ranked by what it costs, the yearly figure next to the monthly
 * one, and what they all add up to. The due-date list stays underneath so a
 * renewal can still be cancelled in time.
 */
export function SubscriptionsReview({ subscriptions, categoryOf, currency }: SubscriptionsReviewProps) {
  const active = subscriptions.filter((s) => !s.paused).sort((a, b) => b.monthly - a.monthly);
  if (active.length === 0) return null;
  const paused = subscriptions.length - active.length;
  const money = (value: number) => formatMoneyAuto(value, { currency });
  const monthly = active.reduce((sum, s) => sum + s.monthly, 0);
  const share = (s: BillView) => Math.round((s.monthly / monthly) * 100);

  return (
    <Card
      title="Worth it?"
      subtitle={`${active.length} active · ${money(monthly)} a month · ${money(monthly * 12)} a year${paused ? ` · ${paused} paused` : ''}`}
    >
      <ul className="subs-review" aria-label="Subscriptions ranked by cost">
        {active.map((s) => (
          <li key={s.id} className="subs-review__row">
            <span className="subs-review__icon" aria-hidden="true">
              {categoryOf(s)?.icon ?? '🧾'}
            </span>
            <span className="subs-review__body">
              <span className="subs-review__head">
                <span className="subs-review__name">{s.name}</span>
                <span className="subs-review__cost">
                  {money(s.monthly)}/mo · <strong>{money(s.monthly * 12)}/yr</strong>
                </span>
              </span>
              <ProgressBar value={s.monthly} max={monthly} size="sm" tone="primary" aria-label={`${s.name}: ${share(s)}% of what subscriptions cost`} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
