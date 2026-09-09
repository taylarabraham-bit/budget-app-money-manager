---
category: Layout
keywords: [card, surface, panel, container, section, group, header, footer]
---

# Card

The surface that groups related content on a screen. Header (`title`, `subtitle`, `actions`), body (`children`) and `footer` are all optional, so a Card can be a bare white box or a titled section with a "See all" action.

## Usage

```jsx
import { Card, Button, BudgetBar, Badge } from '@budget-app/ui';

// Titled section with an action
<Card title="Budgets" subtitle="August" actions={<Button variant="ghost" size="sm">See all</Button>}>
  <BudgetBar category="Groceries" spent={312} limit={450} icon="🛒" />
  <BudgetBar category="Dining out" spent={180} limit={160} icon="🍜" color="coral" />
</Card>

// Edge-to-edge list: padding="none" lets rows touch the card edges
<Card title="Recent" padding="none">
  <TransactionItem title="Trader Joe's" amount={-64.2} category="Groceries" when="5:12 PM" icon="🛒" />
  <TransactionItem title="Salary" amount={2400} category="Income" when="9:00 AM" icon="💼" />
</Card>

// Tappable summary card with a footer
<Card interactive onClick={openGoal} elevated footer="3 members contributing">
  <GoalCard compact name="Holiday fund" target={3000} saved={1840} icon="✈️" />
</Card>

// Plain container
<Card padding="lg">
  <p className="bdg-text-muted">Nothing here yet.</p>
</Card>
```

## Guidance

- One idea per card. If a card needs two headers, it is two cards.
- Cards sit on the app background (`.bdg-app` / `.bdg-screen`); do not nest cards inside cards - use a plain stack of rows inside one card instead.
- Use `elevated` sparingly (one highlight per screen); the default bordered card is the norm.
- `interactive` + `onClick` makes the whole card a tap target; do not also put buttons inside it.
