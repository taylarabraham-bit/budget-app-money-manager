import { Checkbox } from '@budget-app/ui';

export const Basic = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Checkbox label="Split with household" />
    <Checkbox label="Recurring purchase" defaultChecked />
  </div>
);

export const WithDescription = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Checkbox label="Recurring purchase" description="We'll add it automatically every month on this date." defaultChecked />
    <Checkbox label="Count towards goals" description="Round up to the nearest dollar and add the change to Holiday fund." />
  </div>
);

export const Group = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Checkbox label="Groceries" defaultChecked />
    <Checkbox label="Dining out" defaultChecked />
    <Checkbox label="Transport" />
    <Checkbox label="Subscriptions" disabled description="No transactions this month" />
  </div>
);

export const ErrorState = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Checkbox label="I confirm this is a shared expense" error="Please confirm before saving" />
  </div>
);
