---
category: Layout
keywords: [page header, title bar, screen title, back button, app bar, toolbar, navigation]
---

# PageHeader

The title bar at the top of every screen. Top-level screens (Overview, Transactions, Goals, Household) use `size="lg"` with no back arrow; detail screens (a category, a goal, a member's budget) use the default size with `onBack`.

## Usage

```jsx
import { PageHeader, Button, Avatar, MemberChip } from '@budget-app/ui';

// Top-level screen
<PageHeader size="lg" title="Overview" subtitle="Saturday, 23 August" actions={<Avatar name="Priya Natarajan" size="sm" status="active" />} />

// Detail screen with back navigation and an action
<PageHeader eyebrow="Category" title="Groceries" subtitle="$312 of $450 this month" onBack={goBack} actions={<Button variant="ghost" size="sm">Edit</Button>} />

// A member's personal budget
<PageHeader leading={<Avatar name="Sam Okafor" size="md" />} title="Sam's budget" subtitle="August · $1,200 limit" onBack={goBack} />

// Household screen with a member switcher in the actions slot
<PageHeader size="lg" title="Household" subtitle="4 members" actions={<Button size="sm">Invite</Button>} />
```

## Guidance

- The `subtitle` is the best place for the period or the key figure of the screen; keep it to one line.
- Put at most two items in `actions` (a Button and an Avatar, or two icon buttons).
- Inside `.bdg-screen` the header needs no extra margin; it carries its own bottom spacing.
- Follow it with `Tabs` when the screen has sections.
