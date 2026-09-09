import { useEffect, useState } from 'react';

// Receipt photos, one per transaction, kept in IndexedDB. localStorage is a
// ~5 MB synchronous string store - a few dozen photos would fill it and every
// write would block the UI - while IndexedDB stores Blobs natively, off the
// main thread, with room for hundreds of receipts. Photos are downscaled
// before they are stored. The same four functions are the seam for Supabase
// Storage later (upload → signed URL).
//
// In a PACKAGED (Capacitor) build, IndexedDB is WebView data the OS may evict;
// the structured stores are protected by the durable mirror (data/durable.ts)
// but photos are too large to mirror there. So inside a native shell the same
// four functions store each photo as a real file in the app's private data
// directory (Capacitor Filesystem - never cleared with WebView data), while
// browser tabs keep the IndexedDB path below. navigator.storage.persist(),
// which main.tsx already requests, stays as the browser's line of defence.

import { isNativeShell } from './durable';

const DB_NAME = 'budget-app';
const DB_VERSION = 1;
const STORE = 'receipts';

/** Longest side a stored receipt is reduced to, in pixels. */
const RECEIPT_MAX_PX = 1024;
const JPEG_QUALITY = 0.82;

export const receiptsSupported = (): boolean => isNativeShell() || typeof indexedDB !== 'undefined';

// ---- native branch (Capacitor Filesystem) ----

const RECEIPTS_DIR = 'receipts';

// Resolve with the MODULE, never the plugin object: Capacitor plugins are
// proxies that intercept every property access - including the `.then` the
// promise machinery probes on resolution (see data/durable.ts).
let fsPromise: Promise<typeof import('@capacitor/filesystem')> | null = null;
const fs = () => (fsPromise ??= import('@capacitor/filesystem'));

const nativePath = (transactionId: string) => `${RECEIPTS_DIR}/${transactionId}.jpg`;

/** Blob -> base64 without blowing the stack on a large photo (chunked fromCharCode). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function base64ToBlob(b64: string, type = 'image/jpeg'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function nativePut(transactionId: string, blob: Blob): Promise<void> {
  const m = await fs();
  await m.Filesystem.writeFile({ path: nativePath(transactionId), data: await blobToBase64(blob), directory: m.Directory.Data, recursive: true });
}

async function nativeGet(transactionId: string): Promise<Blob | null> {
  try {
    const m = await fs();
    const { data } = await m.Filesystem.readFile({ path: nativePath(transactionId), directory: m.Directory.Data });
    return typeof data === 'string' ? base64ToBlob(data) : (data as Blob);
  } catch {
    return null;
  }
}

async function nativeDelete(transactionId: string): Promise<void> {
  try {
    const m = await fs();
    await m.Filesystem.deleteFile({ path: nativePath(transactionId), directory: m.Directory.Data });
  } catch {
    // already gone
  }
}

async function nativeClear(): Promise<void> {
  try {
    const m = await fs();
    await m.Filesystem.rmdir({ path: RECEIPTS_DIR, directory: m.Directory.Data, recursive: true });
  } catch {
    // never created
  }
}

async function nativePrune(keep: Set<string>): Promise<void> {
  try {
    const m = await fs();
    const { files } = await m.Filesystem.readdir({ path: RECEIPTS_DIR, directory: m.Directory.Data });
    const orphans = files.map((f) => f.name).filter((name) => name.endsWith('.jpg') && !keep.has(name.slice(0, -4)));
    await Promise.all(orphans.map((name) => m.Filesystem.deleteFile({ path: `${RECEIPTS_DIR}/${name}`, directory: m.Directory.Data }).catch(() => undefined)));
  } catch {
    // never created
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!receiptsSupported()) return Promise.reject(new Error('IndexedDB is not available'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        // If another tab upgrades the schema later, let go of this connection.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Could not open the receipts store'));
      };
      request.onblocked = () => reject(new Error('The receipts store is blocked by another tab'));
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = op(tx.objectStore(STORE));
        // Writes are only durable at tx.oncomplete: a near-full disk fires
        // request.onsuccess and then aborts the transaction at commit
        // (QuotaExceededError). Resolving early reported such photos as saved
        // while hasReceipt: true was persisted over a blob that never landed
        // (QA DR-1). Reads keep resolving on request.onsuccess.
        let result: T;
        let done = false;
        request.onsuccess = () => {
          result = request.result;
          if (mode === 'readonly') {
            done = true;
            resolve(result);
          }
        };
        request.onerror = () => {
          done = true;
          reject(request.error ?? new Error('Receipt store operation failed'));
        };
        tx.oncomplete = () => {
          if (!done) resolve(result!);
        };
        tx.onabort = () => {
          if (!done) reject(tx.error ?? new Error('Receipt store transaction aborted'));
        };
      }),
  );
}

export function putReceipt(transactionId: string, blob: Blob): Promise<void> {
  if (isNativeShell()) return nativePut(transactionId, blob);
  return run('readwrite', (s) => s.put(blob, transactionId)).then(() => undefined);
}

function getReceipt(transactionId: string): Promise<Blob | null> {
  if (isNativeShell()) return nativeGet(transactionId);
  return run<Blob | undefined>('readonly', (s) => s.get(transactionId))
    .then((v) => (v instanceof Blob ? v : null))
    .catch(() => null);
}

export function deleteReceipt(transactionId: string): Promise<void> {
  if (isNativeShell()) return nativeDelete(transactionId);
  return run('readwrite', (s) => s.delete(transactionId))
    .then(() => undefined)
    .catch(() => undefined);
}

/** Remove every stored photo (start fresh, restore sample, backup import - photos are not part of the JSON backup). */
export function clearReceipts(): Promise<void> {
  if (isNativeShell()) return nativeClear();
  if (!receiptsSupported()) return Promise.resolve();
  return run('readwrite', (s) => s.clear())
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * Delete photos whose transaction no longer exists - e.g. the entry was deleted
 * on the other device and a sync pull removed it here, orphaning the blob.
 */
export function pruneReceipts(keepIds: Iterable<string>): Promise<void> {
  if (isNativeShell()) return nativePrune(new Set(keepIds));
  if (!receiptsSupported()) return Promise.resolve();
  const keep = new Set(keepIds);
  return run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    .then((keys) => {
      const orphans = keys.filter((k) => typeof k === 'string' && !keep.has(k));
      return orphans.length === 0 ? undefined : Promise.all(orphans.map((k) => deleteReceipt(String(k)))).then(() => undefined);
    })
    .catch(() => undefined);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Not an image we can read'));
    };
    img.src = url;
  });
}

/**
 * Shrink a photo so its longest side is at most `maxPx`, re-encoded as JPEG.
 * Uses createImageBitmap (which honours the camera's EXIF orientation) when
 * the browser has it, else an <img>. A phone photo of 3-4 MB becomes ~150 KB.
 */
export async function downscaleImage(file: Blob, maxPx = RECEIPT_MAX_PX, quality = JPEG_QUALITY): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  if (typeof createImageBitmap === 'function') {
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      source = await createImageBitmap(file);
    }
    width = source.width;
    height = source.height;
  } else {
    source = await loadImage(file);
    width = source.naturalWidth;
    height = source.naturalHeight;
  }
  const scale = Math.min(1, maxPx / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo'))), 'image/jpeg', quality);
  });
}

/**
 * An object URL for a transaction's stored receipt - null while loading or
 * when there is none. Revoked automatically when the id changes or the
 * component unmounts.
 */
export function useReceiptUrl(transactionId: string | null, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!transactionId || !enabled || !receiptsSupported()) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    getReceipt(transactionId).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => setUrl(null)); // an unreadable photo shows as "not found", never as an unhandled rejection
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [transactionId, enabled]);
  return url;
}
