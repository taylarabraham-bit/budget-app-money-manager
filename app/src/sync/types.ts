// Sync contracts. The app stays offline-first: every store keeps its rows on
// the device, and the sync engine mirrors them to one generic `records` table
// on the household's Supabase (see supabase/migrations). Each row is one
// record; the newest edit wins per row; deletes are tombstones.

/** Every synced collection, one per store array (plus the household singleton). The accounts store contributes two, like the household blob contributes six. */
export const COLLECTIONS = ['household', 'members', 'categories', 'transactions', 'goals', 'goalContributions', 'bills', 'settlements', 'paydays', 'lists', 'quickAdds', 'accounts', 'accountTransfers'] as const;
export type CollectionKey = (typeof COLLECTIONS)[number];

/**
 * Bump whenever a row guard or the collection list changes. The pull cursor is
 * reset when a build's tag differs from the persisted one, so records an
 * older build dropped at the door (a shape it could not parse, a collection it
 * did not know) are pulled again instead of being skipped forever (audit SYN-3).
 */
export const GUARD_VERSION = 2;
export const SCHEMA_TAG = `${COLLECTIONS.join(',')}#${GUARD_VERSION}`;

/** Any synced row: must have a stable string id. */
export interface Row {
  id: string;
}

/** One record as it travels to and from the server. */
export interface SyncRecord {
  householdId: string;
  collection: CollectionKey;
  id: string;
  /** The row itself; null for a tombstone. */
  data: Row | null;
  /** When it was last edited (ISO, the editing device's clock). Newest wins. */
  updatedAt: string;
  deleted: boolean;
  deviceId: string;
  /**
   * Server clock when the server last stored it; drives incremental pulls. Absent
   * on outgoing records. Compared as STRINGS (cursorOf, mergeRemote's stamps):
   * that is only correct because one server emits one fixed format - Supabase
   * always `+00:00` with a trimmed fraction, the memory server ISO `Z` - never mix
   * formats in one field (audit SYN-10).
   */
  syncedAt?: string;
}

export interface ServerHousehold {
  id: string;
  name: string;
  /** Server time of the most recent change. */
  syncedAt: string;
}

export interface PullResult {
  records: SyncRecord[];
  /** Highest `syncedAt` in the result (the next pull's cursor); undefined when empty. */
  cursor?: string;
}

/** What a backend must provide. Supabase is the real one; memory is for tests. */
export interface SyncTransport {
  /** Cheap reachability check; rejects when the server cannot be reached. */
  ping(): Promise<void>;
  /** Households that exist on the server, for the first connection. */
  listHouseholds(): Promise<ServerHousehold[]>;
  /** Records of a household stored after `cursor` (all of them when undefined), oldest first. */
  pull(householdId: string, cursor?: string): Promise<PullResult>;
  /** Store records (newest edit wins per row). Resolves to the rows as the server now has them. */
  push(records: SyncRecord[]): Promise<SyncRecord[]>;
  /** Live change notifications; resolves to an unsubscribe. Optional - polling covers the rest. */
  subscribe?(householdId: string, onChange: () => void): () => void;
  /**
   * Remove every record of a household EXCEPT its household row - used when the
   * user chose "use this device's data" over the one on the server, which the UI
   * promises replaces it. The household row is left for the tombstone the caller
   * pushes first, so a device still bound to that household finds it and unbinds
   * instead of syncing into a void (audit SY-11). Optional and best-effort.
   */
  deleteHousehold?(householdId: string): Promise<void>;
  /** The server's clock, ISO. Optional: undefined when the server cannot say (an older schema). Used to correct this device's stamps (audit SEC-2). */
  serverTime?(): Promise<string | undefined>;
}

export interface SyncConfig {
  /** Supabase URL, e.g. https://laptop.tail1234.ts.net (tailscale serve). Packaged builds run from an https origin, so a plain http:// server is blocked as mixed content there. */
  url: string;
  /** The project's anon key. Fine to hold on the device: the Tailscale network is what keeps strangers out. */
  anonKey: string;
}

export type SyncStatus =
  /** Not configured. */
  | 'off'
  | 'connecting'
  /** Configured and reachable; idle. */
  | 'online'
  | 'syncing'
  /** Configured but the server cannot be reached; changes queue up. */
  | 'offline'
  /** Both this device and the server hold different households - the user must choose. */
  | 'needs-choice'
  | 'error';

/** A usable server URL: http(s) Supabase, or the built-in `memory://name` test server (see transport-memory.ts). */
export const isServerUrl = (url: string): boolean => /^(https?|memory):\/\/\S+/i.test(url.trim());
