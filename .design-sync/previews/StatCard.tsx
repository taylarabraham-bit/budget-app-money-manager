import { StatCard } from '@budget-app/ui';

export const TodaysEarnings = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 320 }}>
    <StatCard label="Today's earnings" value={148.5} change={0.12} changeLabel="vs yesterday" icon="💵" />
  </div>
);

export const SpendDirection = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 320 }}>
    <StatCard label="Spent this week" value={612.4} change={0.08} changeLabel="vs last week" direction="spend" icon="🛒" />
  </div>
);

export const PrimaryHero = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 320 }}>
    <StatCard label="Safe to spend" value={1834} tone="primary" caption="Until Aug 31 · 8 days" wholeOnly icon="🛡️" />
  </div>
);

export const NonMoney = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 320 }}>
    <StatCard label="Saving streak" valueText="14 days" caption="Best: 21 days" icon="🔥" />
  </div>
);

export const CompactGrid = () => (
  <div className="bdg-app bdg-grid-2" style={{ padding: 16, borderRadius: 12, maxWidth: 380 }}>
    <StatCard compact label="Earned today" value={148.5} change={0.12} />
    <StatCard compact label="Spent today" value={64.2} direction="spend" change={-0.3} />
    <StatCard compact label="Saved" value={220} change={0} changeLabel="flat" />
    <StatCard compact label="Goals" valueText="3 active" />
  </div>
);
