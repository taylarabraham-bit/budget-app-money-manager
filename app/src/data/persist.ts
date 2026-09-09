// Local persistence for the app's data. Everything is kept in localStorage
// under versioned keys so a shape change can bump the version and leave old
// data behind. This is the seam a Supabase adapter replaces later: the
// stores call read/write here and nothing else knows about storage.
// Packaged builds add a durable mirror behind this seam - see data/durable.ts.

import { noteDurableChange } from './durable';

export const STORAGE_KEYS = {
  /** The household's data: one blob, saved atomically. */
  household: 'budget-app.household.v1',
  /** Subscriptions & recurring bills (the bills feature's own store). */
  bills: 'budget-app.bills.v1',
  /** Settle-up payments between members (the settle feature's own store). */
  settlements: 'budget-app.settlements.v1',
  /** Paydays - income on a schedule (the paydays feature's own store). */
  paydays: 'budget-app.paydays.v1',
  /** Bank accounts & credit cards, and the transfers between them (the accounts feature's own store). */
  accounts: 'budget-app.accounts.v1',
  /** Quick-add favourites for the Log purchase dialog. */
  quickAdds: 'budget-app.quickadds.v1',
  /** Shared shopping list and wish list. */
  lists: 'budget-app.lists.v1',
  /** Reminder dismissals and the notification preference. */
  reminders: 'budget-app.reminders.v1',
  /** Device-level: which member is using this device. Not part of the data. */
  session: 'budget-app.session.v1',
  /** Device preferences (theme). Deliberately survives "Reset to sample data". */
  settings: 'budget-app.settings.v1',
  /** Whether the first-run welcome has been shown on this device. */
  welcome: 'budget-app.welcome.v1',
  /** A setup wizard in progress (steps typed so far), so a reload or discarded tab resumes instead of losing it. Cleared on Finish or Cancel. */
  onboardingDraft: 'budget-app.onboarding.v1',
  /** Device-level: sync server details, the pull cursor and unsent changes (app/src/sync). Survives a reset; the provider re-joins the server's household. */
  sync: 'budget-app.sync.v1',
} as const;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // Storage blocked (privacy mode, sandboxed iframe)
  }
}

/**
 * Parse and validate a stored value; `null` when absent, unparsable, or
 * failing the guard. A value that exists but cannot be used is kept under
 * `<key>.corrupt` so nothing is silently thrown away.
 */
export function readStored<T>(key: string, guard: (value: unknown) => T | null): T | null {
  const s = storage();
  const raw = s?.getItem(key);
  if (!raw) return null;
  try {
    const result = guard(JSON.parse(raw));
    if (result !== null) return result;
  } catch {
    // fall through: unparsable
  }
  try {
    s?.setItem(`${key}.corrupt`, raw);
  } catch {
    // best effort
  }
  return null;
}

/**
 * Fires when ANOTHER tab or window on this device writes `key` (same-tab writes
 * never fire storage events), so open tabs adopt each other's changes instead of
 * clobbering them wholesale on their next save.
 */
export function subscribeStored(key: string, onChange: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onChange();
  };
  globalThis.addEventListener?.('storage', handler);
  return () => globalThis.removeEventListener?.('storage', handler);
}

// A store adopted ANOTHER tab's blob (the storage event above). The sync layer
// must treat those rows as the new baseline, not as edits made here: diffing
// a stale sibling-tab blob against rows just pulled from the partner produced
// delete tombstones for the partner's new rows (audit SY-3 / SYN-4). Stores
// call this right before the setState that adopts, with the adopted rows keyed
// by sync collection name.
type AdoptionListener = (key: string, rows: Record<string, ReadonlyArray<{ id: string }>>) => void;
const adoptionListeners = new Set<AdoptionListener>();
export function onStorageAdoption(listener: AdoptionListener): () => void {
  adoptionListeners.add(listener);
  return () => {
    adoptionListeners.delete(listener);
  };
}
export function noteStorageAdoption(key: string, rows: Record<string, ReadonlyArray<{ id: string }>>): void {
  for (const listener of adoptionListeners) listener(key, rows);
}

// Every store writes through here; when ANY write fails (quota, private mode),
// listeners hear about it so one banner can warn for all of them - a bill that
// only lives in memory should not pretend to be saved.
const storageProblemListeners = new Set<() => void>();
export function onStorageProblem(listener: () => void): () => void {
  storageProblemListeners.add(listener);
  return () => {
    storageProblemListeners.delete(listener);
  };
}
function reportStorageProblem(): void {
  for (const listener of storageProblemListeners) listener();
}

/** Write a value; returns false when storage is unavailable or full (the in-memory state still works). */
export function writeStored(key: string, value: unknown): boolean {
  try {
    const s = storage();
    if (!s) {
      reportStorageProblem();
      return false;
    }
    s.setItem(key, JSON.stringify(value));
    // Packaged builds mirror every write into app-private storage (a no-op in a
    // browser tab). AFTER the synchronous setItem, so the layout-effect save
    // ordering the sync layer depends on (QA SY-6/SY-7) is untouched.
    noteDurableChange(key);
    return true;
  } catch {
    reportStorageProblem();
    return false;
  }
}

export function removeStored(key: string): void {
  try {
    storage()?.removeItem(key);
    // Removals reach the mirror too - a deliberate wipe must never resurrect.
    noteDurableChange(key);
  } catch {
    // nothing to clear
  }
}

/** True when a value under `key` could not be read and was set aside as `<key>.corrupt`. */
export function hasCorruptCopy(key: string): boolean {
  try {
    return storage()?.getItem(`${key}.corrupt`) != null;
  } catch {
    return false;
  }
}

/** Forget the quarantined `<key>.corrupt` copy once the user has recovered (or dismissed the warning). */
export function clearCorruptCopy(key: string): void {
  try {
    storage()?.removeItem(`${key}.corrupt`);
  } catch {
    // Nothing to do - the warning simply reappears next session.
  }
}

// ---- shape guards shared by the stores ----

export const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export const isString = (x: unknown): x is string => typeof x === 'string';
export const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** One id rule for every record, foreign ids included (a backup, a sync pull): what newId emits and nothing that could
 * traverse a path or break the hand-built pagination filter (audit SEC-5). Mock ids (m_priya, hh_1) pass too. */
export const ID_RULE = /^[A-Za-z0-9_-]{1,64}$/;
export const isId = (x: unknown): x is string => typeof x === 'string' && ID_RULE.test(x);

/** Keep the rows that pass the guard (a single bad row never loses the rest). */
export function validRows<T>(x: unknown, guard: (v: unknown) => v is T): T[] {
  return Array.isArray(x) ? x.filter(guard) : [];
}

/** Rows with a unique id: a duplicated id in a saved blob would make the server's upsert reject the whole batch (audit SEC-4). First one wins. */
export function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/**
 * Text as the store may keep it: Postgres rejects a NUL byte or a lone surrogate
 * in any text field, and one such note would stop the whole outbox (audit SEC-4).
 * A grapheme clip elsewhere can split an emoji into a lone surrogate, so both go.
 */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
