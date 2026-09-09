import { afterEach, describe, expect, it, vi } from 'vitest';
import { ID_RULE } from '../data/persist';
import { newId, randomUuid } from './ids';

// Ids travel between phones through sync, so they must be unique across
// devices and pass the one id rule every guard applies (audit SEC-8).

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newId', () => {
  it('is prefix + a v4 UUID where WebCrypto exists, and passes ID_RULE', () => {
    const id = newId('t');
    expect(id.startsWith('t_')).toBe(true);
    expect(id.slice(2)).toMatch(UUID_V4);
    expect(ID_RULE.test(id)).toBe(true);
  });

  it('never repeats', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(newId('row'));
    expect(ids.size).toBe(5000);
  });

  it('every prefix the app uses stays inside the 64-character rule', () => {
    for (const prefix of ['a', 'at', 'b', 'c', 'dev', 'g', 'gc', 'hh', 'li', 'm', 'p', 'q', 'row', 's', 't']) expect(ID_RULE.test(newId(prefix))).toBe(true);
  });

  it('builds the UUID from getRandomValues where randomUUID is missing (insecure-context tabs)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    expect(randomUuid()).toMatch(UUID_V4);
    expect(ID_RULE.test(newId('t'))).toBe(true);
  });

  it('falls back to the timestamp + Math.random scheme without WebCrypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(randomUuid()).toBeNull();
    const id = newId('t');
    expect(id).toMatch(/^t_[0-9a-z]+_[0-9a-z]{1,6}$/);
    expect(ID_RULE.test(id)).toBe(true);
  });
});
