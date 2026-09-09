// Durable storage for packaged builds. Inside a native WebView (Capacitor),
// localStorage and IndexedDB are "WebView data" the OS may clear under storage
// pressure - budget data must survive that. Two layers, both inert in a plain
// browser tab:
//
//  1. requestPersistentStorage() asks the platform to exempt this origin from
//     eviction (navigator.storage.persist - honoured by Chrome and the Android
//     WebView, harmless where unsupported).
//  2. A native mirror: after any budget-app.* write, the whole prefix is
//     snapshotted (debounced) into Capacitor Preferences - app-private storage
//     the OS never clears with WebView data. On boot, when localStorage came up
//     with NO household but the mirror has one, the mirror is restored before
//     React reads anything (see main.tsx).
//
// A DELIBERATE wipe (any budget-app.* key removed - "Reset to sample data",
// "Restore the sample household") refreshes the mirror immediately, so a later
// boot can never resurrect what the user chose to delete. Receipts live in
// Capacitor Filesystem in packaged builds (data/receipts.ts), never here.
//
// The mirror lives in ONE Preferences entry, written atomically. Its size is the
// sum of the localStorage blobs (tens to hundreds of KB in normal use); if it
// ever outgrows SharedPreferences comfort (~1 MB), move it to Filesystem.

const PREFIX = 'budget-app.';
// Mirrors STORAGE_KEYS.household - a literal, because persist.ts calls into this
// module (an import back would be a cycle). Pinned equal in durable.test.ts.
export const HOUSEHOLD_KEY = 'budget-app.household.v1';
const MIRROR_KEY = 'budget-app.mirror.v1';
const MIRROR_DEBOUNCE_MS = 1500;

/** The slice of Storage the pure helpers need (localStorage or a test fake). */
export interface EntryStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MirrorBlob {
  version: 1;
  savedAt: string;
  entries: Record<string, string>;
}

/** Every budget-app.* entry worth mirroring (never the mirror itself, never `.corrupt` quarantines). */
export function collectEntries(storage: EntryStore): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(PREFIX) || key === MIRROR_KEY || key.endsWith('.corrupt')) continue;
    const value = storage.getItem(key);
    if (value != null) out[key] = value;
  }
  return out;
}

export function parseMirror(raw: string | null | undefined): MirrorBlob | null {
  if (!raw) return null;
  try {
    const x: unknown = JSON.parse(raw);
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const blob = x as Record<string, unknown>;
    if (blob.version !== 1 || typeof blob.savedAt !== 'string' || !blob.entries || typeof blob.entries !== 'object' || Array.isArray(blob.entries)) return null;
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(blob.entries as Record<string, unknown>)) {
      if (typeof v === 'string' && k.startsWith(PREFIX)) entries[k] = v;
    }
    return { version: 1, savedAt: blob.savedAt, entries };
  } catch {
    return null;
  }
}

export function applyEntries(storage: EntryStore, entries: Record<string, string>): void {
  for (const [key, value] of Object.entries(entries)) storage.setItem(key, value);
}

/**
 * A live entry the mirror may take: parseable JSON, and for the household blob
 * the right version too. A truncated or garbled write is still a present,
 * non-null value - the boot restore used to treat it as live data and the next
 * mirror refresh copied it over the only good copy on the device (audit SYN-6).
 */
export function isUsableEntry(key: string, value: string): boolean {
  try {
    const x: unknown = JSON.parse(value);
    if (key === HOUSEHOLD_KEY) return !!x && typeof x === 'object' && !Array.isArray(x) && (x as { version?: unknown }).version === 1;
    return true;
  } catch {
    return false;
  }
}

/** What the next snapshot holds: every live entry that parses, else the previous mirror's copy of it (a corrupt value never replaces a good one). */
export function mirrorEntries(storage: EntryStore, previous: Record<string, string> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(collectEntries(storage))) {
    if (isUsableEntry(key, value)) out[key] = value;
    else if (previous && previous[key] !== undefined) out[key] = previous[key];
  }
  return out;
}

export type RestoreOutcome = 'restored' | 'live-data' | 'no-mirror' | 'not-native';

/**
 * The boot-time decision, pure. Empty storage takes the whole mirror. Storage
 * that holds data keeps it - except a household blob that cannot be read, which
 * is replaced by the mirror's copy when that one can (audit SYN-6); the
 * unreadable value is set aside under `.corrupt` by the store's own read.
 */
export function planRestore(storage: EntryStore, mirror: MirrorBlob | null): { outcome: RestoreOutcome; entries: Record<string, string> } {
  const live = collectEntries(storage);
  const household = live[HOUSEHOLD_KEY];
  if (Object.keys(live).length === 0) {
    if (!mirror || Object.keys(mirror.entries).length === 0) return { outcome: 'no-mirror', entries: {} };
    return { outcome: 'restored', entries: mirror.entries };
  }
  const mirrored = mirror?.entries[HOUSEHOLD_KEY];
  if (household !== undefined && !isUsableEntry(HOUSEHOLD_KEY, household) && mirrored !== undefined && isUsableEntry(HOUSEHOLD_KEY, mirrored)) {
    return { outcome: 'restored', entries: { [HOUSEHOLD_KEY]: mirrored } };
  }
  return { outcome: 'live-data', entries: {} };
}

// ---- native glue (exercised only inside a Capacitor shell) ----

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };

/** True inside a packaged (Capacitor) build; false in every browser tab. */
export function isNativeShell(): boolean {
  try {
    return !!(globalThis as CapacitorGlobal).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

// Resolve with the MODULE, never the plugin object: Capacitor plugins are
// proxies that intercept every property access - including the `.then` the
// promise machinery probes on resolution, which becomes a phantom
// "Preferences.then()" plugin call and throws.
let preferencesPromise: Promise<typeof import('@capacitor/preferences')> | null = null;
const preferences = () => (preferencesPromise ??= import('@capacitor/preferences'));

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let mirrorDeadline = Infinity;

async function refreshMirror(): Promise<void> {
  try {
    const { Preferences } = await preferences();
    // The previous snapshot backs any live entry that no longer parses (audit SYN-6).
    const previous = parseMirror((await Preferences.get({ key: MIRROR_KEY })).value)?.entries ?? null;
    const blob: MirrorBlob = { version: 1, savedAt: new Date().toISOString(), entries: mirrorEntries(globalThis.localStorage, previous) };
    await Preferences.set({ key: MIRROR_KEY, value: JSON.stringify(blob) });
  } catch {
    // Best effort: the live localStorage copy is still on disk.
  }
}

/** persist.ts calls this after every write/remove. Debounced; a REMOVAL flushes immediately (deliberate wipe). */
export function noteDurableChange(key: string): void {
  if (!isNativeShell() || !key.startsWith(PREFIX) || key === MIRROR_KEY) return;
  let delay = MIRROR_DEBOUNCE_MS;
  try {
    // Any key gone is a deliberate wipe - not only the household's: a mixed
    // device (real bills under a still-sample household) resets by removing
    // the bills key alone, and that must not linger in the mirror either
    // (audit OB-2).
    if (globalThis.localStorage.getItem(key) == null) delay = 0;
  } catch {
    // storage unreadable: keep the debounce
  }
  // An armed flush is never pushed LATER: the reset flow removes the household
  // (immediate flush) and then six more keys, whose debounces used to supersede
  // it - killing the app inside that ~1.5s window resurrected everything the
  // user chose to delete (QA7 R-3). refreshMirror snapshots storage at fire
  // time, so firing at the EARLIEST deadline still captures the whole batch.
  const deadline = Date.now() + delay;
  if (mirrorTimer && deadline >= mirrorDeadline) return;
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorDeadline = deadline;
  mirrorTimer = setTimeout(() => {
    mirrorTimer = null;
    mirrorDeadline = Infinity;
    void refreshMirror();
  }, delay);
}

/** True when the storage holds ANY mirrored budget-app.* entry - the test for "did the WebView come up empty". */
export function hasBudgetEntries(storage: EntryStore): boolean {
  return Object.keys(collectEntries(storage)).length > 0;
}

/**
 * Boot-time restore, BEFORE React reads storage: when the WebView came up with
 * NO budget data but the mirror holds some, put every mirrored entry back. Live
 * data wins - any present key means nothing was evicted (an eviction takes the
 * whole WebView directory, never one key). Gating this on the household key
 * alone lost a mixed device's real bills, outbox and device id after an
 * eviction, since a still-sample household never writes that key (audit OB-2).
 * The one exception is a household blob that is present but unreadable: the
 * mirror's readable copy replaces it (audit SYN-6, see planRestore).
 */
export async function restoreDurableMirror(): Promise<RestoreOutcome> {
  if (!isNativeShell()) return 'not-native';
  try {
    const live = globalThis.localStorage;
    const household = live.getItem(HOUSEHOLD_KEY);
    const householdUnreadable = household != null && !isUsableEntry(HOUSEHOLD_KEY, household);
    if (hasBudgetEntries(live) && !householdUnreadable) return 'live-data';
    const raw = (await (await preferences()).Preferences.get({ key: MIRROR_KEY })).value;
    const plan = planRestore(live, parseMirror(raw));
    applyEntries(live, plan.entries);
    return plan.outcome;
  } catch {
    return 'no-mirror';
  }
}

/** Ask the platform to exempt this origin from storage eviction. true/false = the platform's answer; null = unsupported. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    const manager = navigator.storage;
    if (!manager?.persist) return null;
    if (await manager.persisted?.()) return true;
    return await manager.persist();
  } catch {
    return null;
  }
}
