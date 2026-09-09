import { STORAGE_KEYS, isRecord, isString, readStored, writeStored } from '../data/persist';
import { newId } from '../lib/ids';
import type { SyncConfig, SyncRecord } from './types';
import { COLLECTIONS } from './types';

// Device-level sync state: the server config, which household this device
// is bound to, the pull cursor and the outbox of unsent changes. It is not
// household data, so "Reset to sample data" leaves it alone; the provider
// notices the data is sample again and re-adopts the server's household.

export const SYNC_STORAGE_KEY = STORAGE_KEYS.sync;

export interface SyncState {
  version: 1;
  deviceId: string;
  config?: SyncConfig;
  /** The household this device mirrors; unset until the first connection is resolved. */
  householdId?: string;
  /** Server time of the newest record pulled (see SyncTransport.pull). */
  cursor?: string;
  outbox: SyncRecord[];
  lastSyncedAt?: string;
  /** The user disconnected on purpose: do not re-apply a build's default server details. */
  disconnected?: boolean;
  /** This device adopted the household on its own (outside the join wizard) and nobody has said which member it is yet - everything would log as members[0] (audit OB-1). */
  needsIdentity?: boolean;
  /** The server URL the binding and cursor belong to: a different server means a fresh decision and a fresh cursor (audit SY-5). */
  serverUrl?: string;
  /** SCHEMA_TAG of the build that advanced the cursor; a different build re-pulls from the start (audit SYN-3). */
  schema?: string;
  /** Outbox records the server rejected outright (not a network failure): parked here so the rest keeps flowing (audit SEC-4). */
  rejected?: RejectedRecord[];
}

export interface RejectedRecord {
  record: SyncRecord;
  error: string;
}

const isSyncRecord = (x: unknown): x is SyncRecord =>
  isRecord(x) &&
  isString(x.householdId) &&
  (COLLECTIONS as readonly string[]).includes(String(x.collection)) &&
  isString(x.id) &&
  isString(x.updatedAt) &&
  typeof x.deleted === 'boolean' &&
  isString(x.deviceId);

function parse(x: unknown): SyncState | null {
  if (!isRecord(x) || x.version !== 1 || !isString(x.deviceId)) return null;
  const config = isRecord(x.config) && isString(x.config.url) && isString(x.config.anonKey) ? { url: x.config.url, anonKey: x.config.anonKey } : undefined;
  return {
    version: 1,
    deviceId: x.deviceId,
    config,
    householdId: isString(x.householdId) ? x.householdId : undefined,
    cursor: isString(x.cursor) ? x.cursor : undefined,
    outbox: Array.isArray(x.outbox) ? x.outbox.filter(isSyncRecord) : [],
    lastSyncedAt: isString(x.lastSyncedAt) ? x.lastSyncedAt : undefined,
    disconnected: x.disconnected === true || undefined,
    needsIdentity: x.needsIdentity === true || undefined,
    serverUrl: isString(x.serverUrl) ? x.serverUrl : undefined,
    schema: isString(x.schema) ? x.schema : undefined,
    rejected: Array.isArray(x.rejected) ? x.rejected.filter((r): r is RejectedRecord => isRecord(r) && isSyncRecord(r.record) && isString(r.error)) : undefined,
  };
}

export function loadSyncState(): SyncState {
  return readStored(SYNC_STORAGE_KEY, parse) ?? { version: 1, deviceId: newId('dev'), outbox: [] };
}

export function saveSyncState(state: SyncState): boolean {
  return writeStored(SYNC_STORAGE_KEY, state);
}
