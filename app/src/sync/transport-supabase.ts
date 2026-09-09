import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CollectionKey, PullResult, Row, ServerHousehold, SyncConfig, SyncRecord, SyncTransport } from './types';
import { COLLECTIONS } from './types';

// Supabase backend: one `records` table plus a `sync_push` function (see
// supabase/migrations). No auth - reachability over the household's
// Tailscale network is the access control, so the client runs with the anon
// key and no session.

/** A row of public.records as PostgREST returns it. */
interface RecordRow {
  household_id: string;
  collection: string;
  id: string;
  data: Row | null;
  updated_at: string;
  deleted: boolean;
  device_id: string | null;
  synced_at: string;
}

const PAGE = 500;

/**
 * How far behind the cursor an incremental pull starts. `synced_at` is stamped
 * inside the writer's transaction but the row only becomes visible at commit, so
 * a pull whose snapshot lands in between sees a LATER stamp first, advances its
 * cursor past the still-uncommitted rows and never asks for them again.
 * Re-reading the last minute on every pull closes that window; merges are
 * idempotent, so the repeats cost bytes and nothing else (audit SYN-1 / SY-13).
 */
export const PULL_OVERLAP_MS = 60_000;

/** The stamp an incremental pull actually starts from: the cursor minus the overlap window (undefined = from the beginning). */
export function overlapCursor(cursor: string | undefined, overlapMs = PULL_OVERLAP_MS): string | undefined {
  if (!cursor) return undefined;
  const t = Date.parse(cursor);
  return Number.isNaN(t) ? cursor : new Date(t - overlapMs).toISOString();
}

/** A value inside a hand-built PostgREST filter: double-quoted, `"` and `\` escaped, so a foreign id at a page boundary cannot break the query (audit SEC-5). */
export const quoteFilterValue = (s: string): string => `"${s.replace(/["\\]/g, (ch) => `\\${ch}`)}"`;

/**
 * PostgREST serialises timestamptz as `2026-08-23T10:00:00.12+00:00`; the app
 * stamps `2026-08-23T10:00:00.120Z`. The client compares stamps as strings
 * (mergeRemote, noteSkew), so what the server echoes goes back to the app's
 * form (audit SY-9). `synced_at` is NOT normalised: it only ever travels back
 * to the server as a cursor and is compared against its own kind.
 */
export function normaliseStamp(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toISOString();
}

const isCollection = (x: string): x is CollectionKey => (COLLECTIONS as readonly string[]).includes(x);

function fromRow(r: RecordRow): SyncRecord | null {
  if (!isCollection(r.collection)) return null; // a newer app version's collection: leave it alone
  return {
    householdId: r.household_id,
    collection: r.collection,
    id: r.id,
    data: r.deleted ? null : r.data,
    updatedAt: normaliseStamp(r.updated_at),
    deleted: r.deleted,
    deviceId: r.device_id ?? '',
    syncedAt: r.synced_at,
  };
}

function toRow(rec: SyncRecord) {
  return {
    household_id: rec.householdId,
    collection: rec.collection,
    id: rec.id,
    data: rec.deleted ? null : rec.data,
    updated_at: rec.updatedAt,
    deleted: rec.deleted,
    device_id: rec.deviceId,
  };
}

function normaliseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export class SupabaseTransport implements SyncTransport {
  private readonly client: SupabaseClient;

  /** `client` is for tests only: a fake that records the queries it is asked. */
  constructor(config: SyncConfig, client?: SupabaseClient) {
    this.client =
      client ??
      createClient(normaliseUrl(config.url), config.anonKey.trim(), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
  }

  async ping(): Promise<void> {
    const { error } = await this.client.from('records').select('id', { count: 'exact', head: true }).limit(1);
    if (error) throw new Error(error.message);
  }

  async serverTime(): Promise<string | undefined> {
    // sync_now() arrived with the 20260902 migration; a server without it simply cannot say.
    const { data, error } = await this.client.rpc('sync_now');
    if (error || typeof data !== 'string') return undefined;
    return normaliseStamp(data);
  }

  async listHouseholds(): Promise<ServerHousehold[]> {
    // Most recently active first, so a fresh device joining without a local id match adopts the live household, not an abandoned one.
    const { data, error } = await this.client.from('records').select('household_id, data, synced_at').eq('collection', 'household').eq('deleted', false).order('synced_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Array<Pick<RecordRow, 'household_id' | 'data' | 'synced_at'>>).map((r) => {
      const name: unknown = (r.data as { name?: unknown } | null)?.name;
      return { id: r.household_id, name: typeof name === 'string' && name ? name : 'Household', syncedAt: r.synced_at };
    });
  }

  async pull(householdId: string, cursor?: string): Promise<PullResult> {
    const records: SyncRecord[] = [];
    // Keyset pagination on (synced_at, id): a row written concurrently can only land
    // beyond our position - offset ranges could shift an unread row out of the next
    // page and the final cursor would then skip it forever. Unknown collections are
    // filtered server-side so they never gum up the cursor either. The first page
    // starts an overlap window BEFORE the cursor (see PULL_OVERLAP_MS).
    let afterSynced = overlapCursor(cursor);
    let afterId: string | undefined;
    for (;;) {
      let query = this.client
        .from('records')
        .select('*')
        .eq('household_id', householdId)
        .in('collection', [...COLLECTIONS])
        .order('synced_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE);
      if (afterSynced && afterId) query = query.or(`synced_at.gt.${quoteFilterValue(afterSynced)},and(synced_at.eq.${quoteFilterValue(afterSynced)},id.gt.${quoteFilterValue(afterId)})`);
      else if (afterSynced) query = query.gt('synced_at', afterSynced);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = data as RecordRow[];
      for (const r of rows) {
        const rec = fromRow(r);
        if (rec) records.push(rec);
      }
      if (rows.length < PAGE) break;
      const last = rows[rows.length - 1];
      afterSynced = last.synced_at;
      afterId = last.id;
    }
    // The cursor never moves backwards: the overlap re-reads rows below it, whose stamps are older.
    let max = cursor;
    for (const r of records) if (r.syncedAt && (!max || r.syncedAt > max)) max = r.syncedAt;
    return { records, cursor: max };
  }

  async push(records: SyncRecord[]): Promise<SyncRecord[]> {
    if (records.length === 0) return [];
    const stored: SyncRecord[] = [];
    for (let i = 0; i < records.length; i += PAGE) {
      const { data, error } = await this.client.rpc('sync_push', { rows: records.slice(i, i + PAGE).map(toRow) });
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as RecordRow[]) {
        const rec = fromRow(r);
        if (rec) stored.push(rec);
      }
    }
    return stored;
  }

  async deleteHousehold(householdId: string): Promise<void> {
    // The household row stays: the caller tombstoned it first (audit SY-11).
    const { error } = await this.client.from('records').delete().eq('household_id', householdId).neq('collection', 'household');
    if (error) throw new Error(error.message);
  }

  subscribe(householdId: string, onChange: () => void): () => void {
    // Realtime can drop quietly (laptop asleep, proxy hiccup, server restart). The app
    // still polls every 30 s, but retrying the channel brings live updates back.
    let disposed = false;
    let channel: ReturnType<SupabaseClient['channel']> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (disposed) return;
      channel = this.client
        .channel(`records:${householdId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `household_id=eq.${householdId}` }, () => onChange())
        .subscribe((status) => {
          if (disposed || (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT')) return;
          if (channel) void this.client.removeChannel(channel);
          channel = null;
          if (retry) clearTimeout(retry);
          retry = setTimeout(start, 15_000);
        });
    };
    start();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      if (channel) void this.client.removeChannel(channel);
    };
  }
}
