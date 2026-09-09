---
category: Feedback
keywords: [empty state, placeholder, no data, nothing yet, first run, onboarding, zero]
---

# EmptyState

The friendly placeholder for a list or screen with nothing in it yet, plus a clear next step. Every list in the app (transactions, goals, members, categories) has one. Centred, with an optional icon in a tinted circle and a primary action.

## Usage

```jsx
import { EmptyState, Button } from '@budget-app/ui';

// Full screen
<EmptyState
  icon="🧾"
  title="No purchases yet"
  description="Log your first purchase and today's total will show up here."
  action={<Button>Log purchase</Button>}
/>

// Goals
<EmptyState icon="🎯" title="No goals yet" description="Set a target and the household can save towards it together." action={<Button>Add a goal</Button>} />

// Inside a card, compact
<Card title="Recent" padding="none">
  <EmptyState compact icon="🛒" title="Nothing logged today" description="Tap + to add a purchase." />
</Card>

// Search with no results - no action needed
<EmptyState compact title="No matches" description="Try a different merchant or category." />
```

## Guidance

- `title` says what is empty in 2-4 words; `description` says what to do about it in one sentence.
- Use the same emoji/icon the feature uses elsewhere (🧾 transactions, 🎯 goals, 👥 household).
- The action is the same primary action the screen's main button performs.
