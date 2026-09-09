import { describe, expect, it } from 'vitest';
import { base64ToBlob, blobToBase64 } from './receipts';

// The packaged build stores each photo as a base64 file via Capacitor
// Filesystem; a corrupted encode would quietly destroy every receipt, so the
// round trip is pinned on real binary data larger than one encoding chunk.

describe('receipt base64 round trip (the native Filesystem encoding)', () => {
  it('survives binary bytes exactly, across chunk boundaries', async () => {
    const bytes = new Uint8Array(70_000); // > one 0x8000 chunk
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const b64 = await blobToBase64(new Blob([bytes], { type: 'image/jpeg' }));
    const back = new Uint8Array(await base64ToBlob(b64).arrayBuffer());
    expect(back).toEqual(bytes);
    expect(base64ToBlob(b64).type).toBe('image/jpeg');
  });

  it('empty and single-byte blobs round-trip too', async () => {
    expect(await blobToBase64(new Blob([]))).toBe('');
    const one = await blobToBase64(new Blob([new Uint8Array([255])]));
    expect(new Uint8Array(await base64ToBlob(one).arrayBuffer())).toEqual(new Uint8Array([255]));
  });
});
