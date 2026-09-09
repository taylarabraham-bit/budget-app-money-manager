---
category: Forms
keywords: [switch, toggle, on off, setting, preference, reminder, shared, notification]
---

# Switch

An on/off toggle for settings that apply immediately: "Daily reminder", "Share my budget with the household", "Round up purchases to goals". Use `Checkbox` inside forms that are submitted with a button.

## Usage

```jsx
import { Switch } from '@budget-app/ui';

// Settings rows in a Card
<Card title="Notifications" padding="md">
  <div className="bdg-stack bdg-gap-4">
    <Switch label="Daily summary" description="Every evening at 8 PM" defaultChecked />
    <Switch label="Over-budget alerts" description="When a category passes its limit" defaultChecked />
    <Switch label="Goal milestones" />
  </div>
</Card>

// Controlled
const [shared, setShared] = useState(true);
<Switch label="Visible to household" checked={shared} onCheckedChange={setShared} />

// Toggle on the left, small
<Switch label="Compact rows" size="sm" labelPosition="start" />

// Disabled
<Switch label="Bank sync" description="Coming soon" disabled />
```

## Guidance

- The label describes the thing being turned on, never "Enable"/"Disable".
- Put the toggle on the right (default) in settings lists so labels align.
- `onCheckedChange` receives the new boolean - there is no event object.
