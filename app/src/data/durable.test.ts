import { describe, expect, it, vi } from 'vitest';
import { HOUSEHOLD_KEY, applyEntries, collectEntries, hasBudgetEntries, isUsableEntry, mirrorEntries, noteDurableChange, parseMirror, planRestore, type EntryStore } from './durable';
import { STORAGE_KEYS } from './persist';

vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })) } }));

// The durable mirror is what brings a packaged build's data back after the OS
// clears WebView storage. The native glue can only run on a device; the pure
// half - what gets mirrored, what a valid mirror is, how it restores - is
// pinned here.

class FakeStorage implements EntryStore {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

const seeded = (entries: Record<string, string>) => {
  const s = new FakeStorage();
  for (const [k, v] of Object.entries(entries)) s.setItem(k, v);
  return s;
};

describe('the mirrored key set', () => {
  it('pins the household literal to STORAGE_KEYS (kept as a literal to avoid an import cycle)', () => {
    expect(HOUSEHOLD_KEY).toBe(STORAGE_KEYS.household);
  });

  it('collects only budget-app.* entries, never the mirror itself or quarantined copies', () => {
    const s = seeded({
      [STORAGE_KEYS.household]: '{"h":1}',
      [STORAGE_KEYS.bills]: '[]',
      'budget-app.mirror.v1': 'nope',
      [`${STORAGE_KEYS.household}.corrupt`]: 'bad',
      'some-other-app.key': 'x',
    });
    expect(collectEntries(s)).toEqual({ [STORAGE_KEYS.household]: '{"h":1}', [STORAGE_KEYS.bills]: '[]' });
  });

  it('reflects a removal: a wiped key simply is not in the next snapshot', () => {
    const s = seeded({ [STORAGE_KEYS.household]: '{"h":1}', [STORAGE_KEYS.bills]: '[]' });
    (s as unknown as { map: Map<string, string> })['map'].delete(STORAGE_KEYS.household);
    expect(collectEntries(s)).toEqual({ [STORAGE_KEYS.bills]: '[]' });
  });
});

describe('parseMirror', () => {
  const good = JSON.stringify({ version: 1, savedAt: '2026-08-29T12:00:00.000Z', entries: { [STORAGE_KEYS.household]: '{"h":1}' } });

  it('accepts a well-formed mirror', () => {
    expect(parseMirror(good)!.entries[STORAGE_KEYS.household]).toBe('{"h":1}');
  });

  it('rejects garbage, wrong versions and missing pieces', () => {
    expect(parseMirror(null)).toBeNull();
    expect(parseMirror('not json')).toBeNull();
    expect(parseMirror('[]')).toBeNull();
    expect(parseMirror(JSON.stringify({ version: 2, savedAt: 'x', entries: {} }))).toBeNull();
    expect(parseMirror(JSON.stringify({ version: 1, entries: {} }))).toBeNull();
  });

  it('drops foreign keys and non-string values instead of restoring them', () => {
    const sneaky = JSON.stringify({ version: 1, savedAt: 'x', entries: { 'evil.key': 'x', [STORAGE_KEYS.bills]: 5, [STORAGE_KEYS.household]: '{}' } });
    expect(parseMirror(sneaky)!.entries).toEqual({ [STORAGE_KEYS.household]: '{}' });
  });
});

describe('applyEntries', () => {
  it('round-trips a snapshot into an empty storage', () => {
    const source = seeded({ [STORAGE_KEYS.household]: '{"h":1}', [STORAGE_KEYS.sync]: '{"s":1}' });
    const target = new FakeStorage();
    applyEntries(target, collectEntries(source));
    expect(collectEntries(target)).toEqual(collectEntries(source));
  });
});

describe('hasBudgetEntries: what "the WebView came up empty" means (audit OB-2)', () => {
  it('any budget-app.* key counts - not only the household', () => {
    expect(hasBudgetEntries(new FakeStorage())).toBe(false);
    expect(hasBudgetEntries(seeded({ [STORAGE_KEYS.bills]: '[]' }))).toBe(true);
    expect(hasBudgetEntries(seeded({ [STORAGE_KEYS.household]: '{}' }))).toBe(true);
  });

  it('the mirror itself and quarantines do not count as live data', () => {
    expect(hasBudgetEntries(seeded({ 'budget-app.mirror.v1': '{}', [`${STORAGE_KEYS.household}.corrupt`]: 'x' }))).toBe(false);
  });
});

describe('a household blob that cannot be read never replaces the mirror (audit SYN-6)', () => {
  const good = JSON.stringify({ version: 1, savedAt: 'x', household: { id: 'hh_1' } });

  it('isUsableEntry: JSON for every key, the right version for the household', () => {
    expect(isUsableEntry(STORAGE_KEYS.bills, '[]')).toBe(true);
    expect(isUsableEntry(STORAGE_KEYS.bills, '{"a":')).toBe(false);
    expect(isUsableEntry(HOUSEHOLD_KEY, good)).toBe(true);
    expect(isUsableEntry(HOUSEHOLD_KEY, '{"version":2}')).toBe(false);
    expect(isUsableEntry(HOUSEHOLD_KEY, '{"version":1,"hou')).toBe(false);
  });

  it('mirrorEntries keeps the previous snapshot of an entry that no longer parses, and drops it with no previous copy', () => {
    const live = seeded({ [HOUSEHOLD_KEY]: '{"version":1,"hou', [STORAGE_KEYS.bills]: '[]', [STORAGE_KEYS.paydays]: 'garbage' });
    expect(mirrorEntries(live, { [HOUSEHOLD_KEY]: good, [STORAGE_KEYS.lists]: '[]' })).toEqual({ [HOUSEHOLD_KEY]: good, [STORAGE_KEYS.bills]: '[]' });
    expect(mirrorEntries(live, null)).toEqual({ [STORAGE_KEYS.bills]: '[]' });
  });

  it('planRestore: empty storage takes the whole mirror; live data keeps everything but an unreadable household', () => {
    const mirror = { version: 1 as const, savedAt: 'x', entries: { [HOUSEHOLD_KEY]: good, [STORAGE_KEYS.bills]: '[]' } };
    expect(planRestore(new FakeStorage(), mirror)).toEqual({ outcome: 'restored', entries: mirror.entries });
    expect(planRestore(new FakeStorage(), null)).toEqual({ outcome: 'no-mirror', entries: {} });
    expect(planRestore(seeded({ [HOUSEHOLD_KEY]: good, [STORAGE_KEYS.bills]: '[{"id":"b"}]' }), mirror)).toEqual({ outcome: 'live-data', entries: {} });
    // The corrupt household is replaced by the mirror's copy; the newer live bills stay untouched.
    expect(planRestore(seeded({ [HOUSEHOLD_KEY]: '{"version":1,"hou', [STORAGE_KEYS.bills]: '[{"id":"b"}]' }), mirror)).toEqual({ outcome: 'restored', entries: { [HOUSEHOLD_KEY]: good } });
    // No readable copy anywhere: nothing to restore, the store's own read quarantines the value.
    expect(planRestore(seeded({ [HOUSEHOLD_KEY]: '{"version":1,"hou' }), { ...mirror, entries: { [HOUSEHOLD_KEY]: 'also bad' } })).toEqual({ outcome: 'live-data', entries: {} });
  });
});

describe('noteDurableChange: an armed flush is never postponed (QA7 R-3)', () => {
  it('a follow-up removal does not re-arm the wipe flush at 1.5s', () => {
    const g = globalThis as { Capacitor?: unknown; localStorage?: unknown; setTimeout: typeof setTimeout };
    const prevCap = g.Capacitor;
    const prevLs = g.localStorage;
    const realSetTimeout = g.setTimeout;
    // A native shell with the household key already GONE - the reset flow.
    g.Capacitor = { isNativePlatform: () => true };
    g.localStorage = seeded({ [STORAGE_KEYS.bills]: '[]' });
    const delays: number[] = [];
    g.setTimeout = ((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout;
    try {
      noteDurableChange(HOUSEHOLD_KEY); // household removal -> immediate flush
      noteDurableChange(STORAGE_KEYS.paydays); // a further removal (key absent) must not re-arm at 1500ms
      // ONE timer, armed at zero: the deliberate wipe stays immediate.
      expect(delays).toEqual([0]);
    } finally {
      g.Capacitor = prevCap;
      g.localStorage = prevLs;
      g.setTimeout = realSetTimeout;
    }
  });
});
