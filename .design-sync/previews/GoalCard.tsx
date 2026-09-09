import { GoalCard } from '@budget-app/ui';
import type { Member } from '@budget-app/ui';

const household: Member[] = [
  { name: 'Priya Natarajan', color: 'violet' },
  { name: 'Sam Okafor', color: 'sky' },
  { name: 'Maya Okafor', color: 'coral' },
];

export const Active = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <GoalCard name="Holiday fund" icon="✈️" target={3000} saved={1840} deadline="by Dec 20" pace="$85/week to make it" contributors={household} onClick={() => undefined} />
  </div>
);

export const Reached = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <GoalCard name="Emergency savings" icon="🛟" target={2000} saved={2000} status="completed" contributors={household.slice(0, 2)} />
  </div>
);

export const Paused = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <GoalCard name="New laptop" icon="💻" target={1400} saved={320} status="paused" deadline="no date" contributors={[household[1]]} />
  </div>
);

export const JustStarted = () => (
  <div className="bdg-app" style={{ padding: 16, borderRadius: 12, maxWidth: 400 }}>
    <GoalCard name="Bikes for the kids" icon="🚲" target={900} saved={120} deadline="by Mar 1" pace="$30/week to make it" contributors={household} />
  </div>
);

export const CompactGrid = () => (
  <div className="bdg-app bdg-grid-2" style={{ padding: 16, borderRadius: 12, maxWidth: 420 }}>
    <GoalCard compact name="Holiday fund" icon="✈️" target={3000} saved={1840} />
    <GoalCard compact name="Bikes" icon="🚲" target={900} saved={120} />
  </div>
);
