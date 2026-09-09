import { isNativeShell } from '../data/durable';

// Hands a text file to the user. In a browser tab that is the download flow;
// inside the packaged app it is NOT - Android's WebView has no download
// listener and Capacitor's client does not handle blob: URLs, so the anchor
// click below did nothing while the screen still said "Backup saved" (audit
// OB-3). Native builds write the file to the app's cache and hand it to the
// share sheet, where the user picks Files / Drive / a chat - the same
// signature, an honest boolean either way.

/** Returns false when the browser cannot download (no Blob/URL support or a blocked popup). Browser-only; use exportText(). */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

// Resolve with the MODULES, never the plugin objects (see data/durable.ts).
let fsPromise: Promise<typeof import('@capacitor/filesystem')> | null = null;
let sharePromise: Promise<typeof import('@capacitor/share')> | null = null;

async function shareText(filename: string, text: string): Promise<boolean> {
  try {
    const fs = await (fsPromise ??= import('@capacitor/filesystem'));
    const share = await (sharePromise ??= import('@capacitor/share'));
    const { uri } = await fs.Filesystem.writeFile({ path: `exports/${filename}`, data: text, directory: fs.Directory.Cache, encoding: fs.Encoding.UTF8, recursive: true });
    await share.Share.share({ title: filename, url: uri, dialogTitle: `Save ${filename}` });
    return true;
  } catch {
    // Cancelled share sheet or a write failure: nothing was saved, say so.
    return false;
  }
}

/** Saves or shares a text file; resolves true only when the user actually ended up with it. */
export function exportText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): Promise<boolean> {
  if (isNativeShell()) return shareText(filename, text);
  return Promise.resolve(downloadText(filename, text, mime));
}

/**
 * The most a picked file may be before it is read. A backup of a lived-in
 * household is well under a megabyte; a mis-picked video would otherwise be
 * pulled into memory whole and JSON.parsed on the main thread, freezing or
 * killing the WebView (audit SEC-7).
 */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** readFileText's refusal, so the caller can show its message as-is. */
export class FileTooLargeError extends Error {
  constructor(size: number, max: number) {
    super(`That file is ${Math.round(size / 1024 / 1024)} MB - a backup from this app is far smaller than ${Math.round(max / 1024 / 1024)} MB. Check that it is the right file.`);
    this.name = 'FileTooLargeError';
  }
}

/** Reads a picked file as text (backup import). Rejects with FileTooLargeError, before reading anything, past `maxBytes`. */
export function readFileText(file: File, maxBytes = MAX_IMPORT_BYTES): Promise<string> {
  if (file.size > maxBytes) return Promise.reject(new FileTooLargeError(file.size, maxBytes));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
}
