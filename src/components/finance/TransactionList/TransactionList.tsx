import { useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { formatDayLabel, formatMoney, moneyDisplayValue } from '../../../lib/format';
import type { Member } from '../../../lib/types';
import { EmptyState } from '../../feedback/EmptyState/EmptyState';
import { TransactionItem } from '../TransactionItem/TransactionItem';

export interface Transaction {
  /** Stable id, used as the React key and passed to `onSelect`. */
  id: string;
  /** Merchant or description. */
  title: string;
  /** Signed amount: negative for purchases, positive for income. */
  amount: number;
  /** ISO date or datetime ("2026-08-23" or "2026-08-23T14:40:00"). Rows are grouped by day. */
  date: string;
  /** Category label. */
  category?: string;
  /** Household member who made it. */
  member?: Member;
  /** Emoji or icon for the category (used when there is no member). */
  icon?: ReactNode;
  /** Free-text note. */
  note?: string;
  /** Unsettled state. */
  pending?: boolean;
  /** Recurring payment marker. */
  recurring?: boolean;
}

export interface TransactionListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> {
  /** Transactions, any order - the list sorts newest first. */
  transactions: Transaction[];
  /** ISO currency code. Default "USD". */
  currency?: string;
  /** Group rows under day headers ("Today", "Yesterday", "Mon 12 May") with a daily net total. Default true. */
  groupByDay?: boolean;
  /** Show the time next to the category on each row (requires datetime dates). */
  showTime?: boolean;
  /** Reference "now" for the Today/Yesterday labels (defaults to the current date). */
  today?: Date;
  /** Called with the transaction id when a row is tapped. */
  onSelect?: (id: string) => void;
  /** Content for the empty case. Defaults to a standard "No purchases yet" EmptyState. */
  empty?: ReactNode;
}

interface DayGroup {
  key: string;
  label: string;
  total: number;
  items: Transaction[];
}

function timeOf(iso: string): string | null {
  if (!/T\d{2}:\d{2}/.test(iso)) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function groupTransactions(transactions: Transaction[], groupByDay: boolean, today: Date | undefined): DayGroup[] {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const groups: DayGroup[] = [];
  for (const t of sorted) {
    const key = groupByDay ? t.date.slice(0, 10) : 'all';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: groupByDay ? formatDayLabel(key, today) : '', total: 0, items: [] };
      groups.push(g);
    }
    g.total += t.amount;
    g.items.push(t);
  }
  return groups;
}

/**
 * TransactionList - the purchase log: TransactionItem rows grouped by day
 * with a net total per day, newest first, and a built-in empty state.
 * @category Finance
 */
export function TransactionList({
  transactions,
  currency = 'USD',
  groupByDay = true,
  showTime = false,
  today,
  onSelect,
  empty,
  className,
  ...rest
}: TransactionListProps) {
  // Sorting and grouping run once per change of input rather than once per
  // render: Activity re-renders the whole list on every search keystroke (audit UI-11).
  const todayKey = today?.getTime();
  const groups = useMemo(
    () => groupTransactions(transactions, groupByDay, todayKey === undefined ? undefined : new Date(todayKey)),
    [transactions, groupByDay, todayKey],
  );
  if (!transactions.length) {
    return (
      <div className={cx('bdg-txn-list', 'bdg-txn-list--empty', className)} {...rest}>
        {empty ?? <EmptyState compact icon="🧾" title="No purchases yet" description="Log a purchase and it will show up here." />}
      </div>
    );
  }
  return (
    <div className={cx('bdg-txn-list', className)} {...rest}>
      {groups.map((g) => (
        <section key={g.key} className="bdg-txn-list__group">
          {groupByDay && (
            <header className="bdg-txn-list__day">
              <span className="bdg-txn-list__day-label">{g.label}</span>
              {/* Coloured only when the printed total is above zero: dust prints "$0.00" (audit DS-6). */}
              <span className={cx('bdg-txn-list__day-total', moneyDisplayValue(g.total, { currency }) > 0 && 'bdg-txn-list__day-total--positive')}>
                {formatMoney(g.total, { currency, signDisplay: 'exceptZero' })}
              </span>
            </header>
          )}
          <div className="bdg-txn-list__rows">
            {g.items.map((t) => (
              <TransactionItem
                key={t.id}
                title={t.title}
                amount={t.amount}
                currency={currency}
                category={t.category}
                when={showTime ? timeOf(t.date) : undefined}
                member={t.member}
                icon={t.icon}
                note={t.note}
                pending={t.pending}
                recurring={t.recurring}
                onClick={onSelect ? () => onSelect(t.id) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
