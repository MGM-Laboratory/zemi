'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useElScope } from './context';

export const FONT_DISPLAY = 'var(--font-recursive), "Recursive", ui-sans-serif, system-ui, sans-serif';
export const FONT_BODY = 'var(--font-atkinson), "Atkinson Hyperlegible Next", ui-sans-serif, system-ui, sans-serif';

export type BumperFont = 'display' | 'body' | 'mono';

/** Font styles for the three roles (DESIGN.md typography, sized in canvas px). */
export function fontStyle(font: BumperFont, opts: { weight?: number; casl?: number; tracking?: number } = {}): CSSProperties {
  if (font === 'body') {
    return { fontFamily: FONT_BODY, fontWeight: opts.weight ?? 500, letterSpacing: `${opts.tracking ?? 0}em` };
  }
  if (font === 'mono') {
    return {
      fontFamily: FONT_DISPLAY,
      fontWeight: opts.weight ?? 600,
      fontVariationSettings: `"MONO" 1, "CASL" 0`,
      letterSpacing: `${opts.tracking ?? 0.06}em`,
    };
  }
  return {
    fontFamily: FONT_DISPLAY,
    fontWeight: opts.weight ?? 900,
    // --casl lets entrances tween the casual axis (formal to Friday chat) without re-rendering.
    fontVariationSettings: `"MONO" 0, "CASL" var(--casl, ${opts.casl ?? 0.2})`,
    letterSpacing: `${opts.tracking ?? -0.035}em`,
  };
}

export interface FitTextProps {
  children: ReactNode;
  /** Largest font size in canvas px (multiplied by the element scale). */
  max: number;
  /** Smallest font size before the text is allowed to overflow (clipped with an ellipsis). */
  min?: number;
  font?: BumperFont;
  weight?: number;
  casl?: number;
  tracking?: number;
  lineHeight?: number;
  /** Vertical placement inside the box. */
  valign?: 'start' | 'center' | 'end';
  uppercase?: boolean;
  balance?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Marks the text node for split/scramble entrances (default true). */
  split?: boolean;
}

const cache = new Map<string, number>();
const CACHE_MAX = 3000;

function fits(outer: HTMLElement, inner: HTMLElement) {
  return inner.scrollHeight <= outer.clientHeight + 1 && inner.scrollWidth <= outer.clientWidth + 1;
}

/**
 * Text that shrinks to fit its element box. Sizes are measured in canvas px (layout sizes are not
 * affected by the stage's CSS scale), cached, and re-measured once web fonts finish loading.
 */
export function FitText({ children, max, min, font = 'display', weight, casl, tracking, lineHeight, valign = 'start', uppercase, balance = true, className, style, split = true }: FitTextProps) {
  const { scale, align } = useElScope();
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const hi = Math.max(8, max * scale);
  const lo = Math.max(6, (min ?? Math.round(max * 0.35)) * scale);
  const lh = lineHeight ?? (font === 'display' ? 0.95 : font === 'mono' ? 1.2 : 1.35);
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null;
  const [size, setSize] = useState(hi);
  const [fontsTick, setFontsTick] = useState(0);
  const [boxTick, setBoxTick] = useState(0);

  // Refit when the element box changes size (the builder resizes it, a variant swap, a reset).
  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer || typeof ResizeObserver === 'undefined') return;
    let last = `${outer.clientWidth}x${outer.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const now = `${outer.clientWidth}x${outer.clientHeight}`;
      if (now !== last) {
        last = now;
        setBoxTick((n) => n + 1);
      }
    });
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const fontsApi = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fontsApi || fontsApi.status === 'loaded') return;
    let alive = true;
    void fontsApi.ready.then(() => alive && setFontsTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const key = text !== null ? `${font}|${weight}|${casl}|${tracking}|${lh}|${uppercase}|${outer.clientWidth}x${outer.clientHeight}|${hi}|${lo}|${text}` : null;
    const loaded = typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded';
    if (key && loaded && cache.has(key)) {
      setSize(cache.get(key)!);
      return;
    }
    let a = lo;
    let b = hi;
    inner.style.fontSize = `${b}px`;
    if (fits(outer, inner)) {
      setSize(b);
      if (key && loaded) remember(key, b);
      return;
    }
    for (let i = 0; i < 9; i++) {
      const mid = (a + b) / 2;
      inner.style.fontSize = `${mid}px`;
      if (fits(outer, inner)) a = mid;
      else b = mid;
    }
    const best = Math.floor(a);
    inner.style.fontSize = `${best}px`;
    setSize(best);
    if (key && loaded) remember(key, best);
  }, [text, children, hi, lo, font, weight, casl, tracking, lh, uppercase, fontsTick, boxTick]);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: valign === 'center' ? 'center' : valign === 'end' ? 'flex-end' : 'flex-start',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        ref={innerRef}
        data-fit=""
        data-split-target={split ? '' : undefined}
        style={{
          ...fontStyle(font, { weight, casl, tracking }),
          display: 'block',
          fontSize: size,
          lineHeight: lh,
          textAlign: align === 'start' ? 'left' : align === 'end' ? 'right' : 'center',
          textTransform: uppercase ? 'uppercase' : undefined,
          textWrap: balance ? 'balance' : undefined,
          overflowWrap: 'break-word',
          width: '100%',
        }}
      >
        {children}
      </span>
    </div>
  );
}

function remember(key: string, v: number) {
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, v);
}
