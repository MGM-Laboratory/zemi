'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import type { gsap } from './gsap';
import type { ResolveCtx } from './types';

/**
 * Entrance contributions. Called while the entrance timeline is being built, after the generic
 * `data-enter` tweens were added. Add bespoke tweens at absolute times (seconds from the start of
 * the entrance), for example a character cheer at 0.6s. `speed` is already folded in by the caller
 * when you use `at(t)`.
 */
export type EnterFn = (tl: gsap.core.Timeline, root: HTMLElement, helpers: { at: (t: number) => number; speed: number; calm: boolean }) => void;
/** Idle loops, started after the entrance finishes. Return a cleanup (or an animation to kill). */
export type IdleFn = (root: HTMLElement, helpers: { calm: boolean }) => (() => void) | gsap.core.Animation | gsap.core.Animation[] | void;

interface Registry {
  enter: Set<{ current: EnterFn }>;
  idle: Set<{ current: IdleFn }>;
}

interface SlideContextValue {
  ctx: ResolveCtx;
  registry: Registry;
}

const SlideContext = createContext<SlideContextValue | null>(null);

export function createRegistry(): Registry {
  return { enter: new Set(), idle: new Set() };
}

export const SlideProvider = SlideContext.Provider;

export function useSlideContextValue(): SlideContextValue {
  const v = useContext(SlideContext);
  if (!v) throw new Error('Bumper hooks must be used inside <SlideView>.');
  return v;
}

/** The resolved slide: data, fields, colors, mode. */
export function useSlide(): ResolveCtx {
  return useSlideContextValue().ctx;
}

/** Add bespoke tweens to this slide's entrance. */
export function useEnter(fn: EnterFn) {
  const { registry } = useSlideContextValue();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const entry = ref;
    registry.enter.add(entry);
    return () => {
      registry.enter.delete(entry);
    };
  }, [registry]);
}

/** Add an idle loop (runs in live mode after the entrance). */
export function useIdle(fn: IdleFn) {
  const { registry } = useSlideContextValue();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const entry = ref;
    registry.idle.add(entry);
    return () => {
      registry.idle.delete(entry);
    };
  }, [registry]);
}

/** Per-element scale from the builder (text size multiplier) and alignment, read by FitText. */
export interface ElScope {
  scale: number;
  align: 'start' | 'center' | 'end';
}
const ElContext = createContext<ElScope>({ scale: 1, align: 'start' });
export const ElProvider = ElContext.Provider;
export function useElScope(): ElScope {
  return useContext(ElContext);
}
