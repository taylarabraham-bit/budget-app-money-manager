import { describe, expect, it } from 'vitest';
import { cursorOf, diffRows, enqueue, groupByCollection, mergeRemote, outboxKey, recordsForAll, sameData, toMap, withoutRacedRows, type Outbox } from './engine';
import type { CollectionKey, Row, SyncRecord } from './types';

// The pure half of sync, and the part with the worst failure mode: every bug
// closed here was silent - the UI said "online · 0 pending" while an edit was
// gone from state, the outbox and the server at once.
//
//  - QA SY-4: a row rebuilt without a real edit (cross-tab adoption, a
//    re-hydration) must NOT count as an edit. Pushing it re-stamps the
//    household, and those stale rows with fresh timestamps beat the partner's
//    genuinely newer edits under last-write-wins.
//  - QA M12: an edit dispatched in the same event-loop turn as a pull must
//    survive the pull applying.

const row = (id: string, over: Record<string, unknown> = {}): Row => ({ id, name: id, ...over }) as Row;

const record = (id: string, over: Partial<SyncRecord> = {}): SyncRecord => ({
  householdId: 'hh_1',
  collection: 'transactions',
  id,
  data: row(id),
  updatedAt: '2026-08-20T10:00:00.000Z',
  deleted: false,
  deviceId: 'dev_b',
  ...over,
});

describe('sameData', () => {
  it('ignores key order and undefined-valued keys', () => {
    expect(sameData({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('compares nested objects and arrays by value', () => {
    expect(sameData({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameData({ a: [1] }, { a: [1, 2] })).toBe(false);
  });

  it('does not confuse an array with an object', () => {
    expect(sameData([], {})).toBe(false);
  });

  it('separates null from an object and compares scalars strictly', () => {
    expect(sameData(null, {})).toBe(false);
    expect(sameData(null, null)).toBe(true);
    expect(sameData(1, '1')).toBe(false);
  });
});

describe('diffRows', () => {
  it('reports a new row as an upsert', () => {
    const { upserts, deletes } = diffRows(toMap([]), [row('a')]);
    expect(upserts.map((r) => r.id)).toEqual(['a']);
    expect(deletes).toEqual([]);
  });

  it('reports a vanished id as a delete', () => {
    const { upserts, deletes } = diffRows(toMap([row('a'), row('b')]), [row('a')]);
    // `row('a')` builds a fresh object each call, so 'a' is a content match, not an edit.
    expect(upserts).toEqual([]);
    expect(deletes).toEqual(['b']);
  });

  it('reports a genuinely edited row', () => {
    const before = row('a', { amount: 10 });
    const { upserts } = diffRows(toMap([before]), [row('a', { amount: 20 })]);
    expect(upserts.map((r) => r.id)).toEqual(['a']);
  });

  it('takes the identity fast path when the object is untouched', () => {
    const a = row('a');
    expect(diffRows(toMap([a]), [a]).upserts).toEqual([]);
  });

  it('does not treat a rebuilt-but-identical row as an edit - QA SY-4', () => {
    // What a cross-tab storage adoption or a re-hydration produces: same data,
    // brand new objects. Pushing these re-stamps the whole household.
    const baseline = toMap([row('a'), row('b'), row('c')]);
    const rebuilt = [row('a'), row('b'), row('c')];
    expect(diffRows(baseline, rebuilt)).toEqual({ upserts: [], deletes: [] });
  });

  it('picks out the one real edit among rebuilt rows', () => {
    const baseline = toMap([row('a'), row('b')]);
    const { upserts } = diffRows(baseline, [row('a'), row('b', { name: 'changed' })]);
    expect(upserts.map((r) => r.id)).toEqual(['b']);
  });
});

describe('enqueue', () => {
  it('records upserts and deletes, and collapses repeated edits of one row', () => {
    const outbox: Outbox = new Map();
    enqueue(outbox, 'hh_1', 'dev_a', 'transactions', { upserts: [row('a', { v: 1 })], deletes: [] }, '2026-08-20T10:00:00.000Z');
    const count = enqueue(outbox, 'hh_1', 'dev_a', 'transactions', { upserts: [row('a', { v: 2 })], deletes: ['b'] }, '2026-08-20T10:05:00.000Z');
    expect(count).toBe(2);
    expect(outbox.size).toBe(2);
    const pending = outbox.get(outboxKey('transactions', 'a'))!;
    expect(pending.data).toMatchObject({ v: 2 });
    expect(pending.updatedAt).toBe('2026-08-20T10:05:00.000Z');
    expect(outbox.get(outboxKey('transactions', 'b'))).toMatchObject({ deleted: true, data: null });
  });

  it('keys the outbox by collection as well as id, so two collections can hold the same id', () => {
    const outbox: Outbox = new Map();
    enqueue(outbox, 'hh_1', 'dev_a', 'transactions', { upserts: [row('x')], deletes: [] }, 'now');
    enqueue(outbox, 'hh_1', 'dev_a', 'bills', { upserts: [row('x')], deletes: [] }, 'now');
    expect(outbox.size).toBe(2);
  });
});

describe('mergeRemote', () => {
  const empty: Outbox = new Map();

  it('is a no-op for an empty pull', () => {
    const local = [row('a')];
    const result = mergeRemote(local, [], empty, 'transactions');
    expect(result.changed).toBe(false);
    expect(result.rows).toEqual(local);
  });

  it('adds a row the partner created', () => {
    const result = mergeRemote([row('a')], [record('b')], new Map(), 'transactions');
    expect(result.changed).toBe(true);
    expect(result.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('applies a tombstone', () => {
    const result = mergeRemote([row('a'), row('b')], [record('b', { deleted: true, data: null })], new Map(), 'transactions');
    expect(result.rows.map((r) => r.id)).toEqual(['a']);
    expect(result.changed).toBe(true);
  });

  it('reports no change when the remote row matches what is already local', () => {
    const result = mergeRemote([row('a')], [record('a', { data: row('a') })], new Map(), 'transactions');
    expect(result.changed).toBe(false);
  });

  it('keeps a newer unsent local edit and leaves it queued', () => {
    const outbox: Outbox = new Map();
    enqueue(outbox, 'hh_1', 'dev_a', 'transactions', { upserts: [row('a', { amount: 99 })], deletes: [] }, '2026-08-20T11:00:00.000Z');
    const result = mergeRemote([row('a', { amount: 99 })], [record('a', { data: row('a', { amount: 5 }), updatedAt: '2026-08-20T10:00:00.000Z' })], outbox, 'transactions');
    expect(result.rows[0]).toMatchObject({ amount: 99 });
    expect(result.changed).toBe(false);
    expect(outbox.has(outboxKey('transactions', 'a'))).toBe(true);
  });

  it('drops a stale queued edit the server has already superseded', () => {
    const outbox: Outbox = new Map();
    enqueue(outbox, 'hh_1', 'dev_a', 'transactions', { upserts: [row('a', { amount: 5 })], deletes: [] }, '2026-08-20T09:00:00.000Z');
    const result = mergeRemote([row('a', { amount: 5 })], [record('a', { data: row('a', { amount: 99 }), updatedAt: '2026-08-20T10:00:00.000Z' })], outbox, 'transactions');
    expect(result.rows[0]).toMatchObject({ amount: 99 });
    expect(outbox.has(outboxKey('transactions', 'a'))).toBe(false);
  });

  it('preserves local order and appends new rows at the end', () => {
    const result = mergeRemote([row('a'), row('b')], [record('c'), record('a', { data: row('a', { v: 2 }) })], new Map(), 'transactions');
    expect(result.rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('only consults the outbox entry for its own collection', () => {
    const outbox: Outbox = new Map();
    enqueue(outbox, 'hh_1', 'dev_a', 'bills', { upserts: [row('a', { amount: 99 })], deletes: [] }, '2026-08-20T11:00:00.000Z');
    const result = mergeRemote([row('a')], [record('a', { data: row('a', { amount: 5 }) })], outbox, 'transactions');
    expect(result.rows[0]).toMatchObject({ amount: 5 });
  });
});

describe('withoutRacedRows', () => {
  it('lets a record through when the row did not move under it', () => {
    const a = row('a');
    const snapshot = toMap([a]);
    expect(withoutRacedRows([record('a')], snapshot, [a])).toHaveLength(1);
  });

  it('holds back a record whose row was edited during the pull - QA M12', () => {
    const snapshot = toMap([row('a', { amount: 1 })]);
    const edited = [row('a', { amount: 2 })];
    expect(withoutRacedRows([record('a')], snapshot, edited)).toEqual([]);
  });

  it('holds back a record for a row deleted during the pull', () => {
    const a = row('a');
    expect(withoutRacedRows([record('a')], toMap([a]), [])).toEqual([]);
  });

  it('holds back a record for a row added during the pull', () => {
    expect(withoutRacedRows([record('a')], toMap([]), [row('a')])).toEqual([]);
  });

  it('filters only the raced rows, not the whole pull', () => {
    const a = row('a');
    const b = row('b', { amount: 1 });
    const kept = withoutRacedRows([record('a'), record('b')], toMap([a, b]), [a, row('b', { amount: 2 })]);
    expect(kept.map((r) => r.id)).toEqual(['a']);
  });
});

describe('groupByCollection', () => {
  it('groups records and keeps their order within each collection', () => {
    const groups = groupByCollection([record('a'), record('x', { collection: 'bills' }), record('b'), record('y', { collection: 'bills' })]);
    expect([...groups.keys()]).toEqual(['transactions', 'bills']);
    expect(groups.get('transactions')!.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups.get('bills')!.map((r) => r.id)).toEqual(['x', 'y']);
  });
});

describe('recordsForAll', () => {
  it('stamps every row of every collection with the same time and device', () => {
    const collections = new Map<CollectionKey, readonly Row[]>([
      ['members', [row('m1'), row('m2')]],
      ['bills', [row('b1')]],
    ]);
    const out = recordsForAll('hh_1', 'dev_a', collections, '2026-08-20T10:00:00.000Z');
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.updatedAt === '2026-08-20T10:00:00.000Z' && r.deviceId === 'dev_a' && !r.deleted)).toBe(true);
    expect(out.map((r) => r.collection)).toEqual(['members', 'members', 'bills']);
  });

  it('sends one record per (collection, id) - a duplicated id would make the server reject the whole batch (audit SEC-4)', () => {
    const collections = new Map<CollectionKey, readonly Row[]>([['bills', [row('b1', { name: 'first' }), row('b1', { name: 'second' }), row('b2')]]]);
    const out = recordsForAll('hh_1', 'dev_a', collections, '2026-08-20T10:00:00.000Z');
    expect(out.map((r) => r.id)).toEqual(['b1', 'b2']);
    expect((out[0]!.data as unknown as { name: string }).name).toBe('second');
  });
});

describe('cursorOf', () => {
  it('takes the highest syncedAt in the batch', () => {
    expect(cursorOf([record('a', { syncedAt: '2026-08-20T10:00:00Z' }), record('b', { syncedAt: '2026-08-20T12:00:00Z' }), record('c', { syncedAt: '2026-08-20T11:00:00Z' })])).toBe('2026-08-20T12:00:00Z');
  });

  it('never moves the cursor backwards', () => {
    expect(cursorOf([record('a', { syncedAt: '2026-08-20T09:00:00Z' })], '2026-08-20T10:00:00Z')).toBe('2026-08-20T10:00:00Z');
  });

  it('keeps the previous cursor for an empty or unstamped batch', () => {
    expect(cursorOf([], '2026-08-20T10:00:00Z')).toBe('2026-08-20T10:00:00Z');
    expect(cursorOf([record('a')], '2026-08-20T10:00:00Z')).toBe('2026-08-20T10:00:00Z');
    expect(cursorOf([])).toBeUndefined();
  });
});
