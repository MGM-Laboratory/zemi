'use client';

import { BUMPER_KIND_META, SHAPE_ORDER, type BumperKind, type ShapeName } from '@zemi/shared';
import type { CSSProperties, ReactNode } from 'react';
import { useSlide } from '../engine/context';
import { El, type ElProps } from '../engine/element';
import { FitText, fontStyle } from '../engine/fit-text';
import { ACCENT_SHAPE, SHAPE_ACCENT, ACCENT_HEX } from '../engine/palette';
import type { BumperPerson, FieldDef, ResolveCtx, TemplateDefinition } from '../engine/types';
import { BumperAvatar, BrandShape } from '../parts/shapes';

/** Type helper for template files: `export default defineTemplate({...})`. */
export function defineTemplate(def: TemplateDefinition): TemplateDefinition {
  return def;
}

/* ---------------------------------------------------------------- common fields */

export const f = {
  eyebrow: (d: FieldDef['default'], label = 'Eyebrow'): FieldDef => ({ key: 'eyebrow', label, type: 'text', max: 80, default: d, placeholder: 'Small label above the title' }),
  title: (d: FieldDef['default'], label = 'Title', max = 160): FieldDef => ({ key: 'title', label, type: 'text', max, default: d }),
  subtitle: (d: FieldDef['default'], label = 'Subtitle', max = 240): FieldDef => ({ key: 'subtitle', label, type: 'longtext', max, default: d }),
  body: (d: FieldDef['default'], label = 'Text', max = 600): FieldDef => ({ key: 'body', label, type: 'longtext', max, default: d }),
  url: (d: FieldDef['default'], label = 'Link for the QR code'): FieldDef => ({ key: 'url', label, type: 'url', max: 500, default: d, tokens: false }),
  qrLabel: (d: FieldDef['default']): FieldDef => ({ key: 'qrLabel', label: 'Under the QR code', type: 'text', max: 60, default: d }),
  showQr: (d = true): FieldDef => ({ key: 'showQr', label: 'Show a QR code', type: 'toggle', default: d, group: 'options' }),
  name: (d: FieldDef['default']): FieldDef => ({ key: 'name', label: 'Name', type: 'text', max: 120, default: d, hint: 'Filled from the profile you pick. Type to override.' }),
  role: (d: FieldDef['default'], label = 'Role or title'): FieldDef => ({ key: 'role', label, type: 'text', max: 160, default: d }),
  org: (d: FieldDef['default']): FieldDef => ({ key: 'org', label: 'Affiliation', type: 'text', max: 160, default: d }),
  time: (d: FieldDef['default'], label = 'Time'): FieldDef => ({ key: 'time', label, type: 'time', default: d, tokens: false, hint: 'HH:mm in WIB' }),
  minutes: (d: number, label = 'Minutes'): FieldDef => ({ key: 'minutes', label, type: 'minutes', default: d, min: 1, max: 240 }),
};

/** Person-derived defaults for name/role/org fields. */
export const personName = (ctx: ResolveCtx) => ctx.person?.name ?? '';
export const personRole = (ctx: ResolveCtx) => ctx.person?.position ?? ctx.person?.headline ?? ctx.person?.role ?? '';
export const personOrg = (ctx: ResolveCtx) => ctx.person?.organization ?? '';

/** The person a slide is about, with typed-in overrides applied (name, role, org fields). */
export function usePerson(): BumperPerson | null {
  const ctx = useSlide();
  const name = ctx.text('name');
  if (!ctx.person && !name) return null;
  const base = ctx.person;
  return {
    kind: base?.kind ?? 'manual',
    id: base?.id ?? null,
    name: name || base?.name || '',
    first: base?.first ?? (name.split(/\s+/)[0] || name),
    nickname: base?.nickname ?? null,
    headline: base?.headline ?? null,
    avatar: base?.avatar ?? null,
    organization: ctx.text('org') || base?.organization || null,
    position: ctx.text('role') || base?.position || null,
    role: base?.role ?? null,
    talkTitle: ctx.text('talk') || base?.talkTitle || null,
    url: base?.url ?? null,
    shape: base?.shape ?? 'circle',
  };
}

/* ---------------------------------------------------------------- mascots */

/** Which characters a slide shows: style.mascot, the theme switch, and the template's default cast. */
export function useMascots(defaults: ShapeName[]): ShapeName[] {
  const ctx = useSlide();
  if (!ctx.theme.mascots) return [];
  const m = ctx.slide.style.mascot;
  if (m === 'none') return [];
  if (m === 'all') return [...SHAPE_ORDER];
  if (m === 'auto') return defaults;
  return [m];
}

/** The shape that goes with the slide's accent. */
export function useAccentShape(): ShapeName {
  return ACCENT_SHAPE[useSlide().accent];
}

export { SHAPE_ACCENT, ACCENT_HEX };

/* ---------------------------------------------------------------- blocks */

/** Mono uppercase label with a little shape bullet. */
export function Eyebrow({ children, shape, color, size = 28, style }: { children: ReactNode; shape?: ShapeName; color?: string; size?: number; style?: CSSProperties }) {
  const ctx = useSlide();
  const s = shape ?? ACCENT_SHAPE[ctx.accent];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.5, ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: size, textTransform: 'uppercase', color: color ?? ctx.colors.fg, lineHeight: 1, ...style }}>
      <span style={{ width: size * 0.8, height: size * 0.8, flex: 'none' }}>
        <BrandShape shape={s} color={ctx.background === 'accent' ? ctx.colors.onAccent : undefined} />
      </span>
      <span data-split-target="">{children}</span>
    </span>
  );
}

/** A display headline element that shrinks to fit. */
export function Headline({ text, max, min, casl = 0.25, weight = 900, lineHeight, ...el }: Omit<ElProps, 'children'> & { text: string; max: number; min?: number; casl?: number; weight?: number; lineHeight?: number }) {
  return (
    <El enter="split-lines" {...el}>
      <FitText max={max} min={min} casl={casl} weight={weight} lineHeight={lineHeight} valign={el.valign}>
        {text}
      </FitText>
    </El>
  );
}

/** A body/mono text element that shrinks to fit. */
export function Line({ text, max, min, font = 'body', weight, ...el }: Omit<ElProps, 'children'> & { text: string; max: number; min?: number; font?: 'body' | 'mono' | 'display'; weight?: number }) {
  if (!text) return null;
  return (
    <El enter="rise" {...el}>
      <FitText max={max} min={min} font={font} weight={weight} valign={el.valign}>
        {text}
      </FitText>
    </El>
  );
}

/** Portrait in the person's shape, with a colored shape offset behind it. */
export function Portrait({ person, size, shape, ring = 0, shadowShape = true, color }: { person: BumperPerson; size: number; shape?: ShapeName; ring?: number; shadowShape?: boolean; color?: string }) {
  const s = shape ?? person.shape;
  const ctx = useSlide();
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {shadowShape ? (
        <div data-portrait-back="" style={{ position: 'absolute', left: size * 0.09, top: size * 0.07, width: size, height: size }}>
          <BrandShape shape={s} color={color ?? (ctx.colors.dark ? ctx.colors.accentHex : ctx.colors.accentHex)} />
        </div>
      ) : null}
      <div data-portrait="" style={{ position: 'relative' }}>
        <BumperAvatar image={person.avatar} name={person.name} clip={s} size={size} ring={ring} ringColor={ctx.colors.bg === 'transparent' ? '#fff' : ctx.colors.bg} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- stub (replaced by real templates) */

export function stubTemplate(kind: BumperKind): TemplateDefinition {
  const meta = BUMPER_KIND_META[kind];
  function Render() {
    const ctx = useSlide();
    return (
      <>
        <El id="eyebrow" label="Eyebrow" box={{ x: 160, y: 300, w: 1200, h: 60 }} enter="fade">
          <Eyebrow>{ctx.text('eyebrow') || meta.label}</Eyebrow>
        </El>
        <Headline id="title" label="Title" box={{ x: 160, y: 390, w: 1600, h: 320 }} text={ctx.text('title') || meta.label} max={200} order={1} />
      </>
    );
  }
  return { kind, fields: [f.eyebrow(null), f.title(null)], Render };
}
