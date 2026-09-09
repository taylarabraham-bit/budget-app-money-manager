---
category: Finance
keywords: [budget, category, limit, spent, remaining, over budget, progress, groceries, allowance]
---

# BudgetBar

One budget category's spend against its limit: icon, name, the figure that matters ("$138 left" / "$40 over"), a progress bar that turns amber near the limit (default 85%) and red over it, and the spent/limit line underneath. Stack several inside a Card for the budget overview; pass `onClick` to open the category.

## Usage

```jsx
import { Card, BudgetBar } from '@budget-app/ui';

<Card title="Budgets" subtitle="August" padding="md">
  <BudgetBar category="Groceries" spent={312} limit={450} icon="🛒" />
  <BudgetBar category="Transport" spent={96} limit={120} icon="🚌" color="sky" />
  <BudgetBar category="Dining out" spent={148} limit={160} icon="🍜" color="coral" />
  <BudgetBar category="Fun" spent={205} limit={150} icon="🎮" color="violet" />
</Card>

// Tappable, showing spent instead of left, with a period hint
<BudgetBar category="Home & utilities" spent={640} limit={800} icon="🏠" color="lime" period="Aug 1-31" show="spent" onClick={openCategory} />

// A personal allowance (member colour)
<BudgetBar category="Maya's allowance" spent={35} limit={60} icon="🧒" color="amber" />
```

## Guidance

- `spent` and `limit` are positive numbers in the same currency. The component does the maths.
- `limit={0}` means the category has no monthly limit: the row shows "$X spent · No monthly limit" with an empty bar and never turns amber or red.
- Give each category a stable `color` and `icon` and reuse them on its detail screen and in `TransactionItem` rows.
- Default figure is money `left` because that is what people decide with; use `show="spent"` on reports.
- Rows have their own vertical padding; stack them directly with no gap.
