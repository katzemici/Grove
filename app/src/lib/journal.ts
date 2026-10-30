// Pure helpers for the Journal: names, tags, excerpts, grouping, tree, search,
// and editor list continuation. No DOM or storage access, so all are unit-tested.

import type { NoteFile } from './vault';

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function noteTitle(path: string): string {
  return baseName(path).replace(/\.md$/i, '');
}

export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

/** Turn user input into a safe file or folder name. */
export function cleanName(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120);
}

/** First free "Untitled.md", "Untitled 1.md", ... in a folder. */
export function uniqueNotePath(folder: string, base: string, taken: Set<string>): string {
  const name = cleanName(base) || 'Untitled';
  for (let i = 0; ; i++) {
    const p = joinPath(folder, `${name}${i ? ' ' + i : ''}.md`);
    if (!taken.has(p.toLowerCase())) return p;
  }
}

function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?(```|$)/g, '').replace(/`[^`\n]*`/g, '');
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;

/** "#tag" words outside code. Headings ("# Title") never match. Unique, in order. */
export function extractTags(md: string): string[] {
  const out: string[] = [];
  for (const m of stripCode(stripFrontmatter(md)).matchAll(TAG_RE)) {
    const t = m[2];
    if (/^\d+$/.test(t)) continue; // "#1" is an issue number, not a tag
    if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Body text for cards: no frontmatter, no leading H1 that repeats the title. */
export function noteBody(md: string, title?: string): string {
  let body = stripFrontmatter(md).replace(/^\s+/, '');
  const h1 = /^#\s+(.+)\n?/.exec(body);
  if (h1 && (!title || h1[1].trim().toLowerCase() === title.toLowerCase())) body = body.slice(h1[0].length);
  return body.trim();
}

// ─────────────────────────────────────────────────────── Time and grouping

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** "Just now", "13 minutes ago", "3 hours ago", "Yesterday", or "02/12/2025". */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = now - ms;
  const d = new Date(ms);
  const n = new Date(now);
  if (sameDay(d, n)) {
    if (diff < MINUTE) return 'Just now';
    if (diff < HOUR) {
      const m = Math.floor(diff / MINUTE);
      return `${m} minute${m === 1 ? '' : 's'} ago`;
    }
    const h = Math.floor(diff / HOUR);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

export interface NoteGroup {
  key: string;
  label: string;
  notes: NoteFile[];
}

/**
 * Newest first, bucketed like a diary: "Today", then each month of the current
 * year ("February"), then whole earlier years ("2024").
 */
export function groupByPeriod(notes: NoteFile[], now = Date.now()): NoteGroup[] {
  const n = new Date(now);
  const groups: NoteGroup[] = [];
  const sorted = [...notes].sort((a, b) => b.modified - a.modified);
  for (const note of sorted) {
    const d = new Date(note.modified);
    let key: string;
    let label: string;
    if (sameDay(d, n)) {
      key = 'today';
      label = 'Today';
    } else if (d.getFullYear() === n.getFullYear()) {
      key = `m${d.getMonth()}`;
      label = d.toLocaleDateString('en-US', { month: 'long' });
    } else {
      key = `y${d.getFullYear()}`;
      label = String(d.getFullYear());
    }
    const last = groups[groups.length - 1];
    if (last?.key === key) last.notes.push(note);
    else groups.push({ key, label, notes: [note] });
  }
  return groups;
}

// ──────────────────────────────────────────────────────────────── Tree

export interface TreeFolder {
  kind: 'folder';
  path: string;
  name: string;
  children: TreeNode[];
}
export interface TreeFile {
  kind: 'file';
  path: string;
  name: string;
  modified: number;
}
export type TreeNode = TreeFolder | TreeFile;

/** Folders first, then notes, each A→Z (natural order, case-insensitive). */
export function buildTree(notes: NoteFile[], folders: string[]): TreeNode[] {
  const root: TreeFolder = { kind: 'folder', path: '', name: '', children: [] };
  const index = new Map<string, TreeFolder>([['', root]]);
  const folderFor = (path: string): TreeFolder => {
    const hit = index.get(path);
    if (hit) return hit;
    const f: TreeFolder = { kind: 'folder', path, name: baseName(path), children: [] };
    index.set(path, f);
    folderFor(parentPath(path)).children.push(f);
    return f;
  };
  for (const f of folders) folderFor(f);
  for (const n of notes) {
    folderFor(parentPath(n.path)).children.push({
      kind: 'file',
      path: n.path,
      name: noteTitle(n.path),
      modified: n.modified,
    });
  }
  const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
  const sort = (f: TreeFolder) => {
    f.children.sort((a, b) => (a.kind === b.kind ? cmp(a.name, b.name) : a.kind === 'folder' ? -1 : 1));
    f.children.forEach((c) => c.kind === 'folder' && sort(c));
  };
  sort(root);
  return root.children;
}

// ────────────────────────────────────────────────────────────── Search

/**
 * Case-insensitive match on title, tags and body. Every word must match.
 * "#tag" words only match tags. Title hits rank above body hits.
 */
export function searchNotes(notes: NoteFile[], query: string): NoteFile[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return notes;
  const scored: { note: NoteFile; score: number }[] = [];
  for (const note of notes) {
    const title = noteTitle(note.path).toLowerCase();
    const body = note.content.toLowerCase();
    const tags = extractTags(note.content).map((t) => t.toLowerCase());
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (w.startsWith('#') && w.length > 1) {
        if (tags.some((t) => t === w.slice(1) || t.startsWith(w.slice(1) + '/'))) score += 2;
        else ok = false;
      } else if (title.includes(w)) score += 3;
      else if (body.includes(w)) score += 1;
      else ok = false;
      if (!ok) break;
    }
    if (ok) scored.push({ note, score });
  }
  return scored.sort((a, b) => b.score - a.score || b.note.modified - a.note.modified).map((s) => s.note);
}

// ────────────────────────────────────────────────────── Editor helpers

export interface RangeEdit {
  start: number;
  end: number;
  text: string;
}

/**
 * Enter inside a list item: continue the list ("- ", "2. ", "- [ ] ").
 * Enter on an empty item: end the list. Returns null when Enter should act normally.
 * The result replaces value[start, end) with text, so the editor can apply it
 * as a native edit and keep undo working.
 */
export function continueList(value: string, caret: number): RangeEdit | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  const m = /^(\s*)([-*+]|(\d+)[.)])(\s+)(\[[ xX]\]\s+)?/.exec(line);
  if (!m) return null;
  const [marker, indent, bullet, num, space, task] = m;
  if (line.length === marker.length) return { start: lineStart, end: caret, text: '' };
  const nextBullet = num ? `${Number(num) + 1}${bullet.slice(-1)}` : bullet;
  return { start: caret, end: caret, text: `\n${indent}${nextBullet}${space}${task ? '[ ] ' : ''}` };
}

/** Tab / Shift+Tab on a list line: indent or outdent it by two spaces. */
export function indentListLine(value: string, caret: number, outdent: boolean): RangeEdit | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const lineEnd = value.indexOf('\n', caret);
  const line = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd);
  if (!/^\s*([-*+]|\d+[.)])\s/.test(line)) return null;
  if (!outdent) return { start: lineStart, end: lineStart, text: '  ' };
  const lead = /^ {1,2}/.exec(line)?.[0].length ?? 0;
  return lead ? { start: lineStart, end: lineStart + lead, text: '' } : null;
}

export function applyRangeEdit(value: string, e: RangeEdit): string {
  return value.slice(0, e.start) + e.text + value.slice(e.end);
}

export function wordCount(md: string): number {
  return (stripCode(md).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

const TASK_LINE = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/;

/**
 * Flip the Nth task checkbox ("- [ ]" ↔ "- [x]") in the source, counting from 0
 * and skipping fenced code, the same way the Markdown renderer numbers them.
 */
export function toggleTask(md: string, index: number): string {
  let i = -1;
  let fence: string | null = null;
  return md
    .split('\n')
    .map((line) => {
      const f = /^\s*(```|~~~)/.exec(line);
      if (f) {
        if (!fence) fence = f[1];
        else if (line.trim().startsWith(fence)) fence = null;
        return line;
      }
      if (fence) return line;
      return line.replace(TASK_LINE, (all, lead: string, mark: string) => {
        i++;
        return i === index ? `${lead}[${mark === ' ' ? 'x' : ' '}]` : all;
      });
    })
    .join('\n');
}

// ────────────────────────────────────────────────────── Daily notes

/** Folder that holds one note per day. */
export const DAILY_FOLDER = 'Daily';

/** "2026-10-28" in local time. ISO order means daily notes sort by date. */
export function dailyTitle(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Daily/2026-10-28.md". */
export function dailyNotePath(date: Date = new Date()): string {
  return joinPath(DAILY_FOLDER, `${dailyTitle(date)}.md`);
}

/** Where the caret goes in a fresh daily note: the end of the first Highlights bullet. */
export const DAILY_CARET_AFTER = '## Highlights\n- ';

/** Starting text for a new daily note. */
export function dailyTemplate(date: Date = new Date()): string {
  const long = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `*${long}*\n\n${DAILY_CARET_AFTER}\n\n## Tasks\n- [ ] \n\n## Notes\n\n`;
}
