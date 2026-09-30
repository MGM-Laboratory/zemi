'use client';

import type { BumperData, BumperSlide, BumperTheme } from '@zemi/shared';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import { Backdrop } from '../parts/backdrop';
import { Bug, CornerClock } from '../parts/bug';
import { getTemplate } from '../templates';
import { buildEntrance, buildExit, prepareEntrance, settle, startIdle } from './choreography';
import { useNowFn } from './clock';
import { createRegistry, SlideProvider } from './context';
import { Extras } from './extras';
import { FONT_BODY } from './fit-text';
import type { gsap } from './gsap';
import { buildResolveCtx } from './resolve';
import type { ResolveCtx, SlideMode, TemplateDefinition } from './types';

export interface SlideHandle {
  root: HTMLDivElement | null;
  slide: BumperSlide;
  ctx: ResolveCtx;
  template: TemplateDefinition;
  /** Hide every entering element (call before the slide becomes visible). */
  prepare(): void;
  /** Build the entrance, paused. */
  buildEnter(speed?: number): gsap.core.Timeline;
  /** Build and play the entrance; idle loops start when it ends. */
  enter(speed?: number): gsap.core.Timeline;
  startIdle(): void;
  stopIdle(): void;
  /** Final state, no animation, no idle. */
  settle(): void;
  /** A quick generic exit (some transitions use it). */
  exit(): gsap.core.Timeline;
  /** Short text a transition can flash. */
  headline(): string;
  /** Elements with a data-morph key (magic move). */
  morphTargets(): Map<string, HTMLElement>;
  /** Resolves when fonts and images are ready (capped). */
  ready(capMs?: number): Promise<void>;
}

export interface SlideViewProps {
  slide: BumperSlide;
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  mode: SlideMode;
  /** Live mode only: play the entrance on mount (gallery hover, lab). */
  autoplay?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<SlideHandle>;
}

async function waitImages(root: HTMLElement, capMs: number) {
  const imgs = Array.from(root.querySelectorAll('img'));
  const svgImgs = Array.from(root.querySelectorAll('image'));
  const all = [
    ...imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
    ...svgImgs.map(
      (im) =>
        new Promise<void>((resolve) => {
          const href = im.getAttribute('href');
          if (!href) return resolve();
          const probe = new Image();
          probe.onload = probe.onerror = () => resolve();
          probe.src = href;
        }),
    ),
  ];
  const fonts = typeof document !== 'undefined' && document.fonts ? document.fonts.ready.then(() => undefined) : Promise.resolve();
  await Promise.race([Promise.all([...all, fonts]), new Promise((r) => setTimeout(r, capMs))]);
}

/**
 * One bumper on the fixed 1920x1080 canvas. Place it inside <BumperStage>. The template draws the
 * content; this adds the backdrop, free elements, the corner bug and clock, and exposes the
 * choreography through an imperative handle (the director and the player drive it).
 */
export function SlideView({ slide, theme, data, showEventId, mode, autoplay, className, style, ref }: SlideViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [registry] = useState(createRegistry);
  const idleStop = useRef<(() => void) | null>(null);
  const entrance = useRef<gsap.core.Timeline | null>(null);
  const nowFn = useNowFn();
  const template = getTemplate(slide.kind);
  const ctx = useMemo(() => buildResolveCtx({ slide, theme, data, mode, showEventId, template, now: nowFn }), [slide, theme, data, mode, showEventId, template, nowFn]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const handle = useMemo<SlideHandle>(() => {
    const h: SlideHandle = {
      get root() {
        return rootRef.current;
      },
      get slide() {
        return ctxRef.current.slide;
      },
      get ctx() {
        return ctxRef.current;
      },
      get template() {
        return getTemplate(ctxRef.current.slide.kind);
      },
      prepare() {
        prepareEntrance(rootRef.current);
      },
      buildEnter(speed = 1) {
        const root = rootRef.current!;
        entrance.current?.kill();
        settle(root);
        const tl = buildEntrance(root, { motion: ctxRef.current.theme.motion, speed }, registry.enter);
        entrance.current = tl;
        return tl;
      },
      enter(speed = 1) {
        h.stopIdle();
        const tl = h.buildEnter(speed);
        tl.eventCallback('onComplete', () => h.startIdle());
        tl.play(0);
        return tl;
      },
      startIdle() {
        if (!rootRef.current || ctxRef.current.mode !== 'live') return;
        idleStop.current?.();
        idleStop.current = startIdle(rootRef.current, { motion: ctxRef.current.theme.motion }, registry.idle);
      },
      stopIdle() {
        idleStop.current?.();
        idleStop.current = null;
      },
      settle() {
        entrance.current?.kill();
        entrance.current = null;
        h.stopIdle();
        settle(rootRef.current);
      },
      exit() {
        h.stopIdle();
        return buildExit(rootRef.current!, { motion: ctxRef.current.theme.motion });
      },
      headline() {
        const c = ctxRef.current;
        const t = getTemplate(c.slide.kind);
        return (t.headline?.(c) ?? c.text('title')) || t.describe?.(c) || c.slide.label || '';
      },
      morphTargets() {
        const map = new Map<string, HTMLElement>();
        rootRef.current?.querySelectorAll<HTMLElement>('[data-morph]').forEach((el) => {
          if (el.dataset.morph) map.set(el.dataset.morph, el);
        });
        return map;
      },
      ready(capMs = 700) {
        return rootRef.current ? waitImages(rootRef.current, capMs) : Promise.resolve();
      },
    };
    return h;
  }, [registry]);

  useImperativeHandle(ref, () => handle, [handle]);

  // Live slides start hidden-for-entrance; static modes always show their final state.
  useLayoutEffect(() => {
    if (mode === 'live') handle.prepare();
    else handle.settle();
  }, [mode, handle]);

  useEffect(() => {
    if (mode !== 'live' || !autoplay) return;
    let cancelled = false;
    void handle.ready(500).then(() => {
      if (!cancelled) handle.enter();
    });
    return () => {
      cancelled = true;
      handle.settle();
    };
  }, [mode, autoplay, handle]);

  // Edits in the builder re-render content; keep static modes settled.
  useLayoutEffect(() => {
    if (mode !== 'live') settle(rootRef.current);
  });

  useEffect(() => () => handle.stopIdle(), [handle]);

  const Render = template.Render;
  const bg = ctx.background;
  const overlay = template.overlay || bg === 'transparent';
  const showBug = theme.bug && !template.noBug && !overlay;
  const shrink = theme.safeArea && !overlay;
  return (
    <SlideProvider value={{ ctx, registry }}>
      <div
        ref={rootRef}
        className={className}
        data-bumper-slide={slide.id}
        data-kind={slide.kind}
        data-mode={mode}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          overflow: 'hidden',
          background: overlay ? 'transparent' : ctx.colors.bg,
          color: ctx.colors.fg,
          fontFamily: FONT_BODY,
          isolation: 'isolate',
          contain: 'layout paint',
          ...style,
        }}
      >
        {overlay ? null : <Backdrop kind={bg} colors={ctx.colors} image={ctx.backgroundImage} dim={slide.style.dim} floaters={template.kind === 'blank' ? false : undefined} />}
        <div data-content="" style={{ position: 'absolute', inset: 0, zIndex: 1, transform: shrink ? 'scale(0.95)' : undefined, transformOrigin: '50% 50%' }}>
          <Render />
          <Extras />
        </div>
        {showBug ? <Bug colors={ctx.colors} number={ctx.event?.number ?? null} corner={template.kind === 'welcome' || template.kind === 'closing' ? 'bottom-left' : 'top-left'} /> : null}
        {theme.clock && !overlay ? <CornerClock colors={ctx.colors} /> : null}
      </div>
    </SlideProvider>
  );
}
