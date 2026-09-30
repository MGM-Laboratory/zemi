'use client';

import type { BumperData, BumperSlide, BumperTheme } from '@zemi/shared';
import { useMemo } from 'react';
import { buildResolveCtx } from '../../engine/resolve';
import type { FieldDef, FieldValue, ResolveCtx, TemplateDefinition } from '../../engine/types';
import { getTemplate } from '../../templates';
import { useBuilder } from '../store';

/** Where a field's default comes from, so the inspector can say "From the profile". */
export type FieldSource = 'profile' | 'paper' | 'rundown' | 'event' | null;

export const SOURCE_LABEL: Record<Exclude<FieldSource, null>, string> = {
  profile: 'From the profile',
  paper: 'From the paper',
  rundown: 'From the rundown',
  event: 'From the event',
};

export interface InspectorCtx {
  slide: BumperSlide;
  template: TemplateDefinition;
  ctx: ResolveCtx;
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  /** The event this slide reads (its own ref, else the show's). */
  eventId: string | null;
  canEdit: boolean;
  /** Resolved default of every field, and where it comes from. */
  defaults: Record<string, { value: FieldValue; source: FieldSource }>;
}

function defaultOf(def: FieldDef, ctx: ResolveCtx): FieldValue {
  const d = def.default;
  if (typeof d === 'function') {
    try {
      return d(ctx) ?? null;
    } catch {
      return null;
    }
  }
  return d ?? null;
}

const same = (a: FieldValue, b: FieldValue) => String(a ?? '') === String(b ?? '');

/**
 * The resolved slide for the inspector, plus the source of each default: the default is worked
 * out again without the person, the paper, the rundown item and the event, and whichever removal
 * changes it is where it comes from.
 */
export function useInspectorCtx(slide: BumperSlide): InspectorCtx {
  const { state, canEdit } = useBuilder();
  const { theme, eventId: showEventId } = state.doc;
  const data = state.data;
  return useMemo(() => {
    const template = getTemplate(slide.kind);
    const build = (s: BumperSlide, eventId: string | null) => buildResolveCtx({ slide: s, theme, data, mode: 'edit', showEventId: eventId, template, now: Date.now });
    const ctx = build(slide, showEventId);
    const variants: Array<[Exclude<FieldSource, null>, () => ResolveCtx]> = [
      ['profile', () => build({ ...slide, refs: { ...slide.refs, speakerId: null, teamMemberId: null, speakerIds: [] } }, showEventId)],
      ['paper', () => build({ ...slide, refs: { ...slide.refs, publicationId: null } }, showEventId)],
      ['rundown', () => build({ ...slide, refs: { ...slide.refs, rundown: null } }, showEventId)],
      ['event', () => build({ ...slide, refs: { ...slide.refs, eventId: null } }, null)],
    ];
    const cache = new Map<string, ResolveCtx>();
    const variant = (k: Exclude<FieldSource, null>, make: () => ResolveCtx) => {
      let c = cache.get(k);
      if (!c) {
        c = make();
        cache.set(k, c);
      }
      return c;
    };
    const defaults: InspectorCtx['defaults'] = {};
    for (const def of template.fields) {
      const value = defaultOf(def, ctx);
      let source: FieldSource = null;
      if (typeof def.default === 'function' && value !== null && value !== '') {
        for (const [k, make] of variants) {
          if (!same(value, defaultOf(def, variant(k, make)))) {
            source = k;
            break;
          }
        }
      }
      defaults[def.key] = { value, source };
    }
    return { slide, template, ctx, theme, data, showEventId, eventId: slide.refs.eventId ?? showEventId, canEdit, defaults };
  }, [slide, theme, data, showEventId, canEdit]);
}
