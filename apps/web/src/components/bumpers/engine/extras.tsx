'use client';

import { BUMPER_ELEMENT_TYPES, jakartaTimeInput, type BumperElement, type ShapeName } from '@zemi/shared';
import type { CSSProperties } from 'react';
import { BumperCharacter, type CharMood } from '../parts/character';
import { Countdown, countdownTarget } from '../parts/countdown';
import { BrandQr, QR_TONES } from '../parts/qr';
import { BrandShape, BumperImage, StaticMark, Wordmark } from '../parts/shapes';
import { Sticker } from '../parts/stickers';
import { useBumperNow } from './clock';
import { useSlide } from './context';
import { fontStyle, type BumperFont } from './fit-text';
import { toneHex } from './palette';
import type { EnterKind } from './types';

const SHAPES: ReadonlySet<string> = new Set(['circle', 'triangle', 'square', 'arch']);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Default props for a new free element (the builder's "+ Add" menu uses these). */
export function defaultExtraProps(type: BumperElement['type']): BumperElement['props'] {
  switch (type) {
    case 'text':
      return { text: 'Double-click to edit', font: 'display', size: 96, weight: 900, casl: 0.3, tone: 'ink', align: 'start' };
    case 'image':
      return { assetId: null, fit: 'cover', radius: 24 };
    case 'qr':
      return { url: '', style: 'rounded', tone: 'ink', logo: true, label: '' };
    case 'shape':
      return { shape: 'circle', tone: 'blue', eyes: false };
    case 'character':
      return { shape: 'circle', mood: 'happy' };
    case 'sticker':
      return { sticker: 'spark' };
    case 'clock':
      return { tone: 'ink', size: 96 };
    case 'countdown':
      return { to: '', minutes: 5, tone: 'ink', variant: 'big', size: 160, done: 'Now' };
    case 'logo':
      return { tone: 'color', wordmark: true };
    case 'line':
      return { tone: 'accent', thickness: 8, style: 'solid' };
    default:
      return {};
  }
}

/** Default size for a new free element, centered on the canvas. */
export function defaultExtraBox(type: BumperElement['type']): BumperElement['box'] {
  const size: Record<string, [number, number]> = {
    text: [900, 160],
    image: [640, 420],
    qr: [360, 360],
    shape: [240, 240],
    character: [220, 220],
    sticker: [180, 180],
    clock: [360, 120],
    countdown: [640, 200],
    logo: [420, 120],
    line: [600, 24],
  };
  const [w, h] = size[type] ?? [400, 200];
  return { x: Math.round((1920 - w) / 2), y: Math.round((1080 - h) / 2), w, h };
}

export const EXTRA_LABELS: Record<BumperElement['type'], string> = {
  text: 'Text',
  image: 'Image',
  qr: 'QR code',
  shape: 'Shape',
  character: 'Character',
  sticker: 'Sticker',
  clock: 'Clock',
  countdown: 'Countdown',
  logo: 'Logo',
  line: 'Line',
};

function LiveClock({ size, color }: { size: number; color: string }) {
  const now = useBumperNow(1000);
  return (
    <span suppressHydrationWarning style={{ ...fontStyle('mono', { weight: 700 }), fontSize: size, color, lineHeight: 1 }}>
      {jakartaTimeInput(new Date(now))}
    </span>
  );
}

function ExtraBody({ el }: { el: BumperElement }) {
  const ctx = useSlide();
  const p = el.props;
  const color = toneHex(str(p.tone, 'ink') as never, ctx.colors);
  switch (el.type) {
    case 'text': {
      const font = (['display', 'body', 'mono'].includes(str(p.font)) ? str(p.font) : 'display') as BumperFont;
      const align = str(p.align, 'start');
      const style: CSSProperties = {
        ...fontStyle(font, { weight: num(p.weight, font === 'body' ? 500 : 900), casl: num(p.casl, 0.3) }),
        fontSize: num(p.size, 96) * ctx.slide.style.textScale,
        lineHeight: font === 'body' ? 1.35 : 0.98,
        color,
        textAlign: align === 'center' ? 'center' : align === 'end' ? 'right' : 'left',
        textTransform: bool(p.uppercase, false) ? 'uppercase' : undefined,
        whiteSpace: 'pre-wrap',
        width: '100%',
      };
      const hl = str(p.highlight);
      return (
        <span data-split-target="" style={style}>
          {hl ? <mark style={{ background: `linear-gradient(transparent 55%, ${toneHex(hl as never, ctx.colors)}88 55%)`, color: 'inherit', padding: '0 0.08em' }}>{ctx.fill(str(p.text))}</mark> : ctx.fill(str(p.text))}
        </span>
      );
    }
    case 'image': {
      const img = p.assetId ? ctx.data.images[str(p.assetId)] : undefined;
      if (!img) return <div style={{ width: '100%', height: '100%', borderRadius: num(p.radius, 24), background: ctx.colors.dark ? 'rgba(255,255,255,0.08)' : '#f1f1ee', border: `3px dashed ${ctx.colors.line}` }} />;
      return <BumperImage image={img} width={el.box.w} fit={str(p.fit) === 'contain' ? 'contain' : 'cover'} radius={num(p.radius, 24)} />;
    }
    case 'qr': {
      const url = ctx.fill(str(p.url)) || ctx.site.qnaUrl;
      const label = ctx.fill(str(p.label));
      const qrColor = QR_TONES[str(p.tone, 'ink')] ?? QR_TONES.ink!;
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minHeight: 0, aspectRatio: '1 / 1', maxWidth: '100%' }}>
            <BrandQr value={url} style={(str(p.style, ctx.theme.qrStyle) as never) || 'rounded'} color={qrColor} logo={bool(p.logo, true)} />
          </div>
          {label ? <span style={{ ...fontStyle('mono'), fontSize: 26, color: ctx.colors.fg }}>{label}</span> : null}
        </div>
      );
    }
    case 'shape': {
      const shape = (SHAPES.has(str(p.shape)) ? str(p.shape) : 'circle') as ShapeName;
      if (bool(p.eyes, false)) return <BumperCharacter shape={shape} color={color} mood="idle" />;
      return <BrandShape shape={shape} color={color} />;
    }
    case 'character': {
      const shape = (SHAPES.has(str(p.shape)) ? str(p.shape) : 'circle') as ShapeName;
      return <BumperCharacter shape={shape} mood={str(p.mood, 'happy') as CharMood} lookX={num(p.lookX, 0)} lookY={num(p.lookY, 0)} name={`extra-${el.id}`} />;
    }
    case 'sticker':
      return <Sticker name={str(p.sticker, 'spark')} />;
    case 'clock':
      return <LiveClock size={num(p.size, 96)} color={color} />;
    case 'countdown': {
      const target = countdownTarget(str(p.to), ctx.event?.startsAt) ?? null;
      return <Countdown to={target ?? (ctx.mode === 'live' ? null : null)} done={ctx.fill(str(p.done, 'Now'))} variant={(str(p.variant, 'big') as 'big') || 'big'} size={num(p.size, 160)} color={color} accent={ctx.colors.accentHex} />;
    }
    case 'logo':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: el.box.h * 0.2, height: '100%' }}>
          <div style={{ height: '100%', aspectRatio: '1 / 1' }}>
            <StaticMark tone={(str(p.tone, 'color') as 'color') || 'color'} />
          </div>
          {bool(p.wordmark, true) ? <Wordmark style={{ fontSize: el.box.h * 0.9, color: ctx.colors.fg }} /> : null}
        </div>
      );
    case 'line': {
      const t = num(p.thickness, 8);
      const style = str(p.style, 'solid');
      if (style === 'squiggle') {
        const w = el.box.w;
        let d = `M0 ${el.box.h / 2}`;
        for (let x = 0; x < w; x += 40) d += ` q10 -14 20 0 t20 0`;
        return (
          <svg width="100%" height="100%" viewBox={`0 0 ${w} ${el.box.h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            <path d={d} fill="none" stroke={color} strokeWidth={t} strokeLinecap="round" data-draw="" />
          </svg>
        );
      }
      return <div style={{ width: '100%', height: t, borderRadius: t, background: style === 'dashed' ? `repeating-linear-gradient(90deg, ${color} 0 ${t * 3}px, transparent ${t * 3}px ${t * 5}px)` : color, alignSelf: 'center', margin: 'auto 0' }} />;
    }
    default:
      return null;
  }
}

const ENTER_FOR: Record<BumperElement['type'], EnterKind> = {
  text: 'rise',
  image: 'wipe',
  qr: 'pop',
  shape: 'pop',
  character: 'drop',
  sticker: 'spin',
  clock: 'fade',
  countdown: 'rise',
  logo: 'pop',
  line: 'wipe',
};

/** Free elements added in the builder, on top of the template. */
export function Extras() {
  const ctx = useSlide();
  const list = ctx.slide.extras.filter((e) => (BUMPER_ELEMENT_TYPES as readonly string[]).includes(e.type));
  if (!list.length) return null;
  return (
    <>
      {list.map((el, i) => {
        const enter = (typeof el.props.enter === 'string' ? el.props.enter : ENTER_FOR[el.type]) as EnterKind;
        return (
          <div
            key={el.id}
            data-el={`x:${el.id}`}
            data-el-label={EXTRA_LABELS[el.type]}
            data-extra={el.type}
            data-box={`${el.box.x},${el.box.y},${el.box.w},${el.box.h}`}
            data-default-box={`${el.box.x},${el.box.y},${el.box.w},${el.box.h}`}
            data-enter={enter}
            data-order={num(el.props.order, 6 + i * 0.5)}
            data-lock-aspect={el.type === 'qr' || el.type === 'character' || el.type === 'sticker' ? '' : undefined}
            style={{ position: 'absolute', left: el.box.x, top: el.box.y, width: el.box.w, height: el.box.h, rotate: el.rotate ? `${el.rotate}deg` : undefined, zIndex: 30 + el.z, display: 'flex', alignItems: 'center' }}
          >
            <ExtraBody el={el} />
          </div>
        );
      })}
    </>
  );
}
