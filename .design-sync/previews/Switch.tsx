import { Card, Switch } from '@budget-app/ui';

export const SettingsCard = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 380 }}>
    <Card title="Notifications">
      <div className="bdg-stack bdg-gap-4">
        <Switch label="Daily summary" description="Every evening at 8 PM" defaultChecked />
        <Switch label="Over-budget alerts" description="When a category passes its limit" defaultChecked />
        <Switch label="Goal milestones" />
      </div>
    </Card>
  </div>
);

export const OnAndOff = () => (
  <div className="bdg-app bdg-stack bdg-gap-4" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Switch label="Visible to household" defaultChecked />
    <Switch label="Round up purchases" />
  </div>
);

export const SmallLabelStart = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Switch label="Compact rows" size="sm" labelPosition="start" defaultChecked />
    <Switch label="Show cents" size="sm" labelPosition="start" />
  </div>
);

export const Disabled = () => (
  <div className="bdg-app bdg-stack bdg-gap-4" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Switch label="Bank sync" description="Coming soon" disabled />
    <Switch label="Locked on" description="Required by the household owner" disabled defaultChecked />
  </div>
);
