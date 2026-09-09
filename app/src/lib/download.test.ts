// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FileTooLargeError, MAX_IMPORT_BYTES, readFileText } from './download';

// The import path reads a user-picked file whole; the ceiling is checked from
// the File's size BEFORE any byte is read (audit SEC-7).

describe('readFileText', () => {
  it('reads a small file as text', async () => {
    await expect(readFileText(new File(['{"a":1}'], 'backup.json', { type: 'application/json' }))).resolves.toBe('{"a":1}');
  });

  it('refuses a file over the ceiling without reading it, with a message the dialog can show', async () => {
    // A File whose size claims 200 MB without allocating it: only .size is consulted before the refusal.
    const big = new File(['x'], 'holiday.mp4');
    Object.defineProperty(big, 'size', { value: 200 * 1024 * 1024 });
    const err = await readFileText(big).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FileTooLargeError);
    expect((err as Error).message).toMatch(/200 MB/);
    expect((err as Error).message).toMatch(/25 MB/);
  });

  it('accepts a file exactly at the ceiling and honours a custom one', async () => {
    const atMax = new File(['ok'], 'b.json');
    Object.defineProperty(atMax, 'size', { value: MAX_IMPORT_BYTES });
    await expect(readFileText(atMax)).resolves.toBe('ok');
    await expect(readFileText(new File(['0123456789'], 'b.json'), 4)).rejects.toBeInstanceOf(FileTooLargeError);
  });
});
