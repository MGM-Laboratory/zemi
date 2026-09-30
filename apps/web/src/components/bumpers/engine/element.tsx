'use client';

import type { BumperBox, BumperTone } from '@zemi/shared';
import type { CSSProperties, ReactNode } from 'react';
import { ElProvider, useSlide } from './context';
import { toneHex } from './palette';
import type { EnterKind, IdleKind } from './types';

export interface ElProps {
  /** Layer key, stable per template ("title", "photo"). The builder stores overrides under it. */
  id: string;
  /** Name in the builder's layer list. */
  label?: string;
  /** Default box on the 1920x1080 canvas. */
  box: BumperBox;
  enter?: EnterKind;
  /** Entrance order (0, 1, 2... fractions allowed). Each step is about 0.09s. */
  order?: number;
  /** Extra entrance delay in seconds. */
  delay?: number;
  idle?: IdleKind;
  /** Shared-element key for magic move, for example `speaker:<id>:photo`. */
  morph?: string | null;
  align?: 'start' | 'center' | 'end';
  /** Vertical placement of the content inside the box. */
  valign?: 'start' | 'center' | 'end';
  tone?: BumperTone;
  as?: 'div' | 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'figure' | 'section';
  /** The builder keeps the aspect ratio while resizing (photos, QR codes, characters). */
  lockAspect?: boolean;
  /** Not movable in the builder (decorative full-bleed art). */
  locked?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end' } as const;

/**
 * A positioned element on the slide. Applies the builder's overrides (box, hidden, scale, rotate,
 * align, tone, z) and carries the data attributes the choreographer and the builder read.
 */
export function El({ id, label, box, enter = 'rise', order = 0, delay, idle, morph, align = 'start', valign = 'start', tone, as = 'div', lockAspect, locked, className, style, children }: ElProps) {
  const ctx = useSlide();
  const layer = ctx.slide.layers[id];
  if (layer?.hidden && ctx.mode !== 'edit') return null;
  const b = layer?.box ?? box;
  const a = layer?.align ?? align;
  const t = layer?.tone ?? tone;
  const scale = (layer?.scale ?? 1) * ctx.slide.style.textScale;
  const Tag = as;
  const css: CSSProperties = {
    position: 'absolute',
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: JUSTIFY[valign],
    alignItems: a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : 'center',
    textAlign: a === 'start' ? 'left' : a === 'end' ? 'right' : 'center',
    zIndex: 10 + (layer?.z ?? 0),
    margin: 0,
    ...(t ? { color: toneHex(t, ctx.colors) } : null),
    ...(layer?.rotate ? { rotate: `${layer.rotate}deg` } : null),
    ...(layer?.hidden ? { visibility: 'hidden' } : null),
    ...style,
  };
  return (
    <Tag
      className={className}
      style={css}
      data-el={id}
      data-el-label={label ?? id}
      data-box={`${b.x},${b.y},${b.w},${b.h}`}
      data-default-box={`${box.x},${box.y},${box.w},${box.h}`}
      data-enter={enter}
      data-order={order}
      data-delay={delay}
      data-idle={idle}
      data-morph={morph ?? undefined}
      data-lock-aspect={lockAspect ? '' : undefined}
      data-locked={locked ? '' : undefined}
      data-hidden={layer?.hidden ? '' : undefined}
    >
      <ElProvider value={{ scale, align: a }}>{children}</ElProvider>
    </Tag>
  );
}
