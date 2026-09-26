'use client';

import type { Blocks } from '@zemi/shared';

/**
 * BlockNote document to broadcast HTML, in the browser. One headless editor (never mounted) does
 * the serializing with `blocksToHTMLLossy`, loaded on first use so the Emails tab stays light.
 *
 * The API sanitizes with a small allowlist (p, strong, em, u, s, a, lists, h2, h3, blockquote, hr,
 * https img, code). We map headings into that range first, so an H1 stays a heading instead of
 * turning into loose text.
 */

interface HtmlEditor {
  blocksToHTMLLossy(blocks?: unknown[]): string;
}

let editor: Promise<HtmlEditor> | null = null;

function getEditor(): Promise<HtmlEditor> {
  editor ??= import('@blocknote/core')
    .then(({ BlockNoteEditor }) => BlockNoteEditor.create() as unknown as HtmlEditor)
    .catch((err) => {
      editor = null;
      throw err;
    });
  return editor;
}

export interface EmailHtml {
  html: string;
  /** Visible text, whitespace collapsed (empty means the API would refuse it). */
  text: string;
  /** Images the API will drop (not https). */
  droppedImages: number;
  /** Block types that become plain text or vanish in email (tables, checklists, files, video, audio). */
  lossy: string[];
}

const LOSSY: Record<string, string> = {
  table: 'tables',
  checkListItem: 'checklists',
  file: 'file blocks',
  video: 'videos',
  audio: 'audio',
  codeBlock: 'code blocks',
};

function collectTypes(blocks: Blocks, into: Set<string>) {
  for (const b of blocks as Array<{ type?: string; children?: Blocks }>) {
    if (b?.type) into.add(b.type);
    if (Array.isArray(b?.children) && b.children.length) collectTypes(b.children, into);
  }
}

export async function blocksToEmailHtml(blocks: Blocks): Promise<EmailHtml> {
  const ed = await getEditor();
  const raw = ed.blocksToHTMLLossy(blocks as unknown[]);
  const html = raw
    .replace(/<(\/?)h1(?=[\s>])/gi, '<$1h2')
    .replace(/<(\/?)h[4-6](?=[\s>])/gi, '<$1h3')
    .trim();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  const droppedImages = Array.from(doc.images).filter((img) => !/^https:\/\//i.test(img.getAttribute('src') ?? '')).length;
  const types = new Set<string>();
  collectTypes(blocks, types);
  const lossy = Array.from(types)
    .map((t) => LOSSY[t])
    .filter((v): v is string => Boolean(v));
  return { html, text, droppedImages, lossy };
}

/** True when the document has any visible text or an image (cheap check, no editor needed). */
export function blocksHaveContent(blocks: Blocks | null | undefined): boolean {
  if (!blocks?.length) return false;
  const walk = (list: Blocks): boolean =>
    (list as Array<{ type?: string; content?: unknown; props?: { url?: string }; children?: Blocks }>).some((b) => {
      if (b.type === 'image' && b.props?.url) return true;
      if (typeof b.content === 'string' && b.content.trim()) return true;
      if (Array.isArray(b.content) && b.content.some((c) => hasText(c))) return true;
      if (b.content && typeof b.content === 'object' && 'rows' in (b.content as object)) return true;
      return Array.isArray(b.children) && b.children.length > 0 && walk(b.children);
    });
  return walk(blocks);
}

function hasText(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as { text?: string; content?: unknown };
  if (typeof n.text === 'string' && n.text.trim()) return true;
  if (Array.isArray(n.content)) return n.content.some(hasText);
  return false;
}
