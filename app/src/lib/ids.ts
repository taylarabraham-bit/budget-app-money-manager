/**
 * Local record id: prefix + a random part. Ids cross devices through sync
 * and a collision would be a silent last-write-wins clobber of an unrelated
 * row, so the random part is a UUID from the platform's CSPRNG - 122 bits
 * instead of the 31 that Math.random() draws (audit SEC-8). The old
 * timestamp + Math.random scheme stays as the fallback for a runtime without
 * WebCrypto. Every shape satisfies persist.ts's ID_RULE (letters, digits, `_`,
 * `-`; at most 64 characters) - uuid dashes included.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUuid() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`;
}

/** A v4 UUID from WebCrypto, or null where there is none. `getRandomValues` covers insecure-context tabs (the tailnet demo over plain http), where `randomUUID` is missing. */
export function randomUuid(): string | null {
  const c = globalThis.crypto as Crypto | undefined;
  try {
    if (typeof c?.randomUUID === 'function') return c.randomUUID();
    if (typeof c?.getRandomValues !== 'function') return null;
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40; // version 4
    b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}
