---
category: Feedback
keywords: [badge, status, label, tag, chip, pill, on track, over budget, pending, recurring]
---

# Badge

A small status label. The `tone` carries the meaning; the text is one or two words. The app's standard badges:

| Situation | Badge |
|---|---|
| Category or goal is fine | `tone="positive"` "On track" |
| Spend is near the limit | `tone="warning"` "Almost there" |
| Over the limit | `tone="negative"` "Over budget" |
| Goal reached | `tone="positive" dot` "Reached" |
| Recurring transaction | `tone="info"` "Recurring" |
| Transaction not settled | `tone="neutral"` "Pending" |

## Usage

```jsx
import { Badge } from '@budget-app/ui';

<Badge tone="positive">On track</Badge>
<Badge tone="warning">Almost there</Badge>
<Badge tone="negative">Over budget</Badge>
<Badge tone="info">Recurring</Badge>
<Badge tone="neutral">Pending</Badge>

// Variants
<Badge tone="positive" variant="solid">Reached</Badge>
<Badge tone="negative" variant="outline">Overdue</Badge>

// With a status dot, small size for dense rows
<Badge tone="positive" dot size="sm">Paid</Badge>
```

## Guidance

- Default `variant="soft"` for almost everything; `solid` only for a single highlighted status (a completed goal); `outline` inside already-tinted surfaces.
- Badges are not buttons. For selectable pills use `MemberChip` or `Tabs variant="segmented"`.
- Place a Badge in a Card's `actions` slot or after a title, never on its own line.
