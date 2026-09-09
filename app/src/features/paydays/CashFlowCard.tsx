import { Button, Card, EmptyState, formatMoneyAuto } from '@budget-app/ui';
import { useHousehold } from '../../data/store';
import { formatShortDate } from '../../lib/dates';
import { dueLabel } from '../bills/dates';
import { horizonText, type CashFlow } from './selectors';
import './paydays.css';

interface CashFlowCardProps {
  cashFlow: CashFlow;
  onOpenBills: () => void;
  onOpenPaydays: () => void;
  /** How many bill rows to show. Default 4. */
  limit?: number;
}

/**
 * "Before payday": the bills due and the savings still needed before the next
 * pay arrives, and the equation that turns what is left of the budget into
 * what is safe to spend. Replaces the upcoming-bills card once paydays exist.
 */
export function CashFlowCard({ cashFlow, onOpenBills, onOpenPaydays, limit = 4 }: CashFlowCardProps) {
  const { members, household } = useHousehold();
  const currency = household.currency;
  const money = (v: number) => formatMoneyAuto(v, { currency });
  const billRows = cashFlow.billsDueItems.slice(0, limit);
  const moreBills = cashFlow.billsDueItems.length - billRows.length;
  const toPay = cashFlow.billsDue + cashFlow.plannedSavings;

  return (
    <Card
      title="Before payday"
      subtitle={`${horizonText(cashFlow.untilLabel, cashFlow.daysUntil, cashFlow.nextPayday?.overdueDays ?? 0)} · ${toPay > 0 ? `${money(toPay)} to pay` : 'nothing left to pay'}`}
      padding="none"
      actions={
        <div className="bdg-row bdg-gap-2">
          <Button size="sm" variant="ghost" onClick={onOpenPaydays}>
            Paydays
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenBills}>
            Bills
          </Button>
        </div>
      }
      footer={
        <span className="cashflow__equation">
          <span>{money(cashFlow.limitLeft)} left</span>
          <span>− {money(cashFlow.billsDue)} bills</span>
          {cashFlow.plannedSavings > 0 && <span>− {money(cashFlow.plannedSavings)} savings</span>}
          {/* safeToSpend is cent-quantized by the selector, so this sign is the same one the reminder sees (audit MON-5). */}
          <span className={cashFlow.safeToSpend < 0 ? 'bdg-text-negative bdg-font-semibold' : 'bdg-font-semibold'}>= {money(cashFlow.safeToSpend)}</span>
          {moreBills > 0 && <span className="bdg-text-subtle">{moreBills} more</span>}
          {cashFlow.capped && <span className="bdg-text-subtle">60+ payments behind - the totals stop there</span>}
        </span>
      }
    >
      {billRows.length === 0 && cashFlow.savingsItems.length === 0 ? (
        <EmptyState compact icon="✅" title="Nothing left to pay before payday" description="No bills are due and your goals are on pace." />
      ) : (
        <>
          {billRows.map((item) => {
            // Rendered from the cash-flow item itself: the amount is the same share the
            // footer's equation subtracts (QA MF-4), and repeat occurrences of one bill
            // inside the window each get their own row (QA MF-1).
            const payer = members.find((m) => m.id === item.memberId);
            return (
              <div key={item.id} className="cashflow-row">
                <span className="bill-row__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="cashflow-row__body">
                  <span className="bill-row__name">{item.name}</span>
                  <span className="bill-row__meta">
                    <span>{dueLabel(item.days, item.date)}</span>
                    {payer && <span>{item.shared ? 'shared' : payer.name}</span>}
                  </span>
                </span>
                <span className="cashflow-row__amount bdg-tabular">{money(item.amount)}</span>
              </div>
            );
          })}
          {cashFlow.savingsItems.map((item) => (
            <div key={item.id} className="cashflow-row">
              <span className="bill-row__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="cashflow-row__body">
                <span className="bill-row__name">{item.name}</span>
                <span className="bill-row__meta">
                  <span>to stay on pace</span>
                  <span>by {formatShortDate(item.date)}</span>
                </span>
              </span>
              <span className="cashflow-row__amount bdg-tabular">{money(item.amount)}</span>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
