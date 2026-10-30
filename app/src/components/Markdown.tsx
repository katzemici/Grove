// Small markdown renderer for Journal notes. It builds React elements directly
// (no innerHTML), so note content can never inject markup or scripts.
// Supports: headings, paragraphs with soft line breaks, bullet / numbered /
// task lists (nested), quotes, fenced code, rules, **bold**, *italic*,
// ~~strike~~, ==highlight==, `code`, [links](https://…), [[wikilinks]], #tags.

import { Fragment, type ReactNode } from 'react';

interface ListItem {
  text: string;
  task: boolean | null;
  taskIndex: number;
  children: ListBlock[];
}
interface ListBlock {
  t: 'list';
  ordered: boolean;
  start: number;
  items: ListItem[];
}
type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'code'; lang: string; text: string }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'hr' }
  | ListBlock;

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>/;
const LIST = /^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\](?:\s+(.*))?$/;

const startsBlock = (l: string) => FENCE.test(l) || HEADING.test(l) || RULE.test(l) || QUOTE.test(l) || LIST.test(l);

function parseList(lines: string[], start: number, ctr: { n: number }): [ListBlock, number] {
  const first = LIST.exec(lines[start])!;
  const base = first[1].length;
  const make = (m: RegExpExecArray): ListBlock => ({ t: 'list', ordered: !!m[3], start: m[3] ? Number(m[3]) : 1, items: [] });
  const root = make(first);
  const stack: { indent: number; list: ListBlock }[] = [{ indent: base, list: root }];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = j < lines.length ? LIST.exec(lines[j]) : null;
      if (next && next[1].length >= base) {
        i = j;
        continue;
      }
      break;
    }
    const m = LIST.exec(line);
    if (!m) {
      if (startsBlock(line)) break;
      const items = stack[stack.length - 1].list.items;
      items[items.length - 1].text += '\n' + line.trim();
      i++;
      continue;
    }
    const indent = m[1].length;
    if (indent < base) break;
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
    let top = stack[stack.length - 1];
    if (indent >= top.indent + 2 && top.list.items.length) {
      const child = make(m);
      top.list.items[top.list.items.length - 1].children.push(child);
      top = { indent, list: child };
      stack.push(top);
    }
    const tm = TASK.exec(m[4]);
    top.list.items.push(
      tm
        ? { text: tm[2] ?? '', task: tm[1] !== ' ', taskIndex: ctr.n++, children: [] }
        : { text: m[4], task: null, taskIndex: -1, children: [] },
    );
    i++;
  }
  return [root, i];
}

function parseBlocks(src: string, ctr: { n: number }): Block[] {
  const lines = src.split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const q: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push({ t: 'quote', blocks: parseBlocks(q.join('\n'), ctr) });
      continue;
    }
    if (LIST.test(line)) {
      const [list, next] = parseList(lines, i, ctr);
      out.push(list);
      i = next;
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && (p.length === 0 || !startsBlock(lines[i]))) p.push(lines[i++]);
    out.push({ t: 'p', text: p.join('\n') });
  }
  return out;
}

function parseMarkdown(src: string): Block[] {
  const clean = src.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');
  return parseBlocks(clean, { n: 0 });
}

// ──────────────────────────────────────────────────────────────── Inline

export interface MarkdownHandlers {
  onToggleTask?: (index: number) => void;
  onWikiLink?: (target: string) => void;
  wikiExists?: (target: string) => boolean;
  onTag?: (tag: string) => void;
}

const INLINE = new RegExp(
  [
    '(`[^`\\n]+`)', // 1 code
    '(\\*\\*[^*\\n]+?\\*\\*|__[^_\\n]+?__)', // 2 bold
    '(\\*[^*\\s][^*\\n]*?\\*|(?<![\\p{L}\\p{N}])_[^_\\s][^_\\n]*?_(?![\\p{L}\\p{N}]))', // 3 italic
    '(~~[^~\\n]+?~~)', // 4 strike
    '(==[^=\\n]+?==)', // 5 highlight
    '(\\[\\[[^\\]\\n]+?\\]\\])', // 6 wikilink
    '(!?\\[[^\\]\\n]*\\]\\([^)\\s]+\\))', // 7 link / image
    '((?<![^\\s(])#[\\p{L}\\p{N}_][\\p{L}\\p{N}_/-]*)', // 8 tag
    "(https?:\\/\\/[^\\s<]+[^\\s<.,;:!?)\\]'\"])", // 9 bare url
  ].join('|'),
  'gu',
);

const SAFE_URL = /^(https?:|mailto:)/i;

function inline(text: string, h: MarkdownHandlers, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    const all = m[0];
    if (at > last) out.push(text.slice(last, at));
    last = at + all.length;
    const kk = `${key}.${k++}`;
    if (m[1]) out.push(<code key={kk}>{all.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={kk}>{inline(all.slice(2, -2), h, kk)}</strong>);
    else if (m[3]) out.push(<em key={kk}>{inline(all.slice(1, -1), h, kk)}</em>);
    else if (m[4]) out.push(<s key={kk}>{inline(all.slice(2, -2), h, kk)}</s>);
    else if (m[5]) out.push(<mark key={kk}>{inline(all.slice(2, -2), h, kk)}</mark>);
    else if (m[6]) {
      const [target, alias] = all.slice(2, -2).split('|');
      const name = target.split('#')[0].trim();
      out.push(wiki(name, alias?.trim() || target.trim(), h, kk));
    } else if (m[7]) {
      const lm = /^!?\[([^\]]*)\]\(([^)\s]+)\)$/.exec(all)!;
      const [, label, url] = lm;
      if (SAFE_URL.test(url)) {
        out.push(
          <a key={kk} href={url} target="_blank" rel="noopener noreferrer">
            {label ? inline(label, h, kk) : url}
          </a>,
        );
      } else if (!url.includes(':') && /\.md$/i.test(url)) {
        const name = decodeURIComponent(url).replace(/\.md$/i, '').split('/').pop() ?? url;
        out.push(wiki(name, label || name, h, kk));
      } else out.push(label || url);
    } else if (m[8]) {
      const tag = all.slice(1);
      if (/^\d+$/.test(tag)) out.push(all);
      else if (h.onTag)
        out.push(
          <button key={kk} type="button" className="md-tag" onClick={() => h.onTag?.(tag)}>
            {all}
          </button>,
        );
      else
        out.push(
          <span key={kk} className="md-tag">
            {all}
          </span>,
        );
    } else if (m[9]) {
      out.push(
        <a key={kk} href={all} target="_blank" rel="noopener noreferrer">
          {all}
        </a>,
      );
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function wiki(target: string, label: string, h: MarkdownHandlers, key: string): ReactNode {
  if (!h.onWikiLink)
    return (
      <span key={key} className="md-wikilink">
        {label}
      </span>
    );
  const missing = h.wikiExists ? !h.wikiExists(target) : false;
  return (
    <button
      key={key}
      type="button"
      className={'md-wikilink' + (missing ? ' missing' : '')}
      title={missing ? `Create “${target}”` : `Open “${target}”`}
      onClick={() => h.onWikiLink?.(target)}
    >
      {label}
    </button>
  );
}

/** Inline text with soft line breaks kept (poems, addresses). */
function lines(text: string, h: MarkdownHandlers, key: string): ReactNode[] {
  return text.split('\n').map((l, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {inline(l, h, `${key}.${i}`)}
    </Fragment>
  ));
}

function renderList(list: ListBlock, h: MarkdownHandlers, key: string): ReactNode {
  const items = list.items.map((it, i) => {
    const kk = `${key}.${i}`;
    return (
      <li key={kk} className={it.task === null ? undefined : 'md-task' + (it.task ? ' done' : '')}>
        {it.task !== null && (
          <input
            type="checkbox"
            checked={it.task}
            disabled={!h.onToggleTask}
            onChange={() => h.onToggleTask?.(it.taskIndex)}
            aria-label={it.task ? 'Mark as not done' : 'Mark as done'}
          />
        )}
        <span>{lines(it.text, h, kk)}</span>
        {it.children.map((c, ci) => renderList(c, h, `${kk}.c${ci}`))}
      </li>
    );
  });
  return list.ordered ? (
    <ol key={key} start={list.start === 1 ? undefined : list.start}>
      {items}
    </ol>
  ) : (
    <ul key={key}>{items}</ul>
  );
}

function renderBlocks(blocks: Block[], h: MarkdownHandlers, key: string): ReactNode[] {
  return blocks.map((b, i) => {
    const kk = `${key}${i}`;
    switch (b.t) {
      case 'h': {
        const Tag = `h${Math.min(b.level + 1, 6)}` as 'h2'; // page already owns <h1>
        return (
          <Tag key={kk} className={`md-h${b.level}`}>
            {inline(b.text, h, kk)}
          </Tag>
        );
      }
      case 'p':
        return <p key={kk}>{lines(b.text, h, kk)}</p>;
      case 'code':
        return (
          <pre key={kk} data-lang={b.lang || undefined}>
            <code>{b.text}</code>
          </pre>
        );
      case 'quote':
        return <blockquote key={kk}>{renderBlocks(b.blocks, h, kk + 'q')}</blockquote>;
      case 'hr':
        return <hr key={kk} />;
      case 'list':
        return renderList(b, h, kk);
    }
  });
}

export default function Markdown({
  source,
  className = '',
  ...handlers
}: { source: string; className?: string } & MarkdownHandlers) {
  return <div className={'md ' + className}>{renderBlocks(parseMarkdown(source), handlers, 'b')}</div>;
}
