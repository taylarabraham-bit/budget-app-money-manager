---
category: Household
keywords: [avatar, member, initials, photo, person, household, user, profile]
---

# Avatar

A household member's initials (or photo) in their member colour. The colour is derived from the name when you do not pass one, so the same person is always the same colour everywhere: on transactions, goals, the header of their personal budget.

## Usage

```jsx
import { Avatar } from '@budget-app/ui';

// Initials, colour derived from the name
<Avatar name="Priya Natarajan" />

// Explicit member colour (keep it consistent with the member's MemberChip)
<Avatar name="Sam Okafor" color="sky" />

// Sizes: xs 24, sm 32, md 40 (default), lg 56, xl 80
<div className="bdg-row">
  <Avatar name="Priya Natarajan" size="xs" />
  <Avatar name="Priya Natarajan" size="sm" />
  <Avatar name="Priya Natarajan" size="md" />
  <Avatar name="Priya Natarajan" size="lg" />
  <Avatar name="Priya Natarajan" size="xl" />
</div>

// Photo (initials show until it loads)
<Avatar name="Maya Okafor" src="https://example.com/maya.jpg" size="lg" />

// Active member indicator
<Avatar name="Priya Natarajan" status="active" />

// Stacked contributors
<div className="bdg-row" style={{ gap: 0 }}>
  <Avatar name="Priya Natarajan" size="sm" />
  <Avatar name="Sam Okafor" size="sm" style={{ marginLeft: -8 }} />
  <Avatar name="Maya Okafor" size="sm" style={{ marginLeft: -8 }} />
</div>
```

## Guidance

- The six member colours are `coral`, `violet`, `sky`, `lime`, `rose`, `amber`. Assign one per member when the household is set up and pass it explicitly to both `Avatar` and `MemberChip`.
- `name` doubles as the accessible label - always the full display name.
- Use `xs` inside lists and chips, `md` in headers, `xl` on a member's profile screen.
