// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showNotification } from './notifications';

// The browser path posts through a service-worker registration. `register()`
// resolves before the worker is active and showNotification then rejects, so
// the first notification after turning them on was dropped (audit UI-25):
// the post now waits for `navigator.serviceWorker.ready` first.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

function stubServiceWorker(ready: Promise<unknown>) {
  const reg = { showNotification: vi.fn(async () => undefined) };
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg, register: async () => reg, ready }, configurable: true, writable: true });
  vi.stubGlobal('Notification', { permission: 'granted' });
  return reg;
}

describe('showNotification in a browser tab', () => {
  it('waits for the worker to be ready before posting through the registration', async () => {
    let activate!: () => void;
    const reg = stubServiceWorker(new Promise<void>((resolve) => (activate = resolve)));
    let settled: boolean | null = null;
    const p = showNotification('Rent is due', { body: '$1,200', tag: 'bill-due-today:b1' }).then((ok) => (settled = ok));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(reg.showNotification).not.toHaveBeenCalled();
    expect(settled).toBeNull();
    activate();
    await p;
    expect(settled).toBe(true);
    expect(reg.showNotification).toHaveBeenCalledWith('Rent is due', { body: '$1,200', tag: 'bill-due-today:b1' });
  });

  it('does not hang on a worker that never activates: the timeout lets the post go ahead', async () => {
    vi.useFakeTimers();
    const reg = stubServiceWorker(new Promise(() => undefined));
    const p = showNotification('Payday', { tag: 'payday:p1' });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toBe(true);
    expect(reg.showNotification).toHaveBeenCalledTimes(1);
  });

  it('reports false when the registration refuses the post', async () => {
    const reg = stubServiceWorker(Promise.resolve());
    reg.showNotification.mockRejectedValueOnce(new TypeError('no active worker'));
    await expect(showNotification('x', { tag: 'x' })).resolves.toBe(false);
  });
});
