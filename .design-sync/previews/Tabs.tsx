import { Card, Tabs } from '@budget-app/ui';

export const ScreenSections = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Tabs
      aria-label="Transactions"
      defaultValue="all"
      items={[
        { value: 'all', label: 'All', count: 42 },
        { value: 'mine', label: 'Mine', count: 18 },
        { value: 'pending', label: 'Pending', count: 2 },
      ]}
    />
  </div>
);

export const SegmentedFullWidth = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Tabs
      variant="segmented"
      fullWidth
      defaultValue="week"
      items={[
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ]}
    />
  </div>
);

export const SmallInCardHeader = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card
      title="Spending"
      actions={
        <Tabs
          variant="segmented"
          size="sm"
          defaultValue="month"
          items={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      }
    >
      <span className="bdg-text-sm bdg-text-muted">$1,612 spent this month</span>
    </Card>
  </div>
);

export const UnderlineFullWidthWithDisabled = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Tabs
      fullWidth
      defaultValue="overview"
      items={[
        { value: 'overview', label: 'Overview' },
        { value: 'goals', label: 'Goals' },
        { value: 'reports', label: 'Reports', disabled: true },
      ]}
    />
  </div>
);
