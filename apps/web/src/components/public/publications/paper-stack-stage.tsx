'use client';

import { useMotionValueEvent, useScroll } from 'motion/react';
import { lazy, useRef } from 'react';
import { SceneCanvas } from '@/components/three/scene-canvas';
import { cn } from '@/lib/utils';

const PaperStackScene = lazy(() => import('./paper-stack-scene'));

/**
 * The 3D paper stack in the publications header. The page scroll (while this box passes the
 * top of the viewport) fans the papers out; hovering fans them more. Falls back to the
 * pre-rendered still of the paper-stack prop without WebGL or with reduced motion off-canvas.
 */
export function PaperStackStage({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useRef({ p: 0 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 60%', 'end start'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    scroll.current.p = v;
  });

  const still = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/models/previews/paper-stack.webp"
      alt=""
      width={800}
      height={800}
      className="h-full w-auto max-w-full object-contain"
      draggable={false}
    />
  );

  return (
    <div ref={ref} className={cn('relative', className)} aria-hidden="true">
      <SceneCanvas
        className="absolute inset-0"
        camera={{ position: [0, 0.3, 9], fov: 30 }}
        studio={{ floor: -2.2, shadowOpacity: 0.24, shadowScale: 10 }}
        fallback={still}
        placeholder={null}
        rootMargin="30% 0px"
      >
        <PaperStackScene scroll={scroll} />
      </SceneCanvas>
    </div>
  );
}
