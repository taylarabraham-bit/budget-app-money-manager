import { Select } from '@budget-app/ui';

const categories = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'dining', label: 'Dining out' },
  { value: 'transport', label: 'Transport' },
  { value: 'home', label: 'Home & utilities' },
  { value: 'fun', label: 'Fun' },
];

const members = [
  { value: 'priya', label: 'Priya Natarajan' },
  { value: 'sam', label: 'Sam Okafor' },
  { value: 'maya', label: 'Maya Okafor' },
];

export const Placeholder = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Select label="Category" options={categories} placeholder="Choose a category" fullWidth />
  </div>
);

export const Preselected = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Select label="Paid by" options={members} defaultValue="priya" hint="Who made the purchase" fullWidth />
  </div>
);

export const ErrorState = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Select label="Category" options={categories} placeholder="Choose a category" error="Pick a category so we can track it" fullWidth />
  </div>
);

export const Sizes = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Select label="Small" size="sm" options={categories} defaultValue="groceries" fullWidth />
    <Select label="Large" size="lg" options={categories} defaultValue="dining" fullWidth />
  </div>
);

export const Disabled = () => (
  <div className="bdg-app bdg-stack" style={{ padding: 16, borderRadius: 12, maxWidth: 360 }}>
    <Select label="Account" options={[{ value: 'main', label: 'Joint account' }]} defaultValue="main" disabled fullWidth />
  </div>
);
