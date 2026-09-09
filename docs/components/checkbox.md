---
category: Forms
keywords: [checkbox, tick, check, multi-select, confirm, split, recurring, form]
---

# Checkbox

A labelled tick box. Use it for things that are part of a form and submitted together: picking several categories to include in a report, "Split this purchase with the household", "This repeats every month". For a setting that takes effect immediately, use `Switch`.

## Usage

```jsx
import { Checkbox } from '@budget-app/ui';

// Simple
<Checkbox label="Split with household" />

// With a description
<Checkbox label="Recurring purchase" description="We'll add it automatically every month on this date." defaultChecked />

// A group of options in a stack
<div className="bdg-stack bdg-gap-3">
  <Checkbox label="Groceries" defaultChecked />
  <Checkbox label="Dining out" defaultChecked />
  <Checkbox label="Transport" />
  <Checkbox label="Subscriptions" disabled description="No transactions this month" />
</div>

// Error
<Checkbox label="I confirm this is a shared expense" error="Please confirm before saving" />

// Controlled
const [split, setSplit] = useState(false);
<Checkbox label="Split with household" checked={split} onChange={(e) => setSplit(e.target.checked)} />
```

## Guidance

- Label text is a statement ("Split with household"), not a question.
- Stack checkboxes vertically with `.bdg-stack.bdg-gap-3`; never place them in a row on phone screens.
