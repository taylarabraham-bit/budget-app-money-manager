import type { PullResult, ServerHousehold, SyncRecord, SyncTransport } from './types';

// An in-memory "server" with the same rules as the SQL function: newest
// `updatedAt` wins per row, every stored change gets a fresh server-side
// `syncedAt`. Used by the engine tests, and - via a `memory://name` server URL,
// which persists the rows under a localStorage key - for walking through the
// whole two-device story (upload, join, reconnect merge) in one browser.

export class MemoryTransport implements SyncTransport {
  private readonly rows = new Map<string, SyncRecord>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private clock = 0;
  /** Set to make every call fail, to simulate the server being unreachable. */
  offline = false;

  constructor(private readonly storageKey?: string) {
    this.load();
  }

  /**
   * Re-read the snapshot before every operation: two tabs on one `memory://name`
   * each hold their own instance, and without this they were two silently
   * diverging "servers", clobbering each other's snapshot on save (QA SY-15).
   * Newest updatedAt wins per row when folding the disk copy in, so interleaved
   * saves converge instead of forking.
   */
  private load() {
    if (!this.storageKey) return;
    try {
      const raw = globalThis.localStorage?.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { clock?: number; rows?: [string, SyncRecord][] };
      this.clock = Math.max(this.clock, typeof parsed.clock === 'number' ? parsed.clock : 0);
      for (const [k, v] of parsed.rows ?? []) {
        const mine = this.rows.get(k);
        if (!mine || (v.updatedAt ?? '') > mine.updatedAt || ((v.updatedAt ?? '') === mine.updatedAt && (v.syncedAt ?? '') > (mine.syncedAt ?? ''))) this.rows.set(k, v);
      }
    } catch {
      // A damaged snapshot just means an empty test server.
    }
  }

  private save() {
    if (!this.storageKey) return;
    try {
      globalThis.localStorage?.setItem(this.storageKey, JSON.stringify({ clock: this.clock, rows: [...this.rows.entries()] }));
    } catch {
      // Quota or private mode: the test server simply won't survive a reload.
    }
  }

  private key(r: Pick<SyncRecord, 'householdId' | 'collection' | 'id'>) {
    return `${r.householdId}|${r.collection}|${r.id}`;
  }

  private tick(): string {
    this.clock += 1;
    return new Date(Date.UTC(2030, 0, 1, 0, 0, 0, this.clock)).toISOString();
  }

  private guard() {
    if (this.offline) throw new Error('Failed to fetch');
  }

  async ping(): Promise<void> {
    this.guard();
  }

  /** The test server keeps no clock of its own: it agrees with the device, so no skew is ever reported. */
  async serverTime(): Promise<string | undefined> {
    this.guard();
    return new Date().toISOString();
  }

  async listHouseholds(): Promise<ServerHousehold[]> {
    this.guard();
    this.load();
    return [...this.rows.values()]
      .filter((r) => r.collection === 'household' && !r.deleted)
      .map((r) => ({ id: r.householdId, name: String((r.data as { name?: unknown } | null)?.name ?? 'Household'), syncedAt: r.syncedAt ?? '' }))
      .sort((a, b) => (a.syncedAt < b.syncedAt ? 1 : -1)); // most recently active first, like the real transport
  }

  async pull(householdId: string, cursor?: string): Promise<PullResult> {
    this.guard();
    this.load();
    const records = [...this.rows.values()]
      .filter((r) => r.householdId === householdId && (!cursor || (r.syncedAt ?? '') > cursor))
      .sort((a, b) => (a.syncedAt ?? '').localeCompare(b.syncedAt ?? ''));
    let max = cursor;
    for (const r of records) if (r.syncedAt && (!max || r.syncedAt > max)) max = r.syncedAt;
    return { records: records.map((r) => ({ ...r })), cursor: max };
  }

  async push(records: SyncRecord[]): Promise<SyncRecord[]> {
    this.guard();
    this.load();
    const touched = new Set<string>();
    for (const rec of records) {
      const k = this.key(rec);
      const current = this.rows.get(k);
      if (!current || rec.updatedAt > current.updatedAt) this.rows.set(k, { ...rec, syncedAt: this.tick() });
      touched.add(rec.householdId);
    }
    this.save();
    for (const hh of touched) for (const fn of this.listeners.get(hh) ?? []) fn();
    return records.map((rec) => ({ ...this.rows.get(this.key(rec))! }));
  }

  async deleteHousehold(householdId: string): Promise<void> {
    this.guard();
    this.load();
    // The household row itself stays - the caller tombstoned it first (audit SY-11).
    for (const [k, r] of this.rows) if (r.householdId === householdId && r.collection !== 'household') this.rows.delete(k);
    this.save();
  }

  subscribe(householdId: string, onChange: () => void): () => void {
    const set = this.listeners.get(householdId) ?? new Set();
    set.add(onChange);
    this.listeners.set(householdId, set);
    return () => {
      set.delete(onChange);
    };
  }

  /** Test helper: every stored record. */
  all(): SyncRecord[] {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }
}
