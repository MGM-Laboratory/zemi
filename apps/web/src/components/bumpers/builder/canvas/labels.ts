import { BUMPER_KIND_META, type BumperData, type BumperSlide, type BumperTheme } from '@zemi/shared';
import { buildResolveCtx } from '../../engine/resolve';
import { getTemplate } from '../../templates';
import type { ElementInfo } from './geometry';

/** Friendly name for a canvas element. Free text shows its first words so two "Text" layers can be told apart. */
export function elementLabel(slide: BumperSlide | null, el: Pick<ElementInfo, 'key' | 'label' | 'extraId'>): string {
  if (!el.extraId || !slide) return el.label;
  const x = slide.extras.find((e) => e.id === el.extraId);
  if (x?.type !== 'text') return el.label;
  const t = String(x.props.text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return el.label;
  return `Text: ${t.length > 26 ? `${t.slice(0, 26).trimEnd()}...` : t}`;
}

/** What the template would call this slide from its data ("Rani Kusuma"), ignoring the label override. */
export function describeSlide(slide: BumperSlide, theme: BumperTheme, data: BumperData, showEventId: string | null): string {
  const template = getTemplate(slide.kind);
  const ctx = buildResolveCtx({ slide, theme, data, mode: 'thumb', showEventId, template, now: Date.now });
  return template.describe?.(ctx) || BUMPER_KIND_META[slide.kind].label;
}

/** The rail name: the operator's label, else the template's description. */
export function slideName(slide: BumperSlide, theme: BumperTheme, data: BumperData, showEventId: string | null): string {
  return slide.label?.trim() || describeSlide(slide, theme, data, showEventId);
}
