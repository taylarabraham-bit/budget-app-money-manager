import type { ReactNode } from 'react';
import { BottomNav } from '@budget-app/ui';

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const items = [
  { value: 'overview', label: 'Overview', icon: icon('M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { value: 'activity', label: 'Activity', icon: icon('M4 6h16M4 12h10M4 18h14'), badge: 2 },
  { value: 'goals', label: 'Goals', icon: icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z') },
  { value: 'household', label: 'Household', icon: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8') },
];

const Phone = ({ children }: { children: ReactNode }) => (
  <div className="bdg-app" style={{ width: 390, margin: '0 auto', paddingTop: 24, borderRadius: 16, overflow: 'hidden' }}>{children}</div>
);

export const WithLogAction = () => (
  <Phone>
    <BottomNav items={items} value="overview" action={{ label: 'Log purchase', icon: '+' }} />
  </Phone>
);

export const ActivitySelected = () => (
  <Phone>
    <BottomNav items={items} value="activity" action={{ label: 'Log purchase', icon: '+' }} />
  </Phone>
);

export const FourDestinations = () => (
  <Phone>
    <BottomNav items={items} value="goals" />
  </Phone>
);

export const ThreeDestinations = () => (
  <Phone>
    <BottomNav items={items.slice(0, 3)} value="household" />
  </Phone>
);
