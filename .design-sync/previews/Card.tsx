import { Badge, BudgetBar, Button, Card, TransactionItem } from '@budget-app/ui';

export const TitledSection = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 380 }}>
    <Card
      title="Budgets"
      subtitle="August"
      actions={
        <Button variant="ghost" size="sm">
          See all
        </Button>
      }
    >
      <BudgetBar category="Groceries" spent={312} limit={450} icon="🛒" />
      <BudgetBar category="Dining out" spent={180} limit={160} icon="🍜" color="coral" />
    </Card>
  </div>
);

export const EdgeToEdgeList = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 380 }}>
    <Card title="Recent" padding="none" actions={<Badge tone="info">3 today</Badge>}>
      <TransactionItem title="Trader Joe's" amount={-64.2} category="Groceries" when="5:12 PM" icon="🛒" />
      <TransactionItem title="Bus pass" amount={-2.75} category="Transport" when="8:05 AM" icon="🚌" />
      <TransactionItem title="Salary" amount={2400} category="Income" when="9:00 AM" icon="💼" />
    </Card>
  </div>
);

export const ElevatedWithFooter = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 380 }}>
    <Card elevated title="Safe to spend" subtitle="Until Aug 31 · 8 days left" footer="Based on your limits and what's already logged.">
      <span className="bdg-amount bdg-amount--display bdg-amount--bold bdg-amount--neutral">$1,834</span>
    </Card>
  </div>
);

export const Interactive = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 380 }}>
    <Card interactive onClick={() => undefined} title="Holiday fund" subtitle="$1,840 of $3,000 saved" actions={<Badge tone="positive">On track</Badge>}>
      <span className="bdg-text-sm bdg-text-muted">Tap to open the goal</span>
    </Card>
  </div>
);

export const PaddingSizes = () => (
  <div className="bdg-app bdg-stack bdg-gap-3" style={{ padding: 16, borderRadius: 12, maxWidth: 380 }}>
    <Card padding="sm">
      <span className="bdg-text-sm">padding="sm"</span>
    </Card>
    <Card padding="md">
      <span className="bdg-text-sm">padding="md" (default)</span>
    </Card>
    <Card padding="lg">
      <span className="bdg-text-sm">padding="lg"</span>
    </Card>
  </div>
);
