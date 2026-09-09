---
category: Feedback
keywords: [progress, bar, percent, fill, remaining, loading, budget used, goal progress]
---

# ProgressBar

A horizontal fill. `BudgetBar` and `GoalCard` use it internally with the right labels and colours; reach for `ProgressBar` directly when you need a fill for something else - days left in the month, a saving streak, an upload - or a bar in a member's colour.

## Usage

```jsx
import { ProgressBar } from '@budget-app/ui';

// Days into the month
<ProgressBar label="August" valueLabel="23 of 31 days" value={23} max={31} />

// Per-member share of household spend (member colours)
<ProgressBar label="Priya" valueLabel="$1,240" value={1240} max={3000} tone="violet" size="sm" />
<ProgressBar label="Sam" valueLabel="$960" value={960} max={3000} tone="sky" size="sm" />

// Over the maximum: the bar fills red and the value turns red
<ProgressBar label="Dining out" valueLabel="$40 over" value={200} max={160} />

// Thick, positive
<ProgressBar value={72} tone="positive" size="lg" />

// Unknown progress
<ProgressBar label="Syncing" indeterminate />
```

## Guidance

- `value` is in the same unit as `max` (money, days, count) - not a percentage, unless `max` is 100.
- Bars are 100% wide; put them in a stack or a card, not inline with text.
- Use `valueLabel` for the figure people care about ("$120 left"), not the raw percent, unless the percent is the point.
