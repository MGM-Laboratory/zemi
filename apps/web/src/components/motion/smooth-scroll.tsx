'use client';

import 'lenis/dist/lenis.css';
import { ReactLenis, useLenis, type LenisRef } from 'lenis/react';
import type { LenisOptions } from 'lenis';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { gsap, ScrollTrigger } from './gsap';

export interface SmoothScrollProps {
  children: ReactNode;
  options?: Omit<LenisOptions, 'autoRaf'>;
}

const DEFAULTS: LenisOptions = {
  lerp: 0.11,
  wheelMultiplier: 1,
  anchors: { offset: -96 },
  allowNestedScroll: true,
  stopInertiaOnNavigate: true,
  // Never smooth wheel events inside dialogs, sheets, menus or anything marked data-lenis-prevent.
  prevent: (node) =>
    !!node.closest?.('[role="dialog"], [data-radix-popper-content-wrapper], [data-lenis-prevent], [data-radix-scroll-area-viewport]'),
};

/**
 * Lenis smooth scroll driven by the GSAP ticker, with ScrollTrigger kept in sync.
 * Disabled (native scroll) under prefers-reduced-motion. Touch devices keep native scroll.
 * On a new route (not back/forward) it jumps to the top and refreshes ScrollTrigger.
 */
export function SmoothScroll({ children, options }: SmoothScrollProps) {
  const reduced = useReducedMotion();
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    if (reduced) return;
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(update);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, [reduced]);

  return (
    <>
      {reduced ? null : <ReactLenis root options={{ ...DEFAULTS, ...options, autoRaf: false }} ref={lenisRef} />}
      <ScrollSync />
      {children}
    </>
  );
}

function ScrollSync() {
  const lenis = useLenis(() => ScrollTrigger.update());
  const pathname = usePathname();
  const popped = useRef(false);
  const lastPath = useRef(pathname);

  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    // Only on a real route change (not mount, not StrictMode re-runs, not lenis arriving).
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const wasPop = popped.current;
    popped.current = false;
    if (!wasPop && !window.location.hash) {
      lenis?.scrollTo(0, { immediate: true, force: true });
    } else {
      lenis?.resize();
    }
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [pathname, lenis]);

  return null;
}

/**
 * Pause smooth scrolling while something modal is open (menus, dialogs, sheets).
 * @example useScrollLock(open)
 */
export function useScrollLock(active: boolean) {
  const lenis = useLenis();
  useEffect(() => {
    if (!active || !lenis) return;
    lenis.stop();
    return () => lenis.start();
  }, [active, lenis]);
}

export { useLenis };
