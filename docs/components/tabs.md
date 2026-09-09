---
category: Navigation
keywords: [tabs, segmented control, period switch, day week month, sections, overview, filter]
---

# Tabs

Switch between views of the same screen. Two looks:

- `underline` (default) for the sections of a screen: Overview / Transactions / Goals.
- `segmented` for short mutually exclusive choices that act like a setting: Day / Week / Month, Mine / Household.

## Usage

```jsx
import { Tabs } from '@budget-app/ui';

// Screen sections, with counts
const [tab, setTab] = useState('all');
<Tabs
  aria-label="Transactions"
  value={tab}
  onChange={setTab}
  items={[
    { value: 'all', label: 'All', count: 42 },
    { value: 'mine', label: 'Mine', count: 18 },
    { value: 'pending', label: 'Pending', count: 2 },
  ]}
/>

// Period switch, full width on a phone
<Tabs variant="segmented" fullWidth defaultValue="week" items={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />

// Small segmented control in a Card header
<Card title="Spending" actions={<Tabs variant="segmented" size="sm" defaultValue="month" items={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />}>
  ...
</Card>
```

## Guidance

- 2-5 items. More than that is a `Select`.
- Labels are one word where possible; counts are optional and only on underline tabs.
- On phones use `fullWidth` so tabs share the width evenly; on desktop let them size to content.
- `onChange` receives the item's `value` string - there is no event object.
