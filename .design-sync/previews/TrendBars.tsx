import { Card, TrendBars } from '@budget-app/ui';

const week = [
  { label: 'Mon', value: 120 },
  { label: 'Tue', value: 95 },
  { label: 'Wed', value: 160 },
  { label: 'Thu', value: 80 },
  { label: 'Fri', value: 210 },
  { label: 'Sat', value: 64 },
  { label: 'Sun', value: 148.5 },
];

export const EarningsWithTarget = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card title="Earnings this week" subtitle="Target $150/day">
      <TrendBars data={week} reference={150} referenceLabel="Target" />
    </Card>
  </div>
);

export const SpendTall = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card title="Spend this week">
      <TrendBars data={week} tone="negative" height={120} highlightIndex={4} />
    </Card>
  </div>
);

export const NetPerDay = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card title="Net per day" subtitle="Income minus spend">
      <TrendBars
        data={[
          { label: 'Mon', value: 40 },
          { label: 'Tue', value: -25 },
          { label: 'Wed', value: 90 },
          { label: 'Thu', value: -10 },
          { label: 'Fri', value: 130 },
          { label: 'Sat', value: -60 },
          { label: 'Sun', value: 20 },
        ]}
      />
    </Card>
  </div>
);

export const WeeklyCount = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card title="Purchases logged" subtitle="Per week">
      <TrendBars
        data={[
          { label: 'W1', value: 3 },
          { label: 'W2', value: 5 },
          { label: 'W3', value: 4 },
          { label: 'W4', value: 6 },
        ]}
        formatValue={(v) => `${v} logged`}
        tone="accent"
        height={72}
      />
    </Card>
  </div>
);
