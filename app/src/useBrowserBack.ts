import { useEffect, useRef } from 'react';
import { isNativeShell } from './data/durable';
import { routeDepth, type Route } from './navigation';

/** What one Back press did - the same answer for the hardware button and the browser's popstate. */
export type BackResult =
  /** The setup wizard is up; it has its own Back and the press is ignored. */
  | 'swallowed'
  /** The topmost dialog closed. */
  | 'dialog'
  /** The route stepped down (sub-screen to its tab, tab to Overview). */
  | 'route'
  /** Overview with nothing open: nothing is above it (the APK exits, a browser tab leaves). */
  | 'exit';

interface HistoryState {
  /** How many app entries sit under this one - 0 is the entry the app booted on. */
  mm?: number;
}

/** popstates the hook caused itself (history.go) are ignored, but not forever: a go() past the stack fires none. */
const IGNORE_WINDOW_MS = 2000;

const entryDepth = (state: unknown): number => {
  const mm = (state as HistoryState | null)?.mm;
  return typeof mm === 'number' && mm >= 0 ? mm : 0;
};

/**
 * Browser-history integration for the route outside the APK (audit UI-29).
 * Sub-screens and tabs pushed no history entries, so in Chrome on the phone
 * (the tailnet demo) the system Back left the site from Settings instead of
 * stepping. Now the stack mirrors routeDepth(): one entry per stepBack() step
 * above Overview, pushed as the route deepens and popped (history.go) as it
 * shallows, and a popstate runs the same `pressBack` the hardware button
 * uses. Dialogs push nothing; a Back that closes one (or that the wizard
 * swallows) puts its entry back so the route keeps its depth. Inside the
 * packaged app this hook does nothing - the Capacitor listener owns Back.
 */
export function useBrowserBack(route: Route, pressBack: () => BackResult): void {
  const active = typeof window !== 'undefined' && typeof history !== 'undefined' && !isNativeShell();
  /** App entries currently on the stack above the boot entry. */
  const depthRef = useRef(0);
  const ignoreRef = useRef({ count: 0, at: 0 });
  const pressRef = useRef(pressBack);
  pressRef.current = pressBack;

  useEffect(() => {
    if (!active) return;
    try {
      history.scrollRestoration = 'manual'; // App scrolls to the top on its own (audit UI-8)
      history.replaceState({ ...(typeof history.state === 'object' && history.state !== null ? (history.state as object) : {}), mm: 0 }, '');
    } catch {
      // a history that refuses state (some embedded views): Back simply leaves, as before
    }
    const push = () => {
      try {
        history.pushState({ mm: depthRef.current + 1 } satisfies HistoryState, '');
        depthRef.current += 1;
      } catch {
        // over the pushState rate limit: the stack is one short, which one dead press absorbs
      }
    };
    const onPop = (e: PopStateEvent) => {
      const ignore = ignoreRef.current;
      if (ignore.count > 0 && Date.now() - ignore.at < IGNORE_WINDOW_MS) {
        ignore.count -= 1;
        return;
      }
      ignore.count = 0;
      const landed = entryDepth(e.state);
      const was = depthRef.current;
      if (landed > was) {
        // Forward: the app has no forward - undo it.
        ignoreRef.current = { count: landed - was, at: Date.now() };
        try {
          history.go(was - landed);
        } catch {
          ignoreRef.current.count = 0;
        }
        return;
      }
      depthRef.current = landed;
      let consumed = 0;
      for (let i = 0; i < Math.max(1, was - landed); i++) {
        const did = pressRef.current();
        if (did === 'exit') break;
        if (did !== 'route') consumed += 1;
      }
      for (let i = 0; i < consumed; i++) push();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const want = routeDepth(route);
    const have = depthRef.current;
    if (want > have) {
      for (let i = have; i < want; i++) {
        try {
          history.pushState({ mm: depthRef.current + 1 } satisfies HistoryState, '');
          depthRef.current += 1;
        } catch {
          break;
        }
      }
    } else if (want < have) {
      // The on-screen Back (or a tab tap from a sub-screen): drop the surplus entries so the
      // system Back keeps stepping from where the user actually is. The popstates that go()
      // fires are ours to ignore.
      ignoreRef.current = { count: ignoreRef.current.count + (have - want), at: Date.now() };
      depthRef.current = want;
      try {
        history.go(want - have);
      } catch {
        ignoreRef.current.count = 0;
      }
    }
    // Param-only changes (a reminder re-opening Activity's pending tab) are not steps.
  }, [active, route.tab, route.sub?.name]); // eslint-disable-line react-hooks/exhaustive-deps
}
