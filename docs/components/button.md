---
category: Actions
keywords: [button, action, submit, cta, primary, secondary, ghost, danger, loading]
---

# Button

The action control. Each screen has **one** `primary` button for its main action ("Log purchase", "Save goal", "Add member"); everything else is `secondary` or `ghost`. `danger` is only for destructive actions and is usually paired with a confirmation Dialog.

## Usage

```jsx
import { Button } from '@budget-app/ui';

// Main action on a mobile screen: large and full width
<Button size="lg" fullWidth>Log purchase</Button>

// Supporting actions side by side
<div className="bdg-row">
  <Button variant="secondary">Cancel</Button>
  <Button>Save</Button>
</div>

// Low-emphasis inline action, e.g. in a Card header
<Button variant="ghost" size="sm">See all</Button>

// Destructive
<Button variant="danger">Delete transaction</Button>

// Saving state - shows a spinner and disables the button
<Button loading>Saving…</Button>

// With an icon (any 16-20px SVG or an emoji)
<Button iconStart={<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 4v12M4 10h12" /></svg>}>
  Add goal
</Button>
```

## Guidance

- Sizes: `sm` (32px) inside cards and table rows, `md` (40px) default, `lg` (48px) for the main action on phone screens.
- Labels are verbs: "Log purchase", not "Purchase". Keep them to 1-3 words.
- Use `fullWidth` for the primary action at the bottom of a phone screen or in a Dialog footer on mobile; never for desktop toolbars.
- Do not stack two `primary` buttons. Demote one to `secondary`.
- For icon-only buttons provide an `aria-label`.
