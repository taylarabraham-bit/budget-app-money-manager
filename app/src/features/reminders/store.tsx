import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEYS, isRecord, isString, readStored, writeStored } from '../../data/persist';
import { useHousehold } from '../../data/store';
import { todayIso } from '../../lib/dates';
import { useAccounts } from '../accounts/store';
import { useBills } from '../bills/store';
import { usePaydays } from '../paydays/store';
import { useSettlements } from '../settle/store';
import { NOTIFY_RULES, notificationPermission, postDueNotifications, refreshNotificationPermission, requestNotificationPermission, seedNotifiedToday, type PermissionState } from './notifications';
import { selectReminders } from './rules';
import type { Reminder, RemindersState } from './types';

export interface RemindersStore {
  /** Active (not dismissed), most urgent first. */
  reminders: Reminder[];
  /** Including dismissed ones. */
  all: Reminder[];
  dismissedIds: Set<string>;
  count: number;
  top: Reminder | null;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  restore: (id: string) => void;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  notificationsEnabled: boolean;
  notificationPermission: PermissionState;
  /** Turns native notifications on (asking permission first) or off; resolves to the resulting state. */
  setNotificationsEnabled: (on: boolean) => Promise<boolean>;
}

const RemindersContext = createContext<RemindersStore | null>(null);

const DAY = 86_400_000;
const KEEP_DISMISSALS_DAYS = 45;

function isRemindersState(x: unknown): x is RemindersState {
  return isRecord(x) && isRecord(x.dismissed) && typeof x.notificationsEnabled === 'boolean' && isRecord(x.lastNotified);
}

const readState = (x: unknown): RemindersState | null => {
  if (!isRemindersState(x)) return null;
  const dismissed: Record<string, string> = {};
  for (const [k, v] of Object.entries(x.dismissed)) if (isString(v)) dismissed[k] = v;
  const lastNotified: Record<string, string> = {};
  for (const [k, v] of Object.entries(x.lastNotified)) if (isString(v)) lastNotified[k] = v;
  return { dismissed, notificationsEnabled: x.notificationsEnabled, lastNotified };
};

/** Forget dismissals older than 45 days and notification stamps from before yesterday. */
function prune(state: RemindersState, now: Date): RemindersState {
  const cutoff = now.getTime() - KEEP_DISMISSALS_DAYS * DAY;
  const yesterday = todayIso(new Date(now.getTime() - DAY));
  const dismissed: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.dismissed)) if (new Date(v).getTime() >= cutoff) dismissed[k] = v;
  const lastNotified: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.lastNotified)) if (v >= yesterday) lastNotified[k] = v;
  return { ...state, dismissed, lastNotified };
}

const EMPTY: RemindersState = { dismissed: {}, notificationsEnabled: false, lastNotified: {} };

export function RemindersProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const state = useHousehold();
  const { bills, isSample: billsSample } = useBills();
  const { schedules, isSample: paydaysSample } = usePaydays();
  const { settlements } = useSettlements();
  const { accounts, transfers, isSample: accountsSample } = useAccounts();
  const [saved, setSaved] = useState<RemindersState>(() => prune((persist && readStored(STORAGE_KEYS.reminders, readState)) || EMPTY, new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permission, setPermission] = useState<PermissionState>(() => notificationPermission());
  // In a packaged build the permission check is async (plugin chunk + bridge
  // roundtrip), so the snapshot above is taken before the answer lands and
  // nothing else re-read it - a granted permission looked 'default' after
  // every relaunch until the setting was toggled off and on (QA7 R-2).
  useEffect(() => {
    let cancelled = false;
    void refreshNotificationPermission().then((p) => {
      if (!cancelled) setPermission(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Re-evaluate time-based rules (after 18:00, a new day) without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const update = useCallback(
    (fn: (prev: RemindersState) => RemindersState) =>
      setSaved((prev) => {
        const next = fn(prev);
        if (persist) writeStored(STORAGE_KEYS.reminders, next);
        return next;
      }),
    [persist],
  );

  // Per-store sample flags: rules read only from stores whose rows belong to
  // this household, so the sample Visa can never ring a real household's bell
  // (QA7 R-1); under a sample household the bell shows the full demo.
  const all = useMemo(
    () => selectReminders({ state, bills, schedules, settlements, accounts, transfers, samples: { household: state.isSample, bills: billsSample, paydays: paydaysSample, accounts: accountsSample } }, now),
    [state, bills, schedules, settlements, accounts, transfers, billsSample, paydaysSample, accountsSample, now],
  );
  const dismissedIds = useMemo(() => new Set(Object.keys(saved.dismissed)), [saved.dismissed]);
  const reminders = useMemo(() => all.filter((r) => !dismissedIds.has(r.id)), [all, dismissedIds]);

  const dismiss = useCallback((id: string) => update((prev) => ({ ...prev, dismissed: { ...prev.dismissed, [id]: new Date().toISOString() } })), [update]);
  const dismissAll = useCallback(() => {
    const at = new Date().toISOString();
    update((prev) => ({ ...prev, dismissed: { ...prev.dismissed, ...Object.fromEntries(reminders.map((r) => [r.id, at])) } }));
  }, [update, reminders]);
  const restore = useCallback(
    (id: string) =>
      update((prev) => {
        const dismissed = { ...prev.dismissed };
        delete dismissed[id];
        return { ...prev, dismissed };
      }),
    [update],
  );

  const setNotificationsEnabled = useCallback(
    async (on: boolean) => {
      if (!on) {
        update((prev) => ({ ...prev, notificationsEnabled: false }));
        return false;
      }
      const result = await requestNotificationPermission();
      setPermission(result);
      const granted = result === 'granted';
      // Quiet enable (device QA DEV-2): stamp everything already due as
      // notified-today in the SAME commit that turns notifications on, so the
      // notify effect never sees the backlog - the first enable posted one OS
      // notification per open reminder, five at once on a lived-in household.
      update((prev) => ({ ...prev, notificationsEnabled: granted, lastNotified: granted ? seedNotifiedToday(reminders, prev.lastNotified, todayIso(now)) : prev.lastNotified }));
      return granted;
    },
    [update, reminders, now],
  );

  // Native notifications: once per day per reminder, only for the rules worth
  // interrupting for - and never from a sample household, whose data
  // permanently contains an overdue bill, a pending approval and a carrying
  // credit card (QA UX-4). Real households are safe from sample rows too:
  // selectReminders drops sample-store rules before they get here (QA7 R-1).
  // Each post is stamped as it lands and the loop is never cancelled: this
  // effect re-runs on every household commit and minute tick, and a stamp
  // held back until the end (behind a cancel flag) was dropped exactly when
  // the phone had already buzzed, so the re-run buzzed again (audit OB-7).
  const inFlightRef = useRef(new Set<string>());
  const stampNotified = useCallback((id: string, day: string) => update((prev) => ({ ...prev, lastNotified: { ...prev.lastNotified, [id]: day } })), [update]);
  useEffect(() => {
    if (!saved.notificationsEnabled || permission !== 'granted' || state.isSample) return;
    const today = todayIso(now);
    const due = reminders.filter((r) => NOTIFY_RULES.has(r.rule) && saved.lastNotified[r.id] !== today);
    if (due.length === 0) return;
    void postDueNotifications(due, today, inFlightRef.current, stampNotified);
  }, [reminders, saved.notificationsEnabled, saved.lastNotified, permission, now, stampNotified, state.isSample]);

  const value = useMemo<RemindersStore>(
    () => ({
      reminders,
      all,
      dismissedIds,
      count: reminders.length,
      top: reminders[0] ?? null,
      dismiss,
      dismissAll,
      restore,
      dialogOpen,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
      notificationsEnabled: saved.notificationsEnabled,
      notificationPermission: permission,
      setNotificationsEnabled,
    }),
    [reminders, all, dismissedIds, dismiss, dismissAll, restore, dialogOpen, saved.notificationsEnabled, permission, setNotificationsEnabled],
  );

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders(): RemindersStore {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useReminders must be used inside <RemindersProvider>');
  return ctx;
}
