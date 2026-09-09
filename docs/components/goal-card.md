---
category: Finance
keywords: [goal, savings, target, saved, deadline, contributors, progress, holiday fund, emergency fund]
---

# GoalCard

A savings goal: icon, name, deadline, saved-of-target with a percent, a progress bar, the amount still to go, a suggested pace and the household members contributing (stacked avatars). Completed goals turn green with a "Reached" badge. The Goals screen is a stack of these; the overview shows the nearest one.

## Usage

```jsx
import { GoalCard } from '@budget-app/ui';

const household = [
  { name: 'Priya Natarajan', color: 'violet' },
  { name: 'Sam Okafor', color: 'sky' },
  { name: 'Maya Okafor', color: 'coral' },
];

// Active goal
<GoalCard name="Holiday fund" icon="✈️" target={3000} saved={1840} deadline="by Dec 20" pace="$85/week to make it" contributors={household} onClick={openGoal} />

// Reached
<GoalCard name="Emergency savings" icon="🛟" target={2000} saved={2000} status="completed" contributors={household.slice(0, 2)} />

// Paused
<GoalCard name="New laptop" icon="💻" target={1400} saved={320} status="paused" deadline="no date" contributors={[household[1]]} />

// Compact, for a horizontal row of goals on the overview
<div className="bdg-grid-2">
  <GoalCard compact name="Holiday fund" icon="✈️" target={3000} saved={1840} />
  <GoalCard compact name="Bikes" icon="🚲" target={900} saved={120} />
</div>
```

## Guidance

- `deadline` and `pace` are already-written text ("by Dec 20", "$85/week to make it"); the component does not compute dates.
- Pass each member's assigned `color` in `contributors` so avatars match the rest of the app.
- Use `compact` only in grids/carousels; the full card is the default on the Goals screen.
