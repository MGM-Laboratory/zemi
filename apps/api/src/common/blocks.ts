import type { Blocks } from '@zemi/shared';

/**
 * Flatten a BlockNote document (Block[]) into plain text for search columns
 * (`events.description_text`, `speakers.bio_text`, ...) and email previews.
 *
 * Handles paragraphs, headings, list items, quotes, code, tables, links, mentions and captions of
 * media blocks. Unknown custom blocks contribute their inline text and `props.caption|title|name`.
 * One line per block, nested children are indented by nothing (search does not care), and runs of
 * whitespace are collapsed.
 */
export function blocksToPlainText(blocks: Blocks | null | undefined, maxLength = 100_000): string {
  if (!Array.isArray(blocks)) return '';
  const lines: string[] = [];
  const visit = (list: unknown[], depth: number) => {
    if (depth > 32) return;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const block = raw as { type?: unknown; props?: Record<string, unknown>; content?: unknown; children?: unknown };
      const text = [inlineText(block.content), propText(block.props)].filter(Boolean).join(' ');
      const line = collapse(text);
      if (line) lines.push(line);
      if (Array.isArray(block.children)) visit(block.children, depth + 1);
    }
  };
  visit(blocks, 0);
  const out = lines.join('\n');
  return out.length > maxLength ? out.slice(0, maxLength) : out;
}

function collapse(s: string): string {
  return s.replace(/[\s\u00a0]+/g, ' ').trim();
}

function propText(props: Record<string, unknown> | undefined): string {
  if (!props) return '';
  const parts: string[] = [];
  for (const key of ['caption', 'title', 'name', 'alt']) {
    const v = props[key];
    if (typeof v === 'string' && v.trim()) parts.push(v);
  }
  return parts.join(' ');
}

/** Inline content: string | StyledText | Link | custom inline | TableContent. */
function inlineText(content: unknown, depth = 0): string {
  if (depth > 16 || content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => inlineText(c, depth + 1)).join('');
  if (typeof content !== 'object') return '';
  const node = content as {
    type?: unknown;
    text?: unknown;
    content?: unknown;
    rows?: unknown;
    cells?: unknown;
    props?: Record<string, unknown>;
  };
  if (node.type === 'tableContent' && Array.isArray(node.rows)) {
    return node.rows
      .map((row) => {
        const cells = (row as { cells?: unknown }).cells;
        return Array.isArray(cells) ? cells.map((cell) => inlineText(cell, depth + 1)).join(' | ') : '';
      })
      .join('\n');
  }
  if (node.type === 'tableCell') return inlineText(node.content, depth + 1);
  if (typeof node.text === 'string') return node.text;
  if (node.content !== undefined) return inlineText(node.content, depth + 1);
  // Custom inline content such as mentions: use a readable prop if there is one.
  const p = node.props ?? {};
  for (const key of ['label', 'name', 'title', 'text', 'user']) {
    if (typeof p[key] === 'string') return p[key];
  }
  return '';
}
