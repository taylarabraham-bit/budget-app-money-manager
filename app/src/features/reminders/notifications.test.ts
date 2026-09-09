import { describe, expect, it, vi } from 'vitest';
import { NOTIFY_RULES, fromNativePermission, notificationPermission, postDueNotifications, refreshNotificationPermission, seedNotifiedToday, tagToId } from './notifications';

// The packaged build routes these calls to Capacitor LocalNotifications, which
// can only run on a device - the mapping layer is what a unit test can pin.

describe('tagToId', () => {
  it('is stable, positive and never zero (zero is not a valid Android notification id)', () => {
    expect(tagToId('bill-overdue:b1')).toBe(tagToId('bill-overdue:b1'));
    expect(tagToId('')).toBe(1);
    for (const tag of ['bill-overdue:b1', 'payday:p1', 'disputed:t9', 'x']) {
      const id = tagToId(tag);
      expect(id).toBeGreaterThan(0);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });

  it('distinguishes the tags the reminder rules actually emit', () => {
    const tags = ['bill-overdue:b1', 'bill-due-today:b1', 'card-due-tomorrow:a1:2026-09-06', 'card-due-today:a1:2026-09-06', 'payday:p1', 'pending-approval:t1', 'disputed:t1'];
    expect(new Set(tags.map(tagToId)).size).toBe(tags.length);
  });
});

describe('fromNativePermission', () => {
  it('folds the plugin vocabulary into the web one', () => {
    expect(fromNativePermission('granted')).toBe('granted');
    expect(fromNativePermission('denied')).toBe('denied');
    expect(fromNativePermission('prompt')).toBe('default');
    expect(fromNativePermission('prompt-with-rationale')).toBe('default');
  });
});

describe('notificationPermission outside any shell', () => {
  it('reports unsupported where the Notification API is missing (node, packaged WebView without the plugin)', () => {
    expect(notificationPermission()).toBe('unsupported');
  });

  it('refresh resolves to the same answer outside a native shell', async () => {
    await expect(refreshNotificationPermission()).resolves.toBe('unsupported');
  });
});

describe('what is worth interrupting for', () => {
  it('the early card-due-soon heads-up never becomes an OS notification', () => {
    expect(NOTIFY_RULES.has('card-due-soon')).toBe(false);
    expect(NOTIFY_RULES.has('card-due-tomorrow')).toBe(true);
    expect(NOTIFY_RULES.has('card-due-today')).toBe(true);
  });
});

describe('enabling notifications is quiet (device QA DEV-2)', () => {
  it('stamps every currently-due NOTIFYING reminder as already notified today', () => {
    const reminders = [
      { id: 'bill-overdue:b1:2026-08-29', rule: 'bill-overdue' },
      { id: 'pending-approval:t1', rule: 'pending-approval' },
      // On the bell but never an OS notification - no stamp needed.
      { id: 'partner-balance:m2:2026-08', rule: 'partner-balance' },
    ] as const;
    const out = seedNotifiedToday(reminders, { 'bill-overdue:old:2026-08-01': '2026-08-28' }, '2026-08-30');
    expect(out).toEqual({
      'bill-overdue:old:2026-08-01': '2026-08-28',
      'bill-overdue:b1:2026-08-29': '2026-08-30',
      'pending-approval:t1': '2026-08-30',
    });
  });

  it('does not mutate the stored map it was given', () => {
    const prev = {};
    seedNotifiedToday([{ id: 'payday:p1:2026-08-30', rule: 'payday' }], prev, '2026-08-30');
    expect(prev).toEqual({});
  });
});

describe('postDueNotifications stamps as it goes (audit OB-7)', () => {
  const reminder = (id: string) => ({ id, title: id, body: '' });
  /** A show() whose promises the test resolves by hand, in order. */
  const controllable = () => {
    const pending: Array<(ok: boolean) => void> = [];
    const show = vi.fn(() => new Promise<boolean>((resolve) => pending.push(resolve)));
    return { show, resolveNext: async (ok: boolean) => { pending.shift()!(ok); await Promise.resolve(); await Promise.resolve(); } };
  };

  it('stamps each id the moment its post resolves, not at the end of the loop', async () => {
    const { show, resolveNext } = controllable();
    const stamped: string[] = [];
    const done = postDueNotifications([reminder('a'), reminder('b')], '2026-09-02', new Set(), (id) => stamped.push(id), show);
    expect(stamped).toEqual([]);
    await resolveNext(true);
    expect(stamped).toEqual(['a']);
    await resolveNext(true);
    await done;
    expect(stamped).toEqual(['a', 'b']);
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('a superseding run skips the ids the first run is still posting, so nothing buzzes twice', async () => {
    const { show, resolveNext } = controllable();
    const inFlight = new Set<string>();
    const stamped: string[] = [];
    const first = postDueNotifications([reminder('a'), reminder('b')], '2026-09-02', inFlight, (id) => stamped.push(id), show);
    // The effect re-ran (a household commit) before A's post resolved: A and B are in flight, only C is new.
    const second = postDueNotifications([reminder('a'), reminder('b'), reminder('c')], '2026-09-02', inFlight, (id) => stamped.push(id), show);
    expect(show).toHaveBeenCalledTimes(2); // a (run 1) and c (run 2)
    await resolveNext(true); // a
    await resolveNext(true); // c
    await resolveNext(true); // b
    await Promise.all([first, second]);
    expect(show).toHaveBeenCalledTimes(3);
    expect(stamped.sort()).toEqual(['a', 'b', 'c']);
    expect(inFlight.size).toBe(0);
  });

  it('leaves a failed or throwing post unstamped and out of the in-flight set, so the next run retries it', async () => {
    const inFlight = new Set<string>();
    const stamped: string[] = [];
    const show = vi.fn(async (title: string) => {
      if (title === 'boom') throw new Error('bridge down');
      return title !== 'no';
    });
    await postDueNotifications([reminder('ok'), reminder('no'), reminder('boom')], '2026-09-02', inFlight, (id) => stamped.push(id), show);
    expect(stamped).toEqual(['ok']);
    expect(inFlight.size).toBe(0);
  });
});
