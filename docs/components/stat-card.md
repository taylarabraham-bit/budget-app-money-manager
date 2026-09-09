---
category: Finance
keywords: [stat, kpi, metric, headline number, today's earnings, spent, safe to spend, daily total, dashboard]
---

# StatCard

A headline number with its label and change. The overview screen opens with 2-4 of these in a grid: **today's earnings** (the daily earning total the app is built around), spent this week, safe to spend, saved this month.

## Usage

```jsx
import { StatCard } from '@budget-app/ui';

// Today's earnings with change vs yesterday
<StatCard label="Today's earnings" value={148.5} change={0.12} changeLabel="vs yesterday" icon="💵" />

// Spend: rising spend is bad, so direction="spend" colours +8% red
<StatCard label="Spent this week" value={612.4} change={0.08} changeLabel="vs last week" direction="spend" icon="🛒" />

// Brand-coloured hero tile
<StatCard label="Safe to spend" value={1834} tone="primary" caption="Until Aug 31 · 8 days" wholeOnly />

// Non-money stat
<StatCard label="Saving streak" valueText="14 days" caption="Best: 21 days" icon="🔥" />

// A 2-column grid on a phone screen
<div className="bdg-grid-2">
  <StatCard compact label="Earned today" value={148.5} change={0.12} />
  <StatCard compact label="Spent today" value={64.2} direction="spend" change={-0.3} />
</div>
```

## Guidance

- `change` is a fraction (0.12 = +12%). Omit it when there is no sensible comparison; do not show 0%.
- Use `direction="spend"` on any spending stat so the colours read correctly.
- One `tone="primary"` tile per screen at most - it is the hero.
- `compact` for grids of 3-4 on phones; default size for 2 across or desktop.
