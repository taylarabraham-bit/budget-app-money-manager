---
category: Finance
keywords: [amount, money, currency, price, total, balance, income, expense, format, dollars]
---

# Amount

The one way money is rendered anywhere in the app: locale currency formatting, tabular digits (so columns line up), slightly smaller cents at large sizes, and an automatic green/red tone for income/expense. Never format money by hand.

## Usage

```jsx
import { Amount } from '@budget-app/ui';

// Auto tone: positive is green, negative is red, zero is neutral
<Amount value={2400} />         // $2,400.00 in green
<Amount value={-64.2} />        // -$64.20 in red

// Totals and balances: neutral keeps the text colour
<Amount value={1834.5} tone="neutral" size="xl" />

// Hero number on the overview
<Amount value={148.5} tone="neutral" size="display" weight="bold" />

// Show "+" on income in a list
<Amount value={2400} signDisplay="exceptZero" />

// Round totals without cents; compact for big numbers
<Amount value={12400} wholeOnly tone="neutral" />
<Amount value={12400} compact tone="neutral" />

// Muted secondary figures and struck refunds
<Amount value={450} tone="muted" size="sm" />
<Amount value={-29.99} struck size="sm" />
```

## Guidance

- Sizes: `sm` 14px for secondary figures, `md` 16px in rows (default), `lg` 22px card headlines, `xl` 28px stat values, `display` 36px for the one hero number on a screen.
- Use `tone="neutral"` for totals, limits and balances; leave `auto` for individual transactions and deltas where the sign is the point.
- Expenses are negative numbers in data. Do not flip the sign for display - the component handles it.
- For input use `AmountInput`; for the formatted string in text use `formatMoney(value)`.
