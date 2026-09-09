---
category: Navigation
keywords: [bottom navigation, tab bar, mobile nav, android, destinations, add purchase, fab, plus button]
---

# BottomNav

The Android bottom navigation bar: 3-5 destinations with an icon and a one-word label, plus an optional raised centre `action` - the "+" that logs a purchase from anywhere. On phone screens pass `fixed` so it pins to the bottom of the viewport; on desktop (Windows) use a sidebar instead and leave BottomNav out.

## Usage

```jsx
import { BottomNav } from '@budget-app/ui';

const icon = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

const items = [
  { value: 'overview', label: 'Overview', icon: icon('M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { value: 'transactions', label: 'Activity', icon: icon('M4 6h16M4 12h10M4 18h14'), badge: 2 },
  { value: 'goals', label: 'Goals', icon: icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z') },
  { value: 'household', label: 'Household', icon: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8') },
];

const [screen, setScreen] = useState('overview');
<BottomNav
  items={items}
  value={screen}
  onChange={setScreen}
  action={{ label: 'Log purchase', icon: '+', onClick: openLogPurchase }}
  fixed
/>
```

## Guidance

- The four app destinations are Overview, Activity (transactions), Goals and Household; keep their order stable.
- `badge` shows a count (pending items to review); omit it when zero.
- With `fixed`, give the screen content `padding-bottom: 88px` so the last row is not hidden behind the bar.
- Icons are 24px SVGs using `currentColor`; emoji work in a pinch.
