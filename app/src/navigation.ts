import { createContext, useContext } from 'react';
import type { ScreenKey } from './components/AppNav';

// Where the app is. There is no router: the bottom nav / sidebar picks a tab,
// and a tab can show one sub-screen on top of it (Settings today; settle-up,
// paydays, lists and reports later). Tapping any tab clears the sub-screen.

export type SubScreen =
  | { name: 'settings' }
  | { name: 'settle' }
  | { name: 'paydays' }
  | { name: 'accounts' }
  | { name: 'lists'; list?: 'shopping' | 'wish' }
  | { name: 'report'; month?: string; memberId?: string | null };

export interface Route {
  tab: ScreenKey;
  sub?: SubScreen;
  /** Tab-level options, e.g. which Activity kind tab to open (`pending` for approvals). */
  params?: {
    kind?: 'all' | 'spend' | 'income' | 'pending';
    /** Navigation nonce: re-navigating with identical params must still re-apply them (QA UX-6). */
    at?: number;
  };
}

export const HOME: Route = { tab: 'overview' };

/**
 * One system-Back step, the way the on-screen Back behaves: a sub-screen falls
 * back to its tab, any other tab to Overview. Null from Overview - nothing is
 * above it, so the APK exits and a browser tab leaves the site. Shared by the
 * hardware-Back handler and the browser's popstate (audit UI-29).
 */
export function stepBack(route: Route): Route | null {
  if (route.sub) return { tab: route.tab };
  if (route.tab !== 'overview') return HOME;
  return null;
}

/** How many stepBack() steps `route` sits above Overview - the history entries it earns outside the APK. */
export function routeDepth(route: Route): number {
  return (route.sub ? 1 : 0) + (route.tab !== 'overview' ? 1 : 0);
}

export interface Navigation {
  route: Route;
  go: (route: Route) => void;
  /** Opens Settings on top of the current tab. */
  openSettings: () => void;
}

export const NavigationContext = createContext<Navigation | null>(null);

/** Navigation for components that sit inside any screen (e.g. the header's avatar button). */
export function useNavigation(): Navigation {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside <App>');
  return ctx;
}
