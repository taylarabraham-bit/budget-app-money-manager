---
category: Finance
keywords: [transaction list, purchase log, history, grouped by day, daily total, today, yesterday, activity]
---

# TransactionList

The purchase log. Give it an array of transactions and it sorts them newest first, groups them under day headers ("Today", "Yesterday", "Mon 12 May") with a net total per day, renders each as a `TransactionItem`, and shows a built-in empty state when the array is empty.

## Usage

```jsx
import { TransactionList } from '@budget-app/ui';

const priya = { name: 'Priya Natarajan', color: 'violet' };
const sam = { name: 'Sam Okafor', color: 'sky' };

const transactions = [
  { id: 't1', title: "Trader Joe's", amount: -64.2, date: '2026-08-23T17:12:00', category: 'Groceries', member: priya },
  { id: 't2', title: 'Bus pass', amount: -2.75, date: '2026-08-23T08:05:00', category: 'Transport', member: sam },
  { id: 't3', title: 'Salary', amount: 2400, date: '2026-08-22T09:00:00', category: 'Income', member: priya },
  { id: 't4', title: 'Electricity', amount: -92.1, date: '2026-08-20T12:00:00', category: 'Home & utilities', icon: '💡', recurring: true },
];

// Default: grouped by day, newest first
<TransactionList transactions={transactions} onSelect={(id) => openTransaction(id)} />

// Show times next to the category
<TransactionList transactions={transactions} showTime />

// Flat list (no day headers)
<TransactionList transactions={transactions} groupByDay={false} />

// Empty
<TransactionList transactions={[]} />
```

## Guidance

- `date` is ISO (`2026-08-23` or `2026-08-23T17:12:00`); the list does the grouping and the Today/Yesterday labels (pass `today` to pin "now" in previews and tests).
- Each transaction needs a stable `id`; it is the React key and what `onSelect` reports.
- Put the list directly on the screen background (`.bdg-screen`), not inside another Card - each day group is already a card.
- Filters (member, category, period) go above it as `MemberChip`s or `Tabs`; the list itself only renders what it is given.
