import { describe, expect, it } from 'vitest';
import { HOME, routeDepth, stepBack, type Route } from './navigation';

// The one Back step both the hardware button and the browser share (audit UI-29).

describe('stepBack', () => {
  it('drops the sub-screen first, then the tab, then has nothing left', () => {
    const deep: Route = { tab: 'bills', sub: { name: 'paydays' } };
    const tab = stepBack(deep);
    expect(tab).toEqual({ tab: 'bills' });
    expect(stepBack(tab!)).toEqual(HOME);
    expect(stepBack(HOME)).toBeNull();
  });

  it('a sub-screen over Overview steps straight to Overview, and params never count as a step', () => {
    expect(stepBack({ tab: 'overview', sub: { name: 'settle' } })).toEqual(HOME);
    expect(stepBack({ tab: 'activity', params: { kind: 'pending', at: 1 } })).toEqual(HOME);
    expect(stepBack({ tab: 'overview', params: { kind: 'all' } })).toBeNull();
  });
});

describe('routeDepth', () => {
  it('counts exactly the stepBack() steps to Overview', () => {
    const routes: Route[] = [HOME, { tab: 'goals' }, { tab: 'overview', sub: { name: 'accounts' } }, { tab: 'bills', sub: { name: 'paydays' } }, { tab: 'activity', params: { kind: 'income' } }];
    for (const r of routes) {
      let steps = 0;
      for (let cur: Route | null = r; (cur = stepBack(cur)); ) steps++;
      expect(routeDepth(r)).toBe(steps);
    }
  });
});
