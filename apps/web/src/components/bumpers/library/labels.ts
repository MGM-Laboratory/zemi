import { BUMPER_KIND_META, formatJakarta, type BumperData, type BumperSlide, type BumperTheme } from '@zemi/shared';
import { formatDuration } from '@/lib/admin/format';
import { buildResolveCtx } from '../engine/resolve';
import { getTemplate } from '../templates';

/** "1:32 on auto", or null when every bumper waits for the operator. */
export function runtimeLabel(sec: number): string | null {
  return sec > 0 ? `${formatDuration(sec)} on auto` : null;
}

export function countLabel(n: number): string {
  return n === 1 ? '1 bumper' : `${n} bumpers`;
}

/** The rail name of a slide: its label, the template's description from data, or the kind. */
export function slideTitle(slide: BumperSlide, theme: BumperTheme, data: BumperData, showEventId: string | null): string {
  if (slide.label) return slide.label;
  const template = getTemplate(slide.kind);
  try {
    const ctx = buildResolveCtx({ slide, theme, data, mode: 'thumb', showEventId, template, now: Date.now });
    return template.describe?.(ctx) || BUMPER_KIND_META[slide.kind].label;
  } catch {
    return BUMPER_KIND_META[slide.kind].label;
  }
}

/** "Zemi #98 · 2 Oct" or the title when the Friday has no number. */
export function eventChipLabel(event: { number: number | null; title: string; startsAt: string }): string {
  const date = formatJakarta(event.startsAt, 'date-short');
  return event.number != null ? `Zemi #${event.number} · ${date}` : `${event.title} · ${date}`;
}

/** The whole crew, for the big empty states: Q and Bridge look at the other two. */
export const FOUR_CAST = [
  { shape: 'circle' as const, mood: 'look' as const, size: 46, lookAt: { x: 0.7, y: -0.2 } },
  { shape: 'triangle' as const, mood: 'idle' as const, size: 52 },
  { shape: 'square' as const, mood: 'sleep' as const, size: 50 },
  { shape: 'arch' as const, mood: 'look' as const, size: 46, lookAt: { x: -0.8, y: -0.1 } },
];
