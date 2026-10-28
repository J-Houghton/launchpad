// src/lib/config-file.ts
// Reading and writing launchpad.config.js — a plain script that sets
// window.LAUNCHPAD_CONFIG, so the page can load it even when opened from disk.
//
// Saving to the file, best option first:
//   1. `npm run dev`  → the dev server writes public/launchpad.config.js
//   2. Edge / Chrome  → the File System Access API: pick the file once, later saves go straight to it
//   3. anything else  → download a new launchpad.config.js to drop next to index.html
import { normalize, type LaunchpadConfig } from '../config';

type PermissionMode = { mode: 'readwrite' };
type FileHandle = FileSystemFileHandle & {
  queryPermission?(o: PermissionMode): Promise<PermissionState>;
  requestPermission?(o: PermissionMode): Promise<PermissionState>;
};
type SavePicker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle>;

const FILE_NAME = 'launchpad.config.js';
const HEADER = `// Launchpad configuration — loaded by index.html, no rebuild needed.
// Edit by hand (keep it valid JSON after the "="), or use the page's settings
// (the gear at the bottom of the page, or Ctrl+,) and save to this file.
`;

/** JSON with small leaf objects kept on one line, so the file stays easy to read. */
export const pretty = (data: unknown) =>
  JSON.stringify(data, null, 2).replace(/\{\n\s+([^{}[\]]*?)\n\s*\}/g, (_, body: string) => `{ ${body.split(/\n\s*/).join(' ')} }`);

export const toFileText = (config: LaunchpadConfig) => `${HEADER}window.LAUNCHPAD_CONFIG = ${pretty(normalize(config))};\n`;

/** Accepts a launchpad.config.js or a plain .json export. */
export function parseConfigText(text: string): LaunchpadConfig {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no configuration found');
  return normalize(JSON.parse(text.slice(start, end + 1)));
}

export const canWriteDirectly = import.meta.env.DEV || 'showSaveFilePicker' in window;

export function download(text: string, name = FILE_NAME, type = 'text/javascript') {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type })),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- remembering the picked file between visits (handles can live in IndexedDB) ----

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('launchpad', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('handles');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      try {
        const req = run(open.result.transaction('handles', mode).objectStore('handles'));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err); // e.g. a handle this browser can't store
      }
    };
  });
}

const loadHandle = () => idb<FileHandle | undefined>('readonly', s => s.get('config')).catch(() => undefined);
const storeHandle = (h: FileHandle) => idb('readwrite', s => s.put(h, 'config')).catch(() => undefined);

/** Stop saving to the previously picked file; the next save asks again. */
export const forgetLinkedFile = () => idb('readwrite', s => s.delete('config')).catch(() => undefined);

/** The name of the file saves currently go to, if one has been picked. */
export async function linkedFileName() {
  if (import.meta.env.DEV) return `public/${FILE_NAME}`;
  return (await loadHandle())?.name;
}

async function canWrite(handle: FileHandle) {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

async function pickFile() {
  const picker = (window as unknown as { showSaveFilePicker: SavePicker }).showSaveFilePicker;
  return picker({
    suggestedName: FILE_NAME,
    types: [{ description: 'Launchpad config', accept: { 'text/javascript': ['.js'] } }],
  });
}

export type WriteResult = 'written' | 'downloaded' | 'cancelled';

/** Save to launchpad.config.js using the best method available (see top of file). */
export async function writeConfigFile(config: LaunchpadConfig): Promise<WriteResult> {
  const text = toFileText(config);

  if (import.meta.env.DEV) {
    const r = await fetch('/__launchpad/config', { method: 'PUT', headers: { 'Content-Type': 'text/javascript' }, body: text });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return 'written';
  }

  if (!('showSaveFilePicker' in window)) {
    download(text);
    return 'downloaded';
  }

  try {
    let handle = await loadHandle();
    for (let attempt = 0; attempt < 2; attempt++) {
      handle ??= await pickFile();
      if (!(await canWrite(handle))) {
        download(text);
        return 'downloaded';
      }
      try {
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        await storeHandle(handle);
        return 'written';
      } catch (err) {
        // the remembered file was moved or deleted — ask again
        if ((err as DOMException).name !== 'NotFoundError' || attempt) throw err;
        await forgetLinkedFile();
        handle = undefined;
      }
    }
    return 'cancelled';
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return 'cancelled';
    throw err;
  }
}
