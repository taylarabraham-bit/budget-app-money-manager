import { BudgetBar, Card } from '@budget-app/ui';

export const BudgetOverview = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <Card title="Budgets" subtitle="August">
      <BudgetBar category="Groceries" spent={312} limit={450} icon="🛒" />
      <BudgetBar category="Transport" spent={96} limit={120} icon="🚌" color="sky" />
      <BudgetBar category="Dining out" spent={148} limit={160} icon="🍜" color="coral" />
      <BudgetBar category="Fun" spent={205} limit={150} icon="🎮" color="violet" />
    </Card>
  </div>
);

export const OnTrack = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <BudgetBar category="Groceries" spent={312} limit={450} icon="🛒" period="Aug 1-31" />
  </div>
);

export const NearLimit = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <BudgetBar category="Dining out" spent={148} limit={160} icon="🍜" color="coral" period="9 days left" />
  </div>
);

export const OverLimit = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <BudgetBar category="Fun" spent={205} limit={150} icon="🎮" color="violet" />
  </div>
);

export const NoLimit = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <BudgetBar category="One-off & misc" spent={83.4} limit={0} icon="🧾" color="rose" />
  </div>
);

export const TappableShowingSpent = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <BudgetBar category="Home & utilities" spent={640} limit={800} icon="🏠" color="lime" period="Aug 1-31" show="spent" onClick={() => undefined} />
    <BudgetBar category="Maya's allowance" spent={35} limit={60} icon="🧒" color="amber" onClick={() => undefined} />
  </div>
);
