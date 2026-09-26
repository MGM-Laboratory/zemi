'use client';

import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import type { StudioLightsProps } from './studio';
import { hasWebGL } from './webgl';

const noopSubscribe = () => () => {};

/**
 * Frame budget shared by every SceneCanvas on the page: at most MAX_RUNNING render loops at once.
 * Canvases near the viewport compete by how much of them is on screen; the rest hold their last
 * frame (frameloop "never") until they win a slot back.
 */
const MAX_RUNNING = 2;
type BudgetEntry = { ratio: number; order: number; set: (on: boolean) => void; on: boolean };
const budget = new Map<symbol, BudgetEntry>();
let budgetOrder = 0;
function rebalance() {
  const ranked = [...budget.values()]
    .filter((e) => e.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio || a.order - b.order)
    .slice(0, MAX_RUNNING);
  for (const e of budget.values()) {
    const on = ranked.includes(e);
    if (on !== e.on) {
      e.on = on;
      e.set(on);
    }
  }
}

const SceneCanvasImpl = dynamic(() => import('./scene-canvas-impl'), { ssr: false, loading: () => null });

export interface SceneCanvasProps {
  /** R3F content. Load heavy scene modules lazily (see components/three/index.ts). */
  children: ReactNode;
  /** Wrapper classes. Give it a size (h-[60vh], aspect-square, absolute inset-0...). */
  className?: string;
  style?: CSSProperties;
  camera?: { position?: [number, number, number]; fov?: number };
  /** Lighting rig + contact shadows. Default true. Pass props to tune or false to bring your own. */
  studio?: boolean | StudioLightsProps;
  /** Shown when WebGL is missing or the scene crashes. Also the placeholder until mounted. */
  fallback?: ReactNode;
  /** Shown until the scene is ready. Defaults to `fallback`; pass null for nothing. */
  placeholder?: ReactNode;
  /** Mount when this close to the viewport. Default '50% 0px'. */
  rootMargin?: string;
  dpr?: [number, number];
  /** Accessible description of the scene (role="img"). Omit for decorative scenes. */
  label?: string;
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[zemi 3d] scene failed, showing the fallback.', error.message, info.componentStack?.slice(0, 200));
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Lazy R3F canvas for one section (DESIGN.md section 9).
 * - three/R3F load only when the wrapper nears the viewport (never on the server)
 * - frameloop pauses offscreen, and at most two canvases on the page render at once (the ones
 *   most on screen win); `data-scene-running` on the wrapper says which
 * - dpr [1, 1.75], PerformanceMonitor drops quality on slow devices
 * - prefers-reduced-motion renders a still frame
 * - no WebGL or a crash: renders `fallback` (use a 2D Character or an image)
 *
 * @example
 * const Character3D = lazy3d.Character3D; // from '@/components/three'
 * <SceneCanvas className="h-[480px]" fallback={<Character shape="circle" size={200} />}>
 *   <Character3D shape="circle" />
 * </SceneCanvas>
 */
export function SceneCanvas({
  children,
  className,
  style,
  camera,
  studio = true,
  fallback = null,
  placeholder,
  rootMargin = '50% 0px',
  dpr,
  label,
}: SceneCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  // null on the server and during hydration, then the real answer.
  const supported = useSyncExternalStore(noopSubscribe, hasWebGL, () => null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      setVisible(true);
      return;
    }
    const nearIo = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setNear(true);
          nearIo.disconnect();
        }
      },
      { rootMargin },
    );
    const id = Symbol('scene');
    budget.set(id, { ratio: 0, order: budgetOrder++, set: setVisible, on: false });
    const visIo = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        const entry = budget.get(id);
        if (!entry) return;
        entry.ratio = e?.isIntersecting ? Math.max(0.001, e.intersectionRatio) : 0;
        rebalance();
      },
      { rootMargin: '10% 0px', threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] },
    );
    nearIo.observe(el);
    visIo.observe(el);
    return () => {
      nearIo.disconnect();
      visIo.disconnect();
      budget.delete(id);
      rebalance();
    };
  }, [rootMargin]);

  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setGone(true), 600);
    return () => clearTimeout(t);
  }, [ready]);
  const showCanvas = near && supported === true;
  const hold = placeholder === undefined ? fallback : placeholder;

  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      style={style}
      data-scene=""
      data-scene-running={showCanvas && visible && !reduced ? 'true' : 'false'}
    >
      {supported === false ? (
        <div className="absolute inset-0 grid place-items-center">{fallback}</div>
      ) : (
        <>
          {!gone && hold ? (
            <div
              className={cn('absolute inset-0 grid place-items-center transition-opacity duration-500', ready && 'opacity-0')}
              aria-hidden={ready || undefined}
            >
              {hold}
            </div>
          ) : null}
          {showCanvas ? (
            <SceneBoundary fallback={<div className="absolute inset-0 grid place-items-center">{fallback}</div>}>
              <div className={cn('absolute inset-0 transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')}>
              <SceneCanvasImpl
                visible={visible}
                reduced={reduced}
                camera={camera}
                studio={studio}
                dpr={dpr}
                fallback={fallback}
                label={label}
                onReady={onReady}
              >
                {children}
              </SceneCanvasImpl>
              </div>
            </SceneBoundary>
          ) : null}
        </>
      )}
    </div>
  );
}
