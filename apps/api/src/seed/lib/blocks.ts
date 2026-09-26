import type { Blocks } from '@zemi/shared';

/**
 * Tiny BlockNote document builders for seed content. Every block gets an id, full default props and
 * `children: []`, like the editor produces. Bullets are separate `bulletListItem` blocks.
 *
 * Inline markup in strings: `**bold**`, `_italic_` and `[label](https://url)`.
 */

let seq = 0;
const nextId = () => `seed-${(++seq).toString(36).padStart(5, '0')}`;

const DEFAULT_PROPS = { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' } as const;

type StyledText = { type: 'text'; text: string; styles: Record<string, true | string> };
type LinkNode = { type: 'link'; href: string; content: StyledText[] };
type InlineNode = StyledText | LinkNode;

const TOKEN = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/g;

/** Parse the small markup above into BlockNote inline content. */
export function inline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  for (const part of text.split(TOKEN)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      out.push({ type: 'text', text: part.slice(2, -2), styles: { bold: true } });
    } else if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
      out.push({ type: 'text', text: part.slice(1, -1), styles: { italic: true } });
    } else if (part.startsWith('[')) {
      const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (m) out.push({ type: 'link', href: m[2], content: [{ type: 'text', text: m[1], styles: {} }] });
      else out.push({ type: 'text', text: part, styles: {} });
    } else {
      out.push({ type: 'text', text: part, styles: {} });
    }
  }
  return out;
}

export const p = (text: string) => ({ id: nextId(), type: 'paragraph', props: { ...DEFAULT_PROPS }, content: inline(text), children: [] });

export const h = (text: string, level: 1 | 2 | 3 = 2) => ({
  id: nextId(),
  type: 'heading',
  props: { ...DEFAULT_PROPS, level, isToggleable: false },
  content: inline(text),
  children: [],
});

export const bullet = (text: string) => ({ id: nextId(), type: 'bulletListItem', props: { ...DEFAULT_PROPS }, content: inline(text), children: [] });

export const numbered = (text: string) => ({ id: nextId(), type: 'numberedListItem', props: { ...DEFAULT_PROPS }, content: inline(text), children: [] });

export const quote = (text: string) => ({ id: nextId(), type: 'quote', props: { textColor: 'default', backgroundColor: 'default' }, content: inline(text), children: [] });

type Part = Record<string, unknown> | null | false | undefined;
export const doc = (...blocks: Array<Part | Part[]>): Blocks => blocks.flat().filter(Boolean) as Blocks;
