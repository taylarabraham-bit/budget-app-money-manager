import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PULL_OVERLAP_MS, SupabaseTransport, normaliseStamp, overlapCursor, quoteFilterValue } from './transport-supabase';

// The Supabase transport against a fake client that records the query it is
// asked to run. What is pinned here has no other test: the pull overlap window
// that closes the commit-visibility race (audit SYN-1), the quoting of ids in
// the hand-built keyset filter (audit SEC-5), stamp normalisation (audit SY-9)
// and the household row surviving deleteHousehold (audit SY-11).

interface Row {
  household_id: string;
  collection: string;
  id: string;
  data: { id: string } | null;
  updated_at: string;
  deleted: boolean;
  device_id: string | null;
  synced_at: string;
}

const row = (id: string, synced_at: string, over: Partial<Row> = {}): Row => ({ household_id: 'hh_1', collection: 'transactions', id, data: { id }, updated_at: '2026-09-02T10:00:00.12+00:00', deleted: false, device_id: 'dev_b', synced_at, ...over });

/** A chainable, thenable stand-in for a PostgREST query builder. */
class FakeClient {
  calls: Array<[string, unknown[]]> = [];
  constructor(private readonly rows: Row[] = []) {}
  private chain(name: string) {
    return (...args: unknown[]) => {
      this.calls.push([name, args]);
      return this;
    };
  }
  from = this.chain('from');
  select = this.chain('select');
  eq = this.chain('eq');
  neq = this.chain('neq');
  in = this.chain('in');
  order = this.chain('order');
  limit = this.chain('limit');
  gt = this.chain('gt');
  or = this.chain('or');
  delete = this.chain('delete');
  rpc = (name: string, args?: unknown) => {
    this.calls.push(['rpc', [name, args]]);
    return Promise.resolve({ data: name === 'sync_now' ? '2026-09-02T10:00:00.5+00:00' : [], error: null });
  };
  then<T>(resolve: (v: { data: Row[]; error: null }) => T) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve);
  }
  call(name: string) {
    return this.calls.filter(([n]) => n === name).map(([, a]) => a);
  }
}

const transport = (rows: Row[] = []) => {
  const client = new FakeClient(rows);
  return { client, t: new SupabaseTransport({ url: 'https://laptop.ts.net', anonKey: 'k' }, client as unknown as SupabaseClient) };
};

describe('overlapCursor', () => {
  it('starts an incremental pull a minute before the cursor, and from the beginning without one', () => {
    expect(overlapCursor(undefined)).toBeUndefined();
    expect(overlapCursor('2026-09-02T10:00:00+00:00')).toBe(new Date(Date.parse('2026-09-02T10:00:00+00:00') - PULL_OVERLAP_MS).toISOString());
    expect(overlapCursor('2026-09-02T10:01:00.000Z', 60_000)).toBe('2026-09-02T10:00:00.000Z');
  });

  it('leaves an unparsable cursor alone', () => {
    expect(overlapCursor('not a date')).toBe('not a date');
  });
});

describe('quoteFilterValue', () => {
  it('double-quotes and escapes the two characters that would break a PostgREST filter', () => {
    expect(quoteFilterValue('t_abc')).toBe('"t_abc"');
    expect(quoteFilterValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe('normaliseStamp', () => {
  it('turns the server form of a moment into the app form', () => {
    expect(normaliseStamp('2026-08-23T10:00:00.12+00:00')).toBe('2026-08-23T10:00:00.120Z');
    expect(normaliseStamp('2026-08-23T10:00:00.120Z')).toBe('2026-08-23T10:00:00.120Z');
    expect(normaliseStamp('garbage')).toBe('garbage');
  });
});

describe('SupabaseTransport.pull', () => {
  it('asks for rows from the overlap window, never moves the cursor backwards, and normalises updated_at', async () => {
    const cursor = '2026-09-02T10:00:00+00:00';
    const { client, t } = transport([row('t_old', '2026-09-02T09:59:30+00:00'), row('t_new', '2026-09-02T10:00:05+00:00')]);
    const result = await t.pull('hh_1', cursor);
    expect(client.call('gt')).toEqual([['synced_at', overlapCursor(cursor)]]);
    expect(client.call('or')).toEqual([]);
    expect(result.records.map((r) => r.id)).toEqual(['t_old', 't_new']);
    expect(result.cursor).toBe('2026-09-02T10:00:05+00:00');
    expect(result.records[0]!.updatedAt).toBe('2026-09-02T10:00:00.120Z');
  });

  it('keeps the cursor where it was when the overlap only returns rows already seen', async () => {
    const cursor = '2026-09-02T10:00:00+00:00';
    const { t } = transport([row('t_old', '2026-09-02T09:59:30+00:00')]);
    expect((await t.pull('hh_1', cursor)).cursor).toBe(cursor);
  });

  it('pulls from the beginning without a cursor', async () => {
    const { client, t } = transport([]);
    await t.pull('hh_1');
    expect(client.call('gt')).toEqual([]);
    expect(client.call('or')).toEqual([]);
  });
});

describe('SupabaseTransport.deleteHousehold', () => {
  it('removes every row of the household except its household row', async () => {
    const { client, t } = transport([]);
    await t.deleteHousehold('hh_1');
    expect(client.call('delete').length).toBe(1);
    expect(client.call('eq')).toEqual([['household_id', 'hh_1']]);
    expect(client.call('neq')).toEqual([['collection', 'household']]);
  });
});

describe('SupabaseTransport.serverTime', () => {
  it('reads sync_now() in the app form', async () => {
    const { t } = transport([]);
    expect(await t.serverTime()).toBe('2026-09-02T10:00:00.500Z');
  });
});
