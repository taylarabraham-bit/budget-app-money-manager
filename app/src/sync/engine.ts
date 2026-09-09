import type { CollectionKey, Row, SyncRecord } from './types';

// The pure half of sync: no React, no network, no storage. Everything here is
// a plain function over plain data so it can be tested on its own.
//
// Model: each store's rows are compared against a *baseline* (the rows the
// server is known to have) by object identity per id. A row whose object
// changed is an edit; an id that vanished is a delete. Edits and deletes go
// into an outbox keyed by collection+id, so repeated edits of one row collapse
// into the latest. Pulled records are merged per row, newest `updatedAt`
// wins, with the outbox acting as "local edits the server has not seen yet".

/** Rows indexed by id - the shape baselines and merges work on. */
export type RowMap = Map<string, Row>;

export const toMap = (rows: readonly Row[]): RowMap => new Map(rows.map((r) => [r.id, r]));

export interface Diff {
  upserts: Row[];
  deletes: string[];
}

/** What changed between the last known rows and the current ones (identity first, content as the tiebreak, per id). */
export function diffRows(baseline: RowMap, next: readonly Row[]): Diff {
  const upserts: Row[] = [];
  const seen = new Set<string>();
  for (const row of next) {
    seen.add(row.id);
    const base = baseline.get(row.id);
    // Identity is the fast path. A row whose object was rebuilt without an actual
    // edit (cross-tab storage adoption, a re-hydration) must NOT count as one:
    // pushing it re-stamps the household wholesale, and those stale-content rows
    // with fresh stamps beat the partner's genuinely newer edits (QA SY-4).
    if (base !== row && !(base && sameData(base, row))) upserts.push(row);
  }
  const deletes: string[] = [];
  for (const id of baseline.keys()) if (!seen.has(id)) deletes.push(id);
  return { upserts, deletes };
}

export const outboxKey = (collection: CollectionKey, id: string) => `${collection}:${id}`;

/** Pending local changes, latest per row. Persisted so nothing is lost while offline. */
export type Outbox = Map<string, SyncRecord>;

export function enqueue(outbox: Outbox, householdId: string, deviceId: string, collection: CollectionKey, diff: Diff, now: string): number {
  let count = 0;
  for (const row of diff.upserts) {
    outbox.set(outboxKey(collection, row.id), { householdId, collection, id: row.id, data: row, updatedAt: now, deleted: false, deviceId });
    count += 1;
  }
  for (const id of diff.deletes) {
    outbox.set(outboxKey(collection, id), { householdId, collection, id, data: null, updatedAt: now, deleted: true, deviceId });
    count += 1;
  }
  return count;
}

export interface MergeResult {
  rows: Row[];
  /** True when the merge produced rows different from the local ones. */
  changed: boolean;
}

/**
 * Fold pulled records of one collection into the local rows. A remote record
 * replaces (or removes) the local row unless the outbox holds a newer local
 * edit of the same row - that edit will be pushed and win on the server too.
 */
export function mergeRemote(local: readonly Row[], remote: readonly SyncRecord[], outbox: Outbox, collection: CollectionKey): MergeResult {
  if (remote.length === 0) return { rows: [...local], changed: false };
  const map = toMap(local);
  const order = local.map((r) => r.id);
  let changed = false;
  for (const rec of remote) {
    const pending = outbox.get(outboxKey(collection, rec.id));
    if (pending && pending.updatedAt > rec.updatedAt) continue; // our unsent edit is newer
    if (pending) outbox.delete(outboxKey(collection, rec.id)); // server already has something newer
    if (rec.deleted || rec.data == null) {
      if (map.delete(rec.id)) changed = true;
      continue;
    }
    const current = map.get(rec.id);
    if (current && sameData(current, rec.data)) continue;
    if (!current) order.push(rec.id);
    map.set(rec.id, rec.data);
    changed = true;
  }
  return { rows: order.flatMap((id) => (map.has(id) ? [map.get(id)!] : [])), changed };
}

/**
 * Records minus those touching a row that changed locally since `snapshot` was
 * taken (an edit, add or delete that raced the pull). Those local changes are
 * not in the outbox yet - the watcher will enqueue them with a fresh stamp on
 * the next commit - so the server's copy must not clobber them in state; the
 * fresh stamp then wins the per-row LWW on the server too. Identity
 * comparison, the same rule diffRows uses.
 */
export function withoutRacedRows(records: readonly SyncRecord[], snapshot: RowMap, prev: readonly Row[]): SyncRecord[] {
  const prevMap = toMap(prev);
  return records.filter((rec) => snapshot.get(rec.id) === prevMap.get(rec.id));
}

/** Structural equality for rows (JSON-shaped data, key order ignored). */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameData(v, b[i]));
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Group pulled records by collection, oldest first within each. */
export function groupByCollection(records: readonly SyncRecord[]): Map<CollectionKey, SyncRecord[]> {
  const groups = new Map<CollectionKey, SyncRecord[]>();
  for (const rec of records) {
    const list = groups.get(rec.collection) ?? [];
    list.push(rec);
    groups.set(rec.collection, list);
  }
  return groups;
}

/** Records to push for every row of every collection - the first upload of a device's data. One record per (collection, id): a duplicated id would make the server's upsert reject the whole batch (audit SEC-4); the later row wins. */
export function recordsForAll(householdId: string, deviceId: string, collections: ReadonlyMap<CollectionKey, readonly Row[]>, now: string): SyncRecord[] {
  const out = new Map<string, SyncRecord>();
  for (const [collection, rows] of collections) for (const row of rows) out.set(outboxKey(collection, row.id), { householdId, collection, id: row.id, data: row, updatedAt: now, deleted: false, deviceId });
  return [...out.values()];
}

/** Highest `syncedAt` among records - the cursor for the next incremental pull. String order is time order only because one server emits one fixed stamp format (see SyncRecord.syncedAt). */
export function cursorOf(records: readonly SyncRecord[], previous?: string): string | undefined {
  let max = previous;
  for (const r of records) if (r.syncedAt && (!max || r.syncedAt > max)) max = r.syncedAt;
  return max;
}
