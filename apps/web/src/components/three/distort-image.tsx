'use client';

import { useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';

export interface DistortImageProps {
  children: ReactNode;
  className?: string;
  /** Peak displacement in px. Default 22. */
  strength?: number;
}

/**
 * Liquid hover displacement for covers. Wrap a <ZemiImage/> (or any image). Uses an SVG
 * displacement filter instead of WebGL, so cross-origin media works and nothing extra loads.
 * Fine pointers only; off under reduced motion.
 *
 * @example <DistortImage><ZemiImage image={event.cover} aspect="4/5" /></DistortImage>
 */
export function DistortImage({ children, className, strength = 22 }: DistortImageProps) {
  const id = `zd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const disp = useRef<SVGFEDisplacementMapElement>(null);
  const turb = useRef<SVGFETurbulenceElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const state = useRef({ v: 0, target: 0, seed: 0 });

  const tick = () => {
    const s = state.current;
    s.v += (s.target - s.v) * 0.12;
    s.seed += 0.004 + s.v * 0.01;
    disp.current?.setAttribute('scale', (s.v * strength).toFixed(2));
    turb.current?.setAttribute('baseFrequency', `${(0.012 + Math.sin(s.seed) * 0.002).toFixed(4)} ${(0.018 + Math.cos(s.seed) * 0.003).toFixed(4)}`);
    if (Math.abs(s.target - s.v) > 0.002 || s.target > 0) raf.current = requestAnimationFrame(tick);
    else {
      raf.current = 0;
      wrap.current?.style.setProperty('filter', 'none');
    }
  };

  const begin = (target: number, e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    state.current.target = target;
    wrap.current?.style.setProperty('filter', `url(#${id})`);
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  };
  const onEnter = (e: PointerEvent<HTMLDivElement>) => begin(1, e);
  const onLeave = (e: PointerEvent<HTMLDivElement>) => begin(0, e);

  return (
    <div ref={wrap} className={cn('relative', className)} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence ref={turb} type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap ref={disp} in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {children}
    </div>
  );
}
