import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  applyRangeEdit,
  buildTree,
  cleanName,
  continueList,
  DAILY_CARET_AFTER,
  dailyNotePath,
  dailyTemplate,
  dailyTitle,
  extractTags,
  groupByPeriod,
  indentListLine,
  noteBody,
  relativeTime,
  searchNotes,
  toggleTask,
  uniqueNotePath,
  wordCount,
} from '../lib/journal';
import { BrowserVault, splitPath, type NoteFile } from '../lib/vault';
import Markdown from '../components/Markdown';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const note = (path: string, content = '', modified = 0): NoteFile => ({ path, content, modified });

describe('extractTags', () => {
  it('finds #tags but not headings, numbers or code', () => {
    const md = '# Title\nIdeas for #Pinnacle and #design/logo.\nIssue #12\n`#notatag`\n```\n#nope\n```\n#pinnacle again';
    expect(extractTags(md)).toEqual(['Pinnacle', 'design/logo']);
  });
});

describe('noteBody', () => {
  it('drops frontmatter and an H1 that repeats the title', () => {
    expect(noteBody('---\na: 1\n---\n# Trip\n\nPack bags', 'Trip')).toBe('Pack bags');
    expect(noteBody('# Other\nText', 'Trip')).toBe('# Other\nText');
  });
});

describe('relativeTime', () => {
  const now = at(2026, 2, 14, 15, 0);
  it('uses relative words today and yesterday, dates after', () => {
    expect(relativeTime(now - 20_000, now)).toBe('Just now');
    expect(relativeTime(at(2026, 2, 14, 14, 47), now)).toBe('13 minutes ago');
    expect(relativeTime(at(2026, 2, 14, 12, 0), now)).toBe('3 hours ago');
    expect(relativeTime(at(2026, 2, 13, 9, 0), now)).toBe('Yesterday');
    expect(relativeTime(at(2025, 12, 2), now)).toBe('12/02/2025');
  });
});

describe('groupByPeriod', () => {
  it('buckets Today, months of this year, then earlier years, newest first', () => {
    const now = at(2026, 2, 14, 15);
    const groups = groupByPeriod(
      [
        note('a.md', '', at(2026, 1, 28)),
        note('b.md', '', at(2026, 2, 14, 9)),
        note('c.md', '', at(2026, 2, 2)),
        note('d.md', '', at(2024, 6, 1)),
        note('e.md', '', at(2026, 1, 3)),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.notes.map((n) => n.path)])).toEqual([
      ['Today', ['b.md']],
      ['February', ['c.md']],
      ['January', ['a.md', 'e.md']],
      ['2024', ['d.md']],
    ]);
  });
});

describe('buildTree', () => {
  it('nests notes under folders, folders first, natural order, keeps empty folders', () => {
    const tree = buildTree(
      [note('Note 10.md'), note('Note 2.md'), note('Ideas/Logo.md'), note('Ideas/Deep/x.md')],
      ['Ideas', 'Ideas/Deep', 'Empty'],
    );
    expect(tree.map((n) => n.name)).toEqual(['Empty', 'Ideas', 'Note 2', 'Note 10']);
    const ideas = tree[1];
    expect(ideas.kind === 'folder' && ideas.children.map((c) => c.name)).toEqual(['Deep', 'Logo']);
  });
});

describe('searchNotes', () => {
  const notes = [
    note('Groceries.md', 'eggs and spinach', 1),
    note('Summit.md', 'the air is thin #poetry', 2),
    note('Logo.md', 'a summit shape #pinnacle', 3),
  ];
  it('requires every word, ranks title hits first', () => {
    expect(searchNotes(notes, 'summit').map((n) => n.path)).toEqual(['Summit.md', 'Logo.md']);
    expect(searchNotes(notes, 'summit shape').map((n) => n.path)).toEqual(['Logo.md']);
  });
  it('matches #tags only against tags', () => {
    expect(searchNotes(notes, '#poetry').map((n) => n.path)).toEqual(['Summit.md']);
    expect(searchNotes(notes, '#eggs')).toEqual([]);
  });
});

describe('names', () => {
  it('cleans unsafe characters and finds a free name', () => {
    expect(cleanName('  a/b:c?  ')).toBe('a-b-c-');
    expect(cleanName('..hidden')).toBe('hidden');
    const taken = new Set(['untitled.md', 'untitled 1.md']);
    expect(uniqueNotePath('', 'Untitled', taken)).toBe('Untitled 2.md');
    expect(uniqueNotePath('Ideas', 'Untitled', taken)).toBe('Ideas/Untitled.md');
  });
  it('rejects path traversal', () => {
    expect(() => splitPath('../x.md')).toThrow();
    expect(() => splitPath('a//b.md')).toThrow();
    expect(splitPath('a/b.md')).toEqual(['a', 'b.md']);
  });
});

describe('editor helpers', () => {
  const run = (v: string, caret = v.length) => {
    const e = continueList(v, caret);
    return e && applyRangeEdit(v, e);
  };
  it('continues bullets, numbers and tasks', () => {
    expect(run('- one')).toBe('- one\n- ');
    expect(run('  3. three')).toBe('  3. three\n  4. ');
    expect(run('- [x] done')).toBe('- [x] done\n- [ ] ');
    expect(run('plain')).toBeNull();
  });
  it('ends the list on an empty item', () => {
    expect(run('- one\n- ')).toBe('- one\n');
  });
  it('indents and outdents list lines only', () => {
    const v = 'a\n- item';
    expect(applyRangeEdit(v, indentListLine(v, v.length, false)!)).toBe('a\n  - item');
    const w = 'a\n  - item';
    expect(applyRangeEdit(w, indentListLine(w, w.length, true)!)).toBe('a\n- item');
    expect(indentListLine('text', 2, false)).toBeNull();
  });
  it('toggles the Nth task, skipping code blocks', () => {
    const md = '- [ ] a\n```\n- [ ] code\n```\n- [x] b';
    expect(toggleTask(md, 1)).toBe('- [ ] a\n```\n- [ ] code\n```\n- [ ] b');
    expect(toggleTask(md, 0)).toBe('- [x] a\n```\n- [ ] code\n```\n- [x] b');
  });
  it('counts words outside code', () => {
    expect(wordCount("It's a quiet day `code here`")).toBe(4);
  });
});

describe('BrowserVault', () => {
  function memory() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  }
  it('seeds a welcome note and persists writes, renames and deletes', async () => {
    const store = memory();
    let t = 100;
    const v = new BrowserVault(store, () => ++t);
    expect((await v.scan()).notes.map((n) => n.path)).toEqual(['Welcome.md']);

    await v.write('Ideas/Logo.md', 'cat');
    await v.rename('Ideas/Logo.md', 'Ideas/Mark.md');
    await expect(v.rename('Ideas/Mark.md', 'Welcome.md')).rejects.toThrow(/already exists/);

    const again = new BrowserVault(store);
    const snap = await again.scan();
    expect(snap.folders).toEqual(['Ideas']);
    expect(snap.notes.map((n) => n.path).sort()).toEqual(['Ideas/Mark.md', 'Welcome.md']);
    expect((await again.read('Ideas/Mark.md')).content).toBe('cat');

    await again.removeFolder('Ideas');
    expect((await again.scan()).notes.map((n) => n.path)).toEqual(['Welcome.md']);
  });
});

describe('Markdown', () => {
  it('renders blocks and inline marks as elements, never raw HTML', () => {
    const { container } = render(
      <Markdown source={'# Hi\n\nSome **bold** and <script>x</script>\n\n> quote\n\n1. one\n2. two'} />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('Hi');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>x</script>');
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('blockquote')?.textContent).toBe('quote');
  });

  it('only links safe URLs', () => {
    const { container } = render(<Markdown source={'[ok](https://a.dev) [bad](javascript:alert(1))'} />);
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://a.dev');
  });

  it('wires task boxes, wikilinks and tags to handlers', () => {
    const toggled: number[] = [];
    const opened: string[] = [];
    render(
      <Markdown
        source={'- [ ] first\n- [x] second\n\nSee [[Trip Plan|the plan]] #travel'}
        onToggleTask={(i) => toggled.push(i)}
        onWikiLink={(t) => opened.push(t)}
        wikiExists={() => true}
      />,
    );
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'the plan' }));
    expect(toggled).toEqual([1]);
    expect(opened).toEqual(['Trip Plan']);
    expect(screen.getByText('#travel')).toBeInTheDocument();
  });

  it('nests lists by indentation', () => {
    const { container } = render(<Markdown source={'- a\n  - b\n- c'} />);
    expect(container.querySelectorAll('ul ul li')).toHaveLength(1);
    expect(container.querySelectorAll(':scope > .md > ul > li')).toHaveLength(2);
  });
});

describe('daily notes', () => {
  it('names the note by local ISO date, zero-padded, inside Daily/', () => {
    const d = new Date(2026, 0, 5, 23, 59);
    expect(dailyTitle(d)).toBe('2026-01-05');
    expect(dailyNotePath(d)).toBe('Daily/2026-01-05.md');
    expect(dailyNotePath(new Date(2026, 9, 28, 0, 1))).toBe('Daily/2026-10-28.md');
  });

  it('builds a template with the long date and the three sections', () => {
    const md = dailyTemplate(new Date(2026, 9, 28));
    expect(md.startsWith('*Wednesday, October 28, 2026*\n')).toBe(true);
    expect(md).toContain(DAILY_CARET_AFTER);
    expect(md).toContain('## Tasks\n- [ ] ');
    expect(md).toContain('## Notes');
    expect(extractTags(md)).toEqual([]);
  });

  it('renders the template task as an unchecked checkbox', () => {
    render(<Markdown source={dailyTemplate(new Date(2026, 9, 28))} onToggleTask={() => {}} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('heading', { name: 'Highlights' })).toBeInTheDocument();
  });
});
