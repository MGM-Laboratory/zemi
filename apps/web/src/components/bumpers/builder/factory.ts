import { bumperSlideSchema, type BumperItem, type BumperKind, type BumperSlide, type BumperSlideInput } from '@zemi/shared';
import { newBumperId } from '../api';
import { getTemplate } from '../templates';
import type { TemplatePreset } from '../engine/types';

/**
 * A new slide of a kind, with the template's default style, timing and starter items, then an
 * optional preset and explicit overrides on top.
 */
export function newSlide(kind: BumperKind, opts: { preset?: TemplatePreset | null; overrides?: Partial<Omit<BumperSlideInput, 'id' | 'kind'>> } = {}): BumperSlide {
  const t = getTemplate(kind);
  const starter: BumperItem[] = (t.items?.starter?.() ?? []).map((it) => ({ id: newBumperId('i'), title: '', body: '', meta: '', icon: null, assetId: null, url: null, ...it }));
  const p = opts.preset?.slide ?? {};
  const o = opts.overrides ?? {};
  return bumperSlideSchema.parse({
    id: newBumperId('s'),
    kind,
    items: starter,
    ...p,
    ...o,
    refs: { ...(p.refs ?? {}), ...(o.refs ?? {}) },
    fields: { ...(p.fields ?? {}), ...(o.fields ?? {}) },
    style: { ...(t.style ?? {}), ...(p.style ?? {}), ...(o.style ?? {}) },
    timing: { ...(t.timing ?? {}), ...(p.timing ?? {}), ...(o.timing ?? {}) },
  });
}

/** Deep copy with fresh ids (slide, items, extras). Loop targets pointing inside `ids` are remapped. */
export function cloneSlides(slides: BumperSlide[]): BumperSlide[] {
  const map = new Map<string, string>();
  for (const s of slides) map.set(s.id, newBumperId('s'));
  return slides.map((s) => ({
    ...structuredClone(s),
    id: map.get(s.id)!,
    items: s.items.map((it) => ({ ...it, id: newBumperId('i') })),
    extras: s.extras.map((e) => ({ ...structuredClone(e), id: newBumperId('x') })),
    timing: { ...s.timing, loopToId: s.timing.loopToId ? (map.get(s.timing.loopToId) ?? s.timing.loopToId) : null },
  }));
}

/** Multi-slide inserts offered next to single templates ("A speaker block"). */
export interface SlideBlock {
  key: string;
  label: string;
  description: string;
  /** What the operator must pick first. */
  needs: 'speaker' | 'none';
  build: (pick: { speakerId?: string; publicationId?: string | null }) => BumperSlide[];
}

export const SLIDE_BLOCKS: SlideBlock[] = [
  {
    key: 'speaker-block',
    label: 'Speaker block',
    description: 'Intro, their paper (if they have one) and a thank-you.',
    needs: 'speaker',
    build: ({ speakerId, publicationId }) => [
      newSlide('speaker', { overrides: { refs: { speakerId } } }),
      // The paper card highlights the speaker among its authors.
      publicationId ? newSlide('paper', { overrides: { refs: { publicationId, speakerId } } }) : newSlide('talk-title', { overrides: { refs: { speakerId } } }),
      newSlide('thanks-speaker', { overrides: { refs: { speakerId } } }),
    ],
  },
  {
    key: 'preshow-loop',
    label: 'Pre-show loop',
    description: 'Starting soon, the agenda and housekeeping, looping until you move on.',
    needs: 'none',
    build: () => {
      const a = newSlide('standby', { overrides: { timing: { autoAdvanceSec: 20, loopToId: null } } });
      const b = newSlide('agenda', { overrides: { timing: { autoAdvanceSec: 15, loopToId: null } } });
      const c = newSlide('house-rules', { overrides: { timing: { autoAdvanceSec: 15, loopToId: a.id } } });
      return [a, b, c];
    },
  },
  {
    key: 'qna-block',
    label: 'Q and A block',
    description: 'The Q and A card, then questions from the discussion page.',
    needs: 'none',
    build: () => [newSlide('qna'), newSlide('featured-question')],
  },
  {
    key: 'break-block',
    label: 'Break loop',
    description: 'Coffee break with a countdown, looping with the up-next card.',
    needs: 'none',
    build: () => {
      const a = newSlide('break', { overrides: { timing: { autoAdvanceSec: 30, loopToId: null } } });
      const b = newSlide('up-next', { overrides: { timing: { autoAdvanceSec: 12, loopToId: a.id } } });
      return [a, b];
    },
  },
  {
    key: 'closing-block',
    label: 'Closing',
    description: 'Group photo, next Friday and the goodbye card.',
    needs: 'none',
    build: () => [newSlide('photo'), newSlide('next-event'), newSlide('closing')],
  },
];
