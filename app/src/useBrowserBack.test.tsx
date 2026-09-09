// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { HOME, stepBack, type Route } from './navigation';
import { useBrowserBack, type BackResult } from './useBrowserBack';

// Outside the APK the system Back must step (dialog, sub-screen, tab) rather
// than leave the site (audit UI-29). jsdom keeps a real session history for
// pushState/go, so the stack can be driven end to end.

const box: { route?: Route; go?: (r: Route) => void; dialogOpen: boolean; closed: number } = { dialogOpen: false, closed: 0 };

function Harness() {
  const [route, setRoute] = useState<Route>(HOME);
  box.route = route;
  box.go = setRoute;
  const pressBack = (): BackResult => {
    if (box.dialogOpen) {
      box.dialogOpen = false;
      box.closed += 1;
      return 'dialog';
    }
    const next = stepBack(route);
    if (!next) return 'exit';
    setRoute(next);
    return 'route';
  };
  useBrowserBack(route, pressBack);
  return null;
}

const go = (r: Route) => act(() => box.go!(r));
/** history.go() traverses asynchronously in jsdom: give the popstate a turn. */
const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
});
const systemBack = async () => {
  history.back();
  await settle();
};

// jsdom keeps one session history for the file: a fresh entry per test clears the forward entries the previous one left behind.
beforeEach(() => history.pushState(null, ''));
afterEach(() => {
  cleanup();
  box.dialogOpen = false;
  box.closed = 0;
});

describe('useBrowserBack', () => {
  it('pushes one entry per step and Back steps sub-screen -> tab -> Overview', async () => {
    render(<Harness />);
    const base = history.length;
    go({ tab: 'bills' });
    expect(history.length).toBe(base + 1);
    go({ tab: 'bills', sub: { name: 'paydays' } });
    expect(history.length).toBe(base + 2);
    await systemBack();
    expect(box.route).toEqual({ tab: 'bills' });
    await systemBack();
    expect(box.route).toEqual(HOME);
  });

  it('a sub-screen opened straight from Overview is one entry, and param-only changes push nothing', () => {
    render(<Harness />);
    const base = history.length;
    go({ tab: 'overview', sub: { name: 'settle' } });
    expect(history.length).toBe(base + 1);
    go({ tab: 'activity', params: { kind: 'pending', at: 1 } });
    go({ tab: 'activity', params: { kind: 'pending', at: 2 } });
    expect(history.length).toBe(base + 1);
  });

  it('the on-screen Back drops the surplus entry, so the next system Back keeps stepping from the tab', async () => {
    render(<Harness />);
    go({ tab: 'bills', sub: { name: 'paydays' } });
    go({ tab: 'bills' }); // on-screen Back: history.go(-1) under the hood
    await settle();
    expect(box.route).toEqual({ tab: 'bills' });
    await systemBack();
    expect(box.route).toEqual(HOME);
  });

  it('Back with a dialog open closes the dialog and keeps the route (its entry is put back)', async () => {
    render(<Harness />);
    go({ tab: 'goals' });
    box.dialogOpen = true;
    await systemBack();
    expect(box.closed).toBe(1);
    expect(box.route).toEqual({ tab: 'goals' });
    await systemBack();
    expect(box.route).toEqual(HOME);
  });

  it('does nothing inside the packaged app', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    try {
      render(<Harness />);
      const base = history.length;
      go({ tab: 'bills', sub: { name: 'paydays' } });
      expect(history.length).toBe(base);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
