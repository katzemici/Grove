// Journal storage. A "vault" is a folder of markdown notes, like Obsidian.
//  - FolderVault: a real folder on disk via the File System Access API
//    (Chromium browsers). The handle is kept in IndexedDB so the folder stays
//    connected across visits; the browser asks for permission again when needed.
//  - BrowserVault: the same API backed by localStorage, for browsers without
//    folder access, or when the user prefers not to connect one.
// Paths are vault-relative and use "/" ("Ideas/Logo.md"). Only .md files are notes.

export interface NoteFile {
  path: string;
  content: string;
  /** Last modified time, ms since epoch. */
  modified: number;
}

export interface Snapshot {
  notes: NoteFile[];
  folders: string[];
}

export interface Vault {
  readonly kind: 'folder' | 'browser';
  readonly name: string;
  scan(): Promise<Snapshot>;
  read(path: string): Promise<NoteFile>;
  /** Creates or overwrites a note. Returns the new modified time. */
  write(path: string, content: string): Promise<number>;
  /** Moves a note. Fails if the target already exists. */
  rename(from: string, to: string): Promise<number>;
  remove(path: string): Promise<void>;
  makeFolder(path: string): Promise<void>;
  removeFolder(path: string): Promise<void>;
}

const NOTE_EXT = /\.md$/i;
const SKIP_DIR = (name: string) => name.startsWith('.') || name === 'node_modules';

export function isNotePath(path: string): boolean {
  return NOTE_EXT.test(path);
}

/** Split and validate a vault path. Rejects empty, "." and ".." segments. */
export function splitPath(path: string): string[] {
  const parts = path.split('/');
  if (!path || parts.some((p) => !p || p === '.' || p === '..' || /[\\:*?"<>|]/.test(p))) {
    throw new Error(`Invalid path: ${path}`);
  }
  return parts;
}

// ─────────────────────────────────────────────────────────── Folder vault

type Permission = 'granted' | 'denied' | 'prompt';
interface PermissionDesc {
  mode: 'read' | 'readwrite';
}
interface FsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritable>;
}
export interface FsDirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FsFileHandle | FsDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  queryPermission?(d: PermissionDesc): Promise<Permission>;
  requestPermission?(d: PermissionDesc): Promise<Permission>;
}

type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FsDirHandle>;
};

export function folderAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

const RW: PermissionDesc = { mode: 'readwrite' };

export class FolderVault implements Vault {
  readonly kind = 'folder' as const;
  constructor(private root: FsDirHandle) {}

  get name() {
    return this.root.name;
  }

  private async dir(parts: string[], create = false): Promise<FsDirHandle> {
    let d = this.root;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }

  private async fileHandle(path: string, create = false): Promise<FsFileHandle> {
    const parts = splitPath(path);
    const dir = await this.dir(parts.slice(0, -1), create);
    return dir.getFileHandle(parts[parts.length - 1], { create });
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await this.fileHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  async scan(): Promise<Snapshot> {
    const notes: NoteFile[] = [];
    const folders: string[] = [];
    const walk = async (dir: FsDirHandle, prefix: string): Promise<void> => {
      const jobs: Promise<void>[] = [];
      for await (const entry of dir.values()) {
        const path = prefix + entry.name;
        if (entry.kind === 'directory') {
          if (SKIP_DIR(entry.name)) continue;
          folders.push(path);
          jobs.push(walk(entry, path + '/'));
        } else if (isNotePath(entry.name)) {
          jobs.push(
            entry.getFile().then(async (f) => {
              notes.push({ path, content: await f.text(), modified: f.lastModified });
            }),
          );
        }
      }
      await Promise.all(jobs);
    };
    await walk(this.root, '');
    return { notes, folders };
  }

  async read(path: string): Promise<NoteFile> {
    const f = await (await this.fileHandle(path)).getFile();
    return { path, content: await f.text(), modified: f.lastModified };
  }

  async write(path: string, content: string): Promise<number> {
    const h = await this.fileHandle(path, true);
    const w = await h.createWritable();
    await w.write(content);
    await w.close();
    return (await h.getFile()).lastModified;
  }

  async rename(from: string, to: string): Promise<number> {
    if (from === to) return (await this.read(from)).modified;
    // Case-only renames ("note" → "Note") hit the same file on Windows and macOS.
    const caseOnly = from.toLowerCase() === to.toLowerCase();
    if (!caseOnly && (await this.exists(to))) throw new Error(`"${to}" already exists.`);
    const note = await this.read(from);
    if (caseOnly) {
      // Keep a copy under a temporary name so a failed write can't lose the note.
      const tmp = `${to}.renaming`;
      await this.write(tmp, note.content);
      await this.remove(from);
      const modified = await this.write(to, note.content);
      await this.remove(tmp);
      return modified;
    }
    const modified = await this.write(to, note.content);
    await this.remove(from);
    return modified;
  }

  async remove(path: string): Promise<void> {
    const parts = splitPath(path);
    const dir = await this.dir(parts.slice(0, -1));
    await dir.removeEntry(parts[parts.length - 1]);
  }

  async makeFolder(path: string): Promise<void> {
    await this.dir(splitPath(path), true);
  }

  async removeFolder(path: string): Promise<void> {
    const parts = splitPath(path);
    const dir = await this.dir(parts.slice(0, -1));
    await dir.removeEntry(parts[parts.length - 1], { recursive: true });
  }
}

// IndexedDB keeps the directory handle (localStorage can't hold it).
const IDB_NAME = 'grove-journal';
const IDB_STORE = 'handles';
const IDB_KEY = 'vault';

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(IDB_STORE, mode);
      const req = run(tx.objectStore(IDB_STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });
}

/** Ask the user to pick a folder and remember it. */
export async function pickFolder(): Promise<FolderVault> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot open folders. Use Chrome or Edge, or keep notes in the browser.');
  const handle = await picker({ id: 'grove-journal', mode: 'readwrite' });
  await idb('readwrite', (s) => s.put(handle, IDB_KEY)).catch(() => undefined);
  return new FolderVault(handle);
}

export interface SavedFolder {
  handle: FsDirHandle;
  /** "granted" opens straight away; "prompt" needs a click on Reconnect. */
  permission: Permission;
}

export async function loadSavedFolder(): Promise<SavedFolder | null> {
  if (!folderAccessSupported() || typeof indexedDB === 'undefined') return null;
  try {
    const handle = await idb<FsDirHandle | undefined>('readonly', (s) => s.get(IDB_KEY));
    if (!handle) return null;
    const permission = (await handle.queryPermission?.(RW)) ?? 'prompt';
    return { handle, permission };
  } catch {
    return null;
  }
}

/** Must run inside a user gesture (click). */
export async function reconnectFolder(handle: FsDirHandle): Promise<FolderVault | null> {
  const p = (await handle.requestPermission?.(RW)) ?? 'denied';
  return p === 'granted' ? new FolderVault(handle) : null;
}

export async function forgetFolder(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await idb('readwrite', (s) => s.delete(IDB_KEY)).catch(() => undefined);
}

// ────────────────────────────────────────────────────────── Browser vault

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

interface BrowserData {
  notes: Record<string, { content: string; modified: number }>;
  folders: string[];
}

const BROWSER_KEY = 'grove:journal:vault';

export const WELCOME_NOTE = `# Welcome to your journal

This is a plain **markdown** note. Write with the usual syntax and switch to *Read* to see it rendered.

- Lists continue when you press Enter
- [ ] Tasks can be ticked in Read mode
- Tag a note with #ideas or #daily
- Link notes by name, like [[Welcome]]

> Connect a folder and every note becomes a real \`.md\` file you can open in any editor.
`;

export class BrowserVault implements Vault {
  readonly kind = 'browser' as const;
  readonly name = 'Browser notes';
  private data: BrowserData;

  constructor(
    private store: KV = localStorage,
    private now: () => number = Date.now,
  ) {
    const raw = store.getItem(BROWSER_KEY);
    let parsed: BrowserData | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as BrowserData) : null;
    } catch {
      parsed = null;
    }
    this.data = parsed ?? { notes: { 'Welcome.md': { content: WELCOME_NOTE, modified: now() } }, folders: [] };
    if (!parsed) this.save();
  }

  private save() {
    this.store.setItem(BROWSER_KEY, JSON.stringify(this.data));
  }

  private ensureParents(path: string) {
    const parts = splitPath(path);
    for (let i = 1; i < parts.length; i++) {
      const f = parts.slice(0, i).join('/');
      if (!this.data.folders.includes(f)) this.data.folders.push(f);
    }
  }

  async scan(): Promise<Snapshot> {
    return {
      notes: Object.entries(this.data.notes).map(([path, n]) => ({ path, ...n })),
      folders: [...this.data.folders],
    };
  }

  async read(path: string): Promise<NoteFile> {
    const n = this.data.notes[path];
    if (!n) throw new Error(`"${path}" was not found.`);
    return { path, ...n };
  }

  async write(path: string, content: string): Promise<number> {
    this.ensureParents(path);
    const modified = this.now();
    this.data.notes[path] = { content, modified };
    this.save();
    return modified;
  }

  async rename(from: string, to: string): Promise<number> {
    if (from === to) return (await this.read(from)).modified;
    splitPath(to);
    if (this.data.notes[to]) throw new Error(`"${to}" already exists.`);
    const n = await this.read(from);
    delete this.data.notes[from];
    return this.write(to, n.content);
  }

  async remove(path: string): Promise<void> {
    delete this.data.notes[path];
    this.save();
  }

  async makeFolder(path: string): Promise<void> {
    this.ensureParents(path + '/x');
    this.save();
  }

  async removeFolder(path: string): Promise<void> {
    const inside = (p: string) => p === path || p.startsWith(path + '/');
    this.data.folders = this.data.folders.filter((f) => !inside(f));
    for (const p of Object.keys(this.data.notes)) if (inside(p)) delete this.data.notes[p];
    this.save();
  }
}
