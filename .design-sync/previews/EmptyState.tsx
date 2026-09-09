import { Button, Card, EmptyState } from '@budget-app/ui';

export const NoPurchases = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <EmptyState icon="🧾" title="No purchases yet" description="Log your first purchase and today's total will show up here." action={<Button>Log purchase</Button>} />
  </div>
);

export const NoGoals = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <EmptyState icon="🎯" title="No goals yet" description="Set a target and the household can save towards it together." action={<Button>Add a goal</Button>} />
  </div>
);

export const CompactInCard = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <Card title="Recent" padding="none">
      <EmptyState compact icon="🛒" title="Nothing logged today" description="Tap + to add a purchase." />
    </Card>
  </div>
);

export const NoResults = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <EmptyState compact title="No matches" description="Try a different merchant or category." />
  </div>
);
