import { TransactionList } from '@budget-app/ui';
import type { Transaction } from '@budget-app/ui';

const priya = { name: 'Priya Natarajan', color: 'violet' as const };
const sam = { name: 'Sam Okafor', color: 'sky' as const };
const maya = { name: 'Maya Okafor', color: 'coral' as const };

// Pinned "now" so Today / Yesterday labels are stable in previews.
const today = new Date('2026-08-23T18:00:00');

const transactions: Transaction[] = [
  { id: 't1', title: "Trader Joe's", amount: -64.2, date: '2026-08-23T17:12:00', category: 'Groceries', member: priya },
  { id: 't2', title: 'Bus pass', amount: -2.75, date: '2026-08-23T08:05:00', category: 'Transport', member: sam },
  { id: 't3', title: 'Ice cream', amount: -6.5, date: '2026-08-22T16:40:00', category: 'Fun', member: maya },
  { id: 't4', title: 'Salary', amount: 2400, date: '2026-08-22T09:00:00', category: 'Income', member: priya },
  { id: 't5', title: 'Electricity', amount: -92.1, date: '2026-08-20T12:00:00', category: 'Home & utilities', icon: '💡', recurring: true },
  { id: 't6', title: 'Spotify family', amount: -16.99, date: '2026-08-18T07:00:00', category: 'Subscriptions', icon: '🎵', recurring: true },
];

export const GroupedByDay = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <TransactionList transactions={transactions} today={today} onSelect={() => undefined} />
  </div>
);

export const WithTimes = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <TransactionList transactions={transactions.slice(0, 4)} today={today} showTime />
  </div>
);

export const Flat = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <TransactionList transactions={transactions.slice(0, 3)} today={today} groupByDay={false} />
  </div>
);

export const Empty = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 440 }}>
    <TransactionList transactions={[]} />
  </div>
);
