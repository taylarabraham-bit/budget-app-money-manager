import { Card, TransactionItem } from '@budget-app/ui';

const priya = { name: 'Priya Natarajan', color: 'violet' as const };
const sam = { name: 'Sam Okafor', color: 'sky' as const };

export const HouseholdRows = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card title="Today" padding="none">
      <TransactionItem title="Trader Joe's" amount={-64.2} category="Groceries" when="5:12 PM" member={priya} onClick={() => undefined} />
      <TransactionItem title="Bus pass" amount={-2.75} category="Transport" when="8:05 AM" member={sam} onClick={() => undefined} />
      <TransactionItem title="Salary" amount={2400} category="Income" when="9:00 AM" member={priya} onClick={() => undefined} />
    </Card>
  </div>
);

export const CategoryIcons = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card padding="none">
      <TransactionItem title="Electricity" amount={-92.1} category="Home & utilities" when="Aug 20" icon="💡" recurring />
      <TransactionItem title="Spotify family" amount={-16.99} category="Subscriptions" when="Aug 18" icon="🎵" recurring />
      <TransactionItem title="Farmers market" amount={-38.5} category="Groceries" when="Aug 17" icon="🥬" />
    </Card>
  </div>
);

export const PendingWithNote = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card padding="none">
      <TransactionItem title="Birthday gift" amount={-45} category="Gifts" when="Yesterday" member={sam} note="For Maya's friend" pending />
    </Card>
  </div>
);

export const Income = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <Card padding="none">
      <TransactionItem title="Freelance invoice #42" amount={850} category="Income" when="2:30 PM" member={priya} />
      <TransactionItem title="Refund - returned shoes" amount={59.99} category="Refund" when="11:10 AM" icon="↩️" />
    </Card>
  </div>
);
