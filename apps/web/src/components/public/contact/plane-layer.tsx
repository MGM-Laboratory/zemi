'use client';

import { createContext, lazy, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SceneCanvas } from '@/components/three/scene-canvas';
import { hasWebGL } from '@/components/three/webgl';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './contact.module.css';
import { PlaneBus, type PlaneMode } from './plane-bus';

const PaperPlaneScene = lazy(() => import('./paper-plane-scene'));

const noop = () => () => {};

interface PlaneCtx {
  bus: PlaneBus;
  /** Draw the flat SVG plane instead of the 3D one. */
  flat: boolean;
}
const Ctx = createContext<PlaneCtx | null>(null);

export function usePlane(): PlaneBus {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlane() must be used inside <PlaneStage>.');
  return ctx.bus;
}

function usePlaneMode(bus: PlaneBus): { mode: PlaneMode; live: boolean } {
  const [state, setState] = useState({ mode: bus.mode, live: bus.live });
  useEffect(() => bus.subscribe((mode) => setState({ mode, live: bus.live })), [bus]);
  return state;
}

/**
 * Wraps the contact hero + form. Owns the plane bus and one WebGL canvas covering the whole
 * stage (pointer-events none, aria-hidden) so the plane can leave its perch and fly off the top.
 * Reduced motion or no WebGL: a flat SVG plane in the dock does a short CSS flight instead.
 */
export function PlaneStage({ children, className }: { children: ReactNode; className?: string }) {
  const [bus] = useState(() => new PlaneBus());
  const reduced = useReducedMotion();
  const webgl = useSyncExternalStore(noop, hasWebGL, () => null);
  const wide = useMediaQuery('(min-width: 768px)', true);
  const flat = reduced || webgl === false;

  return (
    <Ctx.Provider value={{ bus, flat }}>
      <div className={cn('relative isolate', className)}>
        {children}
        {!flat && webgl ? (
          <SceneCanvas
            className={styles.planeLayer}
            camera={{ position: [0, 0, 20], fov: 22 }}
            studio={{ shadows: false, intensity: 1.05 }}
            placeholder={null}
            fallback={null}
            rootMargin="20% 0px"
          >
            <PaperPlaneScene bus={bus} sizePx={wide ? 124 : 88} />
          </SceneCanvas>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Where the plane perches (put it on the form card). Renders the flat plane when there is no
 * 3D one, and until the 3D plane is on screen.
 */
export function PlaneDock({ className }: { className?: string }) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLSpanElement>(null);
  const bus = ctx?.bus;
  const { mode, live } = usePlaneMode(bus ?? FALLBACK_BUS);

  useEffect(() => {
    const el = ref.current;
    if (!bus) return;
    bus.setDock(el);
    return () => bus.setDock(null, el);
  }, [bus]);

  // The flat plane runs its own short flight and reports back like the 3D one.
  const showFlat = !!ctx && (ctx.flat || !live);
  useEffect(() => {
    if (!bus || !showFlat) return;
    if (mode === 'launch') {
      const t = setTimeout(() => bus.landed(), 700);
      return () => clearTimeout(t);
    }
    if (mode === 'return') {
      const t = setTimeout(() => bus.docked(), 450);
      return () => clearTimeout(t);
    }
  }, [bus, mode, showFlat]);

  return (
    <span ref={ref} className={cn(styles.dock, className)} aria-hidden="true">
      {showFlat ? (
        <span className={styles.flatPlane} data-mode={mode}>
          <FlatPlane />
        </span>
      ) : null}
    </span>
  );
}

const FALLBACK_BUS = new PlaneBus();

/** The paper plane as a flat drawing (same stickers as the model). */
function FlatPlane() {
  return (
    <svg viewBox="0 0 120 64" className="size-full overflow-visible" focusable="false">
      <path d="M4 30 L116 8 L46 40 Z" fill="#ffffff" stroke="#d8d8d2" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M46 40 L116 8 L56 58 Z" fill="#f3f3ef" stroke="#d8d8d2" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M46 40 L56 58 L40 44 Z" fill="#e4e4de" stroke="#d8d8d2" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="70" cy="24" r="4.2" fill="#3a6dc5" />
      <path d="M86 15.4 Q87.4 13 88.8 15.4 L92 21 Q93 23 90.6 23 L84.2 23 Q81.8 23 82.8 21 Z" fill="#f94141" />
    </svg>
  );
}
