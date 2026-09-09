---
category: Finance
keywords: [transaction, purchase, row, list item, expense, income, merchant, log, history]
---

# TransactionItem

One row of the purchase log: who (member avatar) or what (category icon), the merchant, category and time, and the amount - income in green with a "+", spend in the text colour. Rows are edge-to-edge and stack inside a `Card padding="none"` or a `TransactionList`.

## Usage

```jsx
import { Card, TransactionItem } from '@budget-app/ui';

const priya = { name: 'Priya Natarajan', color: 'violet' };
const sam = { name: 'Sam Okafor', color: 'sky' };

<Card title="Today" padding="none">
  <TransactionItem title="Trader Joe's" amount={-64.2} category="Groceries" when="5:12 PM" member={priya} onClick={open} />
  <TransactionItem title="Bus pass" amount={-2.75} category="Transport" when="8:05 AM" member={sam} />
  <TransactionItem title="Salary" amount={2400} category="Income" when="9:00 AM" member={priya} />
</Card>

// Category icon instead of a member (household-level view)
<TransactionItem title="Electricity" amount={-92.1} category="Home & utilities" when="Aug 20" icon="💡" recurring />

// Pending and with a note
<TransactionItem title="Birthday gift" amount={-45} category="Gifts" when="Yesterday" member={sam} note="For Maya's friend" pending />
```

## Guidance

- `amount` is signed: negative for purchases, positive for income. Do not pre-format it.
- Prefer `member` in household views (who spent it) and `icon` in a single member's own view (what it was).
- `when` is display text ("5:12 PM", "Aug 20", "Yesterday"); the row does not parse dates.
- For a whole log use `TransactionList`, which groups rows by day with totals.
