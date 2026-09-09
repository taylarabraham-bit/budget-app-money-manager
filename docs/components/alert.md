---
category: Feedback
keywords: [alert, message, notice, warning, error, success, banner, inline, over budget, goal reached]
---

# Alert

An inline message that belongs to the content around it and stays put (it is not a toast). Use it at the top of a screen or inside a card to explain a state the person needs to act on or celebrate.

| Tone | When |
|---|---|
| `info` | Neutral facts: "Bank sync is coming soon - purchases are logged manually for now." |
| `success` | Something good finished: "Holiday fund reached!" |
| `warning` | Approaching a limit: "Dining out is at 92% of its limit with 9 days left." |
| `danger` | Over a limit or failed: "Groceries is $38 over budget this month." |

## Usage

```jsx
import { Alert, Button } from '@budget-app/ui';

<Alert tone="warning" title="Dining out is almost at its limit">
  $148 of $160 used with 9 days to go.
</Alert>

<Alert tone="danger" title="Groceries is over budget" action={<Button variant="ghost" size="sm">Adjust limit</Button>}>
  You are $38 over this month's $450 limit.
</Alert>

<Alert tone="success" title="Goal reached" onDismiss={dismiss}>
  The holiday fund hit $3,000. Nice work, everyone.
</Alert>

<Alert tone="info">
  Purchases are logged manually for now. Automatic bank import is coming later.
</Alert>
```

## Guidance

- `title` is the headline; `children` is one or two sentences. Skip the title for short informational notes.
- One alert per screen at a time. Several problems become one alert with a summary and an action.
- `onDismiss` only for alerts the person can safely ignore (success, info). Warnings and dangers stay until resolved.
