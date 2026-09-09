import type { ReactNode } from 'react';
import { Avatar, Badge, BottomNav, Button } from '@budget-app/ui';
import { useHousehold } from '../data/store';

export type ScreenKey = 'overview' | 'activity' | 'bills' | 'goals' | 'household';

interface AppNavProps {
  screen: ScreenKey;
  onChange: (screen: ScreenKey) => void;
  onLogPurchase: () => void;
  /** Desktop: the brand block (avatar + household name) opens Settings. Phones use the header avatar instead. */
  onOpenSettings?: () => void;
  pendingCount?: number;
}

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const NAV_ITEMS: Array<{ value: ScreenKey; label: string; icon: ReactNode }> = [
  { value: 'overview', label: 'Overview', icon: icon('M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { value: 'activity', label: 'Activity', icon: icon('M4 6h16M4 12h10M4 18h14') },
  { value: 'bills', label: 'Bills', icon: icon('M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6') },
  { value: 'goals', label: 'Goals', icon: icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z') },
  { value: 'household', label: 'Household', icon: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8') },
];

/**
 * Phone: the design system's BottomNav with the "+" action. Desktop (Windows):
 * a sidebar built from tokens + Button, since the bottom bar is a phone idiom.
 */
export function AppNav({ screen, onChange, onLogPurchase, onOpenSettings, pendingCount = 0 }: AppNavProps) {
  const { household, members, currentMemberId, isSample } = useHousehold();
  const me = members.find((m) => m.id === currentMemberId);
  const brand = (
    <>
      {me && <Avatar name={me.name} color={me.color} size="md" status="active" />}
      <div className="app-side__brand-text">
        <div className="app-side__household">{household.name}</div>
        <div className="bdg-row bdg-gap-2">
          <span className="bdg-text-xs bdg-text-muted">{me?.name}</span>
          {isSample && (
            <Badge tone="neutral" size="sm">
              Sample
            </Badge>
          )}
        </div>
      </div>
    </>
  );
  return (
    <>
      <aside className="app-side" aria-label="Primary">
        {onOpenSettings ? (
          <button type="button" className="app-side__brand app-side__brand--button" onClick={onOpenSettings} aria-label="Settings" title="Settings">
            {brand}
          </button>
        ) : (
          <div className="app-side__brand">{brand}</div>
        )}
        <nav className="app-side__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`app-side__item${item.value === screen ? ' app-side__item--active' : ''}`}
              aria-current={item.value === screen ? 'page' : undefined}
              onClick={() => onChange(item.value)}
            >
              <span className="app-side__icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.value === 'activity' && pendingCount > 0 && <span className="app-side__badge">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <Button size="lg" fullWidth onClick={onLogPurchase} iconStart={<span aria-hidden="true">+</span>}>
          Log purchase
        </Button>
      </aside>
      <div className="app-bottom-nav">
        <BottomNav
          fixed
          items={NAV_ITEMS.map((item) => (item.value === 'activity' && pendingCount > 0 ? { ...item, badge: pendingCount } : item))}
          value={screen}
          onChange={(v) => onChange(v as ScreenKey)}
          action={{ label: 'Log purchase', icon: '+', onClick: onLogPurchase }}
        />
      </div>
    </>
  );
}
