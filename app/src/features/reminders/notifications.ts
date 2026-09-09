import type { Reminder, ReminderRule } from './types';

// Optional native notifications. They only fire while the app is open - there
// is no background delivery yet (scheduling ahead via LocalNotifications is a
// packaging-day feature). Two runtimes, one surface:
//
//  - Browser tab: Android Chrome refuses `new Notification()` from a page, so a
//    service worker registration is used when one is available.
//  - Packaged (Capacitor) build: the WebView has no `window.Notification` at
//    all; the same three calls route to the LocalNotifications plugin. The
//    plugin's permission check is async, so its answer is CACHED for the sync
//    `notificationPermission()` - refreshed at module load, after every
//    request, and by `refreshNotificationPermission()`, which the provider
//    awaits after mount (the first render always snapshots before the bridge
//    answers - QA7 R-2).

export type PermissionState = NotificationPermission | 'unsupported';

export const NOTIFY_RULES: ReadonlySet<ReminderRule> = new Set<ReminderRule>(['bill-overdue', 'bill-due-today', 'card-due-tomorrow', 'card-due-today', 'card-payment-missed', 'payday', 'pending-approval', 'disputed']);

/**
 * Turning notifications ON is quiet: everything already due is on the bell the
 * user is looking at, so it gets stamped as notified-today instead of bursting
 * one OS notification per open reminder (device QA DEV-2). Only reminders that
 * appear from then on interrupt - and ongoing ones resume their once-a-day
 * nudge from tomorrow.
 */
export function seedNotifiedToday(reminders: ReadonlyArray<{ id: string; rule: ReminderRule }>, lastNotified: Record<string, string>, today: string): Record<string, string> {
  const stamped = { ...lastNotified };
  for (const r of reminders) if (NOTIFY_RULES.has(r.rule)) stamped[r.id] = today;
  return stamped;
}

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };

function nativeShell(): boolean {
  try {
    return !!(globalThis as CapacitorGlobal).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

// Resolve with the MODULE, never the plugin object: Capacitor plugins are
// proxies that intercept every property access - including the `.then` the
// promise machinery probes on resolution (see data/durable.ts).
let pluginPromise: Promise<typeof import('@capacitor/local-notifications')> | null = null;
const plugin = () => (pluginPromise ??= import('@capacitor/local-notifications'));

/** The plugin's permission display values, folded into this module's PermissionState. */
export function fromNativePermission(display: string): PermissionState {
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';
}

/** Stable positive 31-bit id from a tag, so a repeat of the same tag REPLACES the notification (web `tag` semantics). */
export function tagToId(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  // Mask, not Math.abs: abs of exactly -2^31 is 2^31, one past the Java-int
  // cap Android notification ids live in (QA7 R-6).
  return (h & 0x7fffffff) || 1;
}

let nativePermission: PermissionState = 'default';

/** Re-checks the real permission (async in a native shell) and returns it; the sync cache is updated on the way. */
export async function refreshNotificationPermission(): Promise<PermissionState> {
  if (nativeShell()) {
    try {
      nativePermission = fromNativePermission((await (await plugin()).LocalNotifications.checkPermissions()).display);
    } catch {
      // keep the cached answer; the request path retries
    }
    return nativePermission;
  }
  return notificationPermission();
}

if (nativeShell()) void refreshNotificationPermission();

export function notificationPermission(): PermissionState {
  if (nativeShell()) return nativePermission;
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (nativeShell()) {
    try {
      nativePermission = fromNativePermission((await (await plugin()).LocalNotifications.requestPermissions()).display);
    } catch {
      // keep the cached answer
    }
    return nativePermission;
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  } catch {
    return null;
  }
}

/** How long to wait for a freshly registered worker to activate before posting anyway (a worker that fails to install never becomes ready). */
const SW_READY_TIMEOUT_MS = 5000;

/** Shows one notification; `tag` dedupes at the OS level (a second tab will not double up). */
export async function showNotification(title: string, options: { body?: string; tag: string }): Promise<boolean> {
  if (nativeShell()) {
    if (nativePermission !== 'granted') return false;
    try {
      await (await plugin()).LocalNotifications.schedule({ notifications: [{ id: tagToId(options.tag), title, body: options.body ?? '' }] });
      return true;
    } catch {
      return false;
    }
  }
  if (notificationPermission() !== 'granted') return false;
  const reg = await registration();
  try {
    if (reg) {
      // register() resolves before the worker is active, and showNotification on a
      // registration with no active worker rejects - the first notification after
      // turning them on was dropped until the minute tick retried (audit UI-25).
      // `ready` never rejects, so it is raced against a timeout rather than awaited bare.
      await Promise.race([navigator.serviceWorker.ready, new Promise<void>((resolve) => setTimeout(resolve, SW_READY_TIMEOUT_MS))]);
      await reg.showNotification(title, { body: options.body, tag: options.tag });
      return true;
    }
    new Notification(title, { body: options.body, tag: options.tag });
    return true;
  } catch {
    return false;
  }
}

/**
 * Posts each due reminder in turn and stamps every one the moment it is on
 * screen. The provider's notify effect re-runs on every household commit and
 * on the minute tick; stamping only at the end, behind a cancel flag, dropped
 * the stamps exactly when the work had been done, and the re-run posted (and
 * buzzed) each reminder again (audit OB-7). `inFlight` is shared between runs
 * so a superseding run never posts an id this one is still awaiting; a post
 * that fails is left unstamped for the next run to retry.
 */
export async function postDueNotifications(
  due: ReadonlyArray<Pick<Reminder, 'id' | 'title' | 'body'>>,
  today: string,
  inFlight: Set<string>,
  stamp: (id: string, day: string) => void,
  show: (title: string, options: { body?: string; tag: string }) => Promise<boolean> = showNotification,
): Promise<void> {
  const mine = due.filter((r) => !inFlight.has(r.id));
  for (const r of mine) inFlight.add(r.id);
  for (const r of mine) {
    let shown: boolean;
    try {
      shown = await show(r.title, { body: r.body, tag: r.id });
    } catch {
      shown = false;
    } finally {
      inFlight.delete(r.id);
    }
    if (shown) stamp(r.id, today);
  }
}
