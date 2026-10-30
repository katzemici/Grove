import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Icon from '../components/Icon';
import Markdown from '../components/Markdown';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { LiquidTabs, Menu, type MenuItem } from '../components/Liquid';
import { ErrorBanner, Loading } from '../components/states';
import {
  BrowserVault,
  FolderVault,
  folderAccessSupported,
  forgetFolder,
  loadSavedFolder,
  pickFolder,
  reconnectFolder,
  type NoteFile,
  type SavedFolder,
  type Vault,
} from '../lib/vault';
import {
  applyRangeEdit,
  buildTree,
  cleanName,
  continueList,
  DAILY_CARET_AFTER,
  dailyNotePath,
  dailyTemplate,
  extractTags,
  groupByPeriod,
  indentListLine,
  joinPath,
  noteBody,
  noteTitle,
  parentPath,
  relativeTime,
  searchNotes,
  toggleTask,
  uniqueNotePath,
  wordCount,
  type RangeEdit,
  type TreeNode,
} from '../lib/journal';

type Mode = 'write' | 'read';
type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
type Pending = { path: string; content: string };
type Confirm = { kind: 'note' | 'folder'; path: string } | null;

const MODE_KEY = 'grove:journal:mode';
const SAVE_DELAY = 700;

function upsert(list: NoteFile[], note: NoteFile): NoteFile[] {
  const i = list.findIndex((n) => n.path === note.path);
  if (i < 0) return [...list, note];
  const next = list.slice();
  next[i] = note;
  return next;
}

// ──────────────────────────────────────────────────────────────── Page

export default function Journal() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [saved, setSaved] = useState<SavedFolder | null>(null);
  const [booting, setBooting] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const [openPath, setOpenPath] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [save, setSave] = useState<SaveState>('saved');
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) === 'read' ? 'read' : 'write'));

  const [newFolderIn, setNewFolderIn] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);

  const vaultRef = useRef<Vault | null>(null);
  const pending = useRef<Pending | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Content of the open note as last read from or written to the vault.
  const base = useRef('');
  const openRef = useRef<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // The paper is the one scroll container for both modes.
  const paperRef = useRef<HTMLDivElement>(null);
  // How far down the paper was (0..1) when the mode last changed.
  const modeScroll = useRef<number | null>(null);

  openRef.current = openPath;

  /** Change Write/Read and keep the reader at the same place in the note. */
  const switchMode = useCallback((next: Mode | ((m: Mode) => Mode)) => {
    const p = paperRef.current;
    if (p) {
      const room = p.scrollHeight - p.clientHeight;
      modeScroll.current = room > 0 ? p.scrollTop / room : 0;
    }
    setMode(next);
  }, []);

  // The textarea grows with its text instead of scrolling inside itself, so
  // Write and Read scroll the same way and the text sits in the same place.
  const fitText = useCallback(() => {
    const ta = textRef.current;
    const p = paperRef.current;
    if (!ta) return;
    const top = p?.scrollTop ?? 0;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    if (p) p.scrollTop = top;
  }, []);

  useLayoutEffect(() => {
    if (mode === 'write') fitText();
    const p = paperRef.current;
    const ratio = modeScroll.current;
    if (p && ratio !== null) {
      p.scrollTop = ratio * (p.scrollHeight - p.clientHeight);
      modeScroll.current = null;
    }
  }, [draft, mode, openPath, fitText]);

  useEffect(() => {
    window.addEventListener('resize', fitText);
    return () => window.removeEventListener('resize', fitText);
  }, [fitText]);

  useEffect(() => localStorage.setItem(MODE_KEY, mode), [mode]);
  // The old rain animation stored an on/off flag; it is gone, so drop the key.
  useEffect(() => localStorage.removeItem('grove:journal:rain'), []);

  /** Run vault writes one at a time, in order. */
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const p = queue.current.then(job);
    queue.current = p.catch(() => undefined);
    return p;
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    const v = vaultRef.current;
    if (!p || !v) return;
    pending.current = null;
    setSave('saving');
    try {
      const modified = await enqueue(() => v.write(p.path, p.content));
      if (openRef.current === p.path) base.current = p.content;
      setNotes((ns) => upsert(ns, { path: p.path, content: p.content, modified }));
      if (!pending.current) setSave('saved');
    } catch (e) {
      if (!pending.current) pending.current = p;
      setSave('error');
      setError(`Could not save “${noteTitle(p.path)}”. ${(e as Error).message}`);
    }
  }, [enqueue]);

  const scan = useCallback(async (v: Vault) => {
    setScanning(true);
    try {
      const snap = await v.scan();
      setNotes(snap.notes);
      setFolders(snap.folders);
      setError(null);
      // Pick up edits made outside the app when the open note has no local changes.
      const open = openRef.current;
      if (open) {
        const disk = snap.notes.find((n) => n.path === open);
        if (!disk) {
          if (!pending.current) setOpenPath(null);
        } else if (!pending.current && disk.content !== base.current) {
          base.current = disk.content;
          setDraft(disk.content);
        }
      }
    } catch (e) {
      setError(`Could not read “${v.name}”. ${(e as Error).message}`);
    } finally {
      setScanning(false);
    }
  }, []);

  const switchVault = useCallback(
    async (v: Vault) => {
      await flush();
      vaultRef.current = v;
      setVault(v);
      setSaved(null);
      setOpenPath(null);
      setQuery('');
      setExpanded(new Set());
      await scan(v);
    },
    [flush, scan],
  );

  // Boot: reopen the remembered folder, or fall back to notes kept in the browser.
  useEffect(() => {
    let live = true;
    (async () => {
      const s = await loadSavedFolder();
      if (!live) return;
      if (s?.permission === 'granted') await switchVault(new FolderVault(s.handle));
      else if (s) setSaved(s);
      else await switchVault(new BrowserVault());
      if (live) setBooting(false);
    })();
    return () => {
      live = false;
    };
  }, [switchVault]);

  // Save on leave; warn if a write is still pending when the tab closes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!pending.current) return;
      void flush();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void flush();
    };
  }, [flush]);

  // Coming back to the tab: re-read the folder, other apps may have changed it.
  useEffect(() => {
    const onFocus = () => {
      const v = vaultRef.current;
      if (v?.kind === 'folder' && !pending.current) void scan(v);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [scan]);

  // ───────────────────────────────────────────── derived

  const titles = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notes) {
      const t = noteTitle(n.path).toLowerCase();
      if (!m.has(t)) m.set(t, n.path);
    }
    return m;
  }, [notes]);
  const taken = useMemo(() => new Set(notes.map((n) => n.path.toLowerCase())), [notes]);
  const tree = useMemo(() => buildTree(notes, folders), [notes, folders]);
  const results = useMemo(() => (query.trim() ? searchNotes(notes, query) : null), [notes, query]);
  const groups = useMemo(() => groupByPeriod(results ?? notes), [notes, results]);
  const openNote = openPath ? notes.find((n) => n.path === openPath) : undefined;
  const openTags = useMemo(() => extractTags(draft), [draft]);
  const words = useMemo(() => wordCount(draft), [draft]);
  const targetFolder = openPath ? parentPath(openPath) : '';

  // ───────────────────────────────────────────── actions

  function fail(e: unknown, what: string) {
    setError(`${what} ${(e as Error).message ?? ''}`.trim());
  }

  function expandTo(path: string) {
    const parts = path.split('/').slice(0, -1);
    if (!parts.length) return;
    setExpanded((s) => {
      const next = new Set(s);
      parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')));
      return next;
    });
  }

  async function openNoteAt(path: string, focus: 'body' | 'title' | null = null, caret?: number) {
    const v = vaultRef.current;
    if (!v) return;
    await flush();
    try {
      const n = await v.read(path);
      base.current = n.content;
      setNotes((ns) => upsert(ns, n));
      setDraft(n.content);
      setTitleDraft(noteTitle(path));
      setOpenPath(path);
      setSave('saved');
      expandTo(path);
      if (focus) {
        if (focus) setMode('write');
        requestAnimationFrame(() => {
          if (focus === 'title') titleRef.current?.select();
          else {
            const ta = textRef.current;
            ta?.focus();
            if (ta && caret !== undefined) ta.setSelectionRange(caret, caret);
          }
        });
      }
    } catch (e) {
      fail(e, `Could not open “${noteTitle(path)}”.`);
    }
  }

  async function closeNote() {
    await flush();
    setOpenPath(null);
  }

  async function createNote(folder = targetFolder, name = 'Untitled', content = '') {
    const v = vaultRef.current;
    if (!v) return;
    await flush();
    const path = uniqueNotePath(folder, name, taken);
    try {
      const modified = await enqueue(() => v.write(path, content));
      setNotes((ns) => upsert(ns, { path, content, modified }));
      setQuery('');
      await openNoteAt(path, name === 'Untitled' ? 'title' : 'body');
    } catch (e) {
      fail(e, 'Could not create the note.');
    }
  }

  /** Open today's note in Daily/, creating it from the template the first time. */
  async function openDaily() {
    const v = vaultRef.current;
    if (!v) return;
    const now = new Date();
    const path = dailyNotePath(now);
    const existing = notes.find((n) => n.path.toLowerCase() === path.toLowerCase());
    if (existing) {
      setQuery('');
      await openNoteAt(existing.path, 'body');
      return;
    }
    await flush();
    const content = dailyTemplate(now);
    try {
      const modified = await enqueue(() => v.write(path, content));
      setNotes((ns) => upsert(ns, { path, content, modified }));
      setFolders((fs) => (fs.includes(parentPath(path)) ? fs : [...fs, parentPath(path)]));
      setQuery('');
      const at = content.indexOf(DAILY_CARET_AFTER);
      await openNoteAt(path, 'body', at < 0 ? undefined : at + DAILY_CARET_AFTER.length);
    } catch (e) {
      fail(e, "Could not create today's note.");
    }
  }

  function openByTitle(target: string) {
    const hit = titles.get(target.trim().toLowerCase());
    if (hit) void openNoteAt(hit);
    else void createNote('', target, `# ${target}\n\n`);
  }

  function changeDraft(value: string) {
    const path = openRef.current;
    if (!path) return;
    setDraft(value);
    pending.current = { path, content: value };
    setSave('unsaved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
  }

  async function commitTitle() {
    const v = vaultRef.current;
    const from = openRef.current;
    if (!v || !from) return;
    const name = cleanName(titleDraft);
    const to = joinPath(parentPath(from), `${name}.md`);
    if (!name || to === from) {
      setTitleDraft(noteTitle(from));
      return;
    }
    if (to.toLowerCase() !== from.toLowerCase() && taken.has(to.toLowerCase())) {
      setError(`A note called “${name}” already exists here.`);
      setTitleDraft(noteTitle(from));
      return;
    }
    await flush();
    try {
      const modified = await enqueue(() => v.rename(from, to));
      setNotes((ns) => ns.map((n) => (n.path === from ? { ...n, path: to, modified } : n)));
      setOpenPath(to);
      setTitleDraft(name);
    } catch (e) {
      fail(e, 'Could not rename the note.');
      setTitleDraft(noteTitle(from));
    }
  }

  async function createFolder() {
    const v = vaultRef.current;
    const name = cleanName(folderName);
    if (!v || newFolderIn === null || !name) return;
    const path = joinPath(newFolderIn, name);
    try {
      await enqueue(() => v.makeFolder(path));
      setFolders((fs) => (fs.includes(path) ? fs : [...fs, path]));
      expandTo(path + '/x');
      setNewFolderIn(null);
      setFolderName('');
    } catch (e) {
      fail(e, 'Could not create the folder.');
    }
  }

  async function confirmDelete() {
    const v = vaultRef.current;
    const c = confirm;
    setConfirm(null);
    if (!v || !c) return;
    const inside = (p: string) => p === c.path || p.startsWith(c.path + '/');
    try {
      if (c.kind === 'note') {
        if (pending.current?.path === c.path) pending.current = null;
        await enqueue(() => v.remove(c.path));
        setNotes((ns) => ns.filter((n) => n.path !== c.path));
        if (openRef.current === c.path) setOpenPath(null);
      } else {
        if (pending.current && inside(pending.current.path)) pending.current = null;
        await enqueue(() => v.removeFolder(c.path));
        setNotes((ns) => ns.filter((n) => !inside(n.path)));
        setFolders((fs) => fs.filter((f) => !inside(f)));
        if (openRef.current && inside(openRef.current)) setOpenPath(null);
      }
      setSave('saved');
    } catch (e) {
      fail(e, 'Could not delete it.');
    }
  }

  async function connectFolder() {
    try {
      await switchVault(await pickFolder());
    } catch (e) {
      if ((e as Error).name !== 'AbortError') fail(e, 'Could not open the folder.');
    }
  }

  async function reconnect() {
    if (!saved) return;
    const v = await reconnectFolder(saved.handle).catch(() => null);
    if (v) await switchVault(v);
    else setError('Permission was not granted. You can try again, or keep notes in the browser.');
  }

  async function disconnect() {
    await forgetFolder();
    await switchVault(new BrowserVault());
  }

  function exportNote() {
    if (!openPath) return;
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = openPath.split('/').pop() ?? 'note.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ───────────────────────────────────────────── editor keys

  function applyEdit(ta: HTMLTextAreaElement, edit: RangeEdit) {
    ta.setSelectionRange(edit.start, edit.end);
    // execCommand keeps the browser's undo stack; fall back to a state update.
    const ok = edit.text
      ? document.execCommand?.('insertText', false, edit.text)
      : document.execCommand?.('delete', false);
    if (!ok) {
      changeDraft(applyRangeEdit(ta.value, edit));
      const caret = edit.start + edit.text.length;
      requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
    }
  }

  function onEditorKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    const collapsed = ta.selectionStart === ta.selectionEnd;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && collapsed) {
      const edit = continueList(ta.value, ta.selectionStart);
      if (edit) {
        e.preventDefault();
        applyEdit(ta, edit);
      }
    } else if (e.key === 'Tab' && collapsed) {
      // Only list lines take Tab; elsewhere Tab still moves focus.
      const edit = indentListLine(ta.value, ta.selectionStart, e.shiftKey);
      if (edit) {
        e.preventDefault();
        const caret = ta.selectionStart + (e.shiftKey ? -(edit.end - edit.start) : edit.text.length);
        applyEdit(ta, edit);
        requestAnimationFrame(() => ta.setSelectionRange(Math.max(caret, edit.start), Math.max(caret, edit.start)));
      }
    }
  }

  function onPageKey(e: ReactKeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void flush();
    } else if (mod && e.key.toLowerCase() === 'e' && openPath) {
      e.preventDefault();
      switchMode((m) => (m === 'write' ? 'read' : 'write'));
    }
  }

  // ───────────────────────────────────────────── render pieces

  function folderMenu(path: string): MenuItem[] {
    return [
      { label: 'New note here', onSelect: () => void createNote(path) },
      { label: 'New folder here', onSelect: () => setNewFolderIn(path) },
      { label: 'Delete folder', danger: true, onSelect: () => setConfirm({ kind: 'folder', path }) },
    ];
  }

  function renderTree(nodes: TreeNode[], depth: number) {
    return nodes.map((node) => {
      const pad = { paddingLeft: 12 + depth * 14 };
      if (node.kind === 'folder') {
        const isOpen = expanded.has(node.path);
        return (
          <li key={node.path} role="treeitem" aria-expanded={isOpen} aria-selected={false}>
            <div className="jr-row folder" style={pad}>
              <button
                type="button"
                className="jr-row-main"
                onClick={() =>
                  setExpanded((s) => {
                    const next = new Set(s);
                    if (isOpen) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  })
                }
              >
                <span className={'jr-caret' + (isOpen ? ' open' : '')} aria-hidden>
                  <Icon name="right" size={12} />
                </span>
                <Icon name="folder" size={15} />
                <span className="jr-row-name">{node.name}</span>
              </button>
              <Menu label={`Options for folder ${node.name}`} items={folderMenu(node.path)} />
            </div>
            {isOpen && (
              <ul role="group">
                {node.children.length ? (
                  renderTree(node.children, depth + 1)
                ) : (
                  <li className="jr-row-empty" style={{ paddingLeft: 12 + (depth + 1) * 14 + 20 }}>
                    Empty folder
                  </li>
                )}
              </ul>
            )}
          </li>
        );
      }
      const active = node.path === openPath;
      return (
        <li key={node.path} role="treeitem" aria-selected={active}>
          <div className={'jr-row file' + (active ? ' active' : '')} style={pad}>
            <button type="button" className="jr-row-main" onClick={() => void openNoteAt(node.path)}>
              <span className="jr-caret" aria-hidden />
              <Icon name="file" size={15} />
              <span className="jr-row-name">{node.name}</span>
              {active && save !== 'saved' && <span className="jr-dirty" title="Unsaved changes" />}
            </button>
            <Menu
              label={`Options for ${node.name}`}
              items={[{ label: 'Delete note', danger: true, onSelect: () => setConfirm({ kind: 'note', path: node.path }) }]}
            />
          </div>
        </li>
      );
    });
  }

  function noteCard(note: NoteFile, i: number, featured: boolean) {
    const title = noteTitle(note.path);
    const tag = extractTags(note.content)[0];
    const folder = parentPath(note.path);
    const body = noteBody(note.content, title);
    return (
      <button
        key={note.path}
        type="button"
        className={'jr-card rise' + (featured ? ' featured' : '')}
        style={{ ['--i' as string]: i }}
        onClick={() => void openNoteAt(note.path)}
      >
        <span className="jr-card-meta">
          <span className="jr-card-tag">{tag ? `#${tag}` : folder || 'Note'}</span>
          <span>{relativeTime(note.modified)}</span>
        </span>
        <span className="jr-card-title">{title}</span>
        {body ? (
          <Markdown source={featured ? body.slice(0, 1600) : body.slice(0, 420)} className="jr-card-body" />
        ) : (
          <span className="jr-card-body empty">Nothing written yet.</span>
        )}
      </button>
    );
  }

  const saveLabel =
    save === 'saving' ? 'Saving…' : save === 'unsaved' ? 'Editing' : save === 'error' ? 'Not saved' : 'Saved';

  // ───────────────────────────────────────────── layout

  const sourceItems: MenuItem[] = !vault
    ? []
    : [
        ...(folderAccessSupported()
          ? [{ label: vault.kind === 'folder' ? 'Open another folder…' : 'Connect a folder…', onSelect: () => void connectFolder() }]
          : []),
        ...(vault.kind === 'folder'
          ? [
              { label: 'Reload from disk', onSelect: () => void scan(vault) },
              { label: 'Disconnect folder', onSelect: () => void disconnect() },
            ]
          : []),
      ];
  const sourceLabel = vault && (
    <>
      <Icon name={vault.kind === 'folder' ? 'folder' : 'book'} size={14} /> {vault.name}
    </>
  );

  const head = (
    <header className="page-head compact">
      <div>
        <h1>Journal</h1>
        <p className="subtitle">
          {vault?.kind === 'folder'
            ? `Notes are .md files in “${vault.name}”. Edits save to disk as you type.`
            : 'Plain markdown notes. Connect a folder to keep them as files on your computer.'}
        </p>
      </div>
      <div className="head-actions">
        {vault &&
          (sourceItems.length ? (
            <Menu label="Notes source" trigger={sourceLabel} items={sourceItems} />
          ) : (
            <span className="glass-pill" title="This browser can't open folders, so notes are kept in the browser.">
              {sourceLabel}
            </span>
          ))}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!vault}
          title="Open today's daily note"
          onClick={() => void openDaily()}
        >
          <Icon name="book" size={16} /> Today
        </button>
        <button type="button" className="btn btn-primary" disabled={!vault} onClick={() => void createNote()}>
          <Icon name="plus" size={16} /> New note
        </button>
      </div>
    </header>
  );

  if (booting || (!vault && !saved)) {
    return (
      <main className="page journal-page">
        {head}
        <div className="jr-room">
          <div className="jr-shell solo">
            <Loading label="Opening your journal…" />
          </div>
        </div>
      </main>
    );
  }

  if (!vault && saved) {
    return (
      <main className="page journal-page">
        {head}
        {error && <ErrorBanner message={error} />}
        <div className="jr-room">
          <div className="jr-shell solo">
            <div className="jr-connect">
              <span className="jr-connect-ic" aria-hidden>
                <Icon name="folder" size={30} />
              </span>
              <h2>Reconnect to “{saved.handle.name}”</h2>
              <p>The browser needs your permission again before the app can read and write this folder.</p>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => void disconnect()}>
                  Use browser notes
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void reconnect()}>
                  Reconnect folder
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page journal-page" onKeyDown={onPageKey}>
      {head}
      {error && <ErrorBanner message={error} onRetry={vault ? () => void scan(vault) : undefined} />}

      <div className="jr-room">

        <div className={'jr-shell' + (openPath ? ' has-note' : '')}>
          <aside className="jr-side" aria-label="Notes">
            <label className="search-field jr-search">
              <Icon name="search" size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes or #tags"
                aria-label="Search notes"
              />
              {query && (
                <button type="button" className="jr-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                  <Icon name="close" size={13} />
                </button>
              )}
            </label>

            <div className="jr-side-label">
              <span>{results ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Notes'}</span>
              {scanning && <span className="jr-scan" aria-label="Reading folder" />}
            </div>

            <div className="jr-tree-wrap">
              {results ? (
                results.length ? (
                  <ul className="jr-results">
                    {results.map((n) => (
                      <li key={n.path}>
                        <button
                          type="button"
                          className={'jr-result' + (n.path === openPath ? ' active' : '')}
                          onClick={() => void openNoteAt(n.path)}
                        >
                          <span className="jr-row-name">{noteTitle(n.path)}</span>
                          <span className="jr-result-path">{parentPath(n.path) || vault?.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="jr-side-empty">No notes match “{query}”.</p>
                )
              ) : tree.length ? (
                <ul className="jr-tree" role="tree" aria-label="Folder">
                  {renderTree(tree, 0)}
                </ul>
              ) : (
                <p className="jr-side-empty">No notes yet. Start one below.</p>
              )}
            </div>

            <div className="jr-side-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void createNote()}>
                <Icon name="plus" size={15} /> Note
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewFolderIn(targetFolder)}>
                <Icon name="folderPlus" size={15} /> Folder
              </button>
            </div>
          </aside>

          <section className="jr-main" aria-label={openNote ? noteTitle(openNote.path) : 'Overview'}>
            {openPath ? (
              <article className="jr-editor" key={openPath}>
                <div className="jr-toolbar">
                  <button type="button" className="btn btn-icon sm jr-back" aria-label="Back to all notes" onClick={() => void closeNote()}>
                    <Icon name="left" size={16} />
                  </button>
                  <span className="jr-crumbs">
                    <button type="button" onClick={() => void closeNote()}>
                      {vault?.name}
                    </button>
                    {parentPath(openPath)
                      .split('/')
                      .filter(Boolean)
                      .map((p, i) => (
                        <span key={i}>
                          <Icon name="right" size={11} /> {p}
                        </span>
                      ))}
                  </span>
                  <span className="spacer" />
                  <span className={'jr-save ' + save} role="status" aria-live="polite">
                    <span className="dot" aria-hidden /> {saveLabel}
                  </span>
                  <LiquidTabs
                    size="sm"
                    label="Editor mode"
                    value={mode}
                    onChange={switchMode}
                    options={[
                      {
                        value: 'write',
                        label: (
                          <>
                            <Icon name="pencil" size={13} /> Write
                          </>
                        ),
                      },
                      {
                        value: 'read',
                        label: (
                          <>
                            <Icon name="eye" size={13} /> Read
                          </>
                        ),
                      },
                    ]}
                  />
                </div>

                <div className="jr-paper" ref={paperRef}>
                  <input
                    ref={titleRef}
                    className="jr-title"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => void commitTitle()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitTitle().then(() => textRef.current?.focus());
                      } else if (e.key === 'Escape') {
                        setTitleDraft(noteTitle(openPath));
                        e.currentTarget.blur();
                      }
                    }}
                    aria-label="Note title (file name)"
                    spellCheck={false}
                  />
                  {openNote && <div className="jr-stamp">Edited {relativeTime(openNote.modified).toLowerCase()}</div>}

                  {mode === 'write' ? (
                    <textarea
                      ref={textRef}
                      className="jr-text"
                      value={draft}
                      onChange={(e) => changeDraft(e.target.value)}
                      onKeyDown={onEditorKey}
                      onBlur={() => void flush()}
                      placeholder="Start writing. Markdown works here: # heading, - list, - [ ] task, **bold**, [[another note]], #tag"
                      aria-label="Note text"
                      spellCheck
                    />
                  ) : draft.trim() ? (
                    <Markdown
                      source={draft}
                      className="jr-read"
                      onToggleTask={(i) => changeDraft(toggleTask(draft, i))}
                      onWikiLink={openByTitle}
                      wikiExists={(t) => titles.has(t.trim().toLowerCase())}
                      onTag={(t) => setQuery('#' + t)}
                    />
                  ) : (
                    <p className="jr-read empty">This note is empty. Switch to Write to add something.</p>
                  )}
                </div>

                <footer className="jr-foot">
                  <span>
                    {words} word{words === 1 ? '' : 's'} · {Math.max(1, Math.round(words / 220))} min read
                  </span>
                  {openTags.slice(0, 6).map((t) => (
                    <button key={t} type="button" className="md-tag" onClick={() => setQuery('#' + t)}>
                      #{t}
                    </button>
                  ))}
                  <span className="spacer" />
                  <button type="button" className="btn btn-icon sm" aria-label="Download as .md" title="Download as .md" onClick={exportNote}>
                    <Icon name="download" size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon sm"
                    aria-label="Delete note"
                    title="Delete note"
                    onClick={() => setConfirm({ kind: 'note', path: openPath })}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </footer>
              </article>
            ) : (
              <div className="jr-overview">
                {groups.length === 0 ? (
                  <div className="jr-connect">
                    <span className="jr-connect-ic" aria-hidden>
                      <Icon name={results ? 'search' : 'pencil'} size={28} />
                    </span>
                    <h2>{results ? 'Nothing found' : 'A quiet page'}</h2>
                    <p>{results ? 'Try another word or tag.' : 'Your notes will gather here, newest first.'}</p>
                    {!results && (
                      <button type="button" className="btn btn-primary" onClick={() => void createNote()}>
                        <Icon name="plus" size={16} /> Write the first note
                      </button>
                    )}
                  </div>
                ) : (
                  groups.map((g, gi) => (
                    <section key={g.key} className="jr-group">
                      <h2 className="jr-group-head">{g.label}</h2>
                      <div className="jr-grid">
                        {g.notes.map((n, i) => noteCard(n, i, gi === 0 && i === 0 && g.key === 'today'))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {newFolderIn !== null && (
        <Modal title="New folder" onClose={() => setNewFolderIn(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createFolder();
            }}
          >
            <div className="field">
              <label htmlFor="jr-folder-name">Name{newFolderIn ? ` (inside ${newFolderIn})` : ''}</label>
              <input
                id="jr-folder-name"
                className="input"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Ideas"
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setNewFolderIn(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!cleanName(folderName)}>
                Create folder
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'note' ? 'Delete this note?' : 'Delete this folder?'}
          message={
            confirm.kind === 'note'
              ? `“${noteTitle(confirm.path)}” will be removed${vault?.kind === 'folder' ? ' from your disk' : ''}. This can't be undone.`
              : `“${confirm.path}” and the ${
                  notes.filter((n) => n.path.startsWith(confirm.path + '/')).length
                } note(s) inside will be removed${vault?.kind === 'folder' ? ' from your disk' : ''}. This can't be undone.`
          }
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </main>
  );
}
