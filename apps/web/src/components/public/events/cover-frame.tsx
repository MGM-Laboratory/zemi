'use client';

import { motion, useMotionTemplate, useSpring } from 'motion/react';
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { Accent, ImageRef } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { DistortImage } from '@/components/three/distort-image';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './events.module.css';
import { ACCENT_SHAPE, accentVars } from './lib';

export interface CoverFrameProps {
  cover: ImageRef | null;
  accent: Accent;
  alt?: string;
  sizes: string;
  priority?: boolean;
  /** Max tilt in degrees. Default 9. */
  maxTilt?: number;
  /** Liquid hover on the image (hero). */
  distort?: boolean;
  /** Floating layers (badges) that sit in front of the cover, parallaxing with the tilt. */
  children?: ReactNode;
  className?: string;
  /** Resting rotation in degrees (a little tossed-on-the-table feel). */
  rest?: number;
  style?: CSSProperties;
}

/**
 * The 4:5 event cover in an accent color frame, with pointer tilt, depth layers and a glare.
 * The image stays a real <picture>; badges go in `children` (they float at translateZ).
 */
export function CoverFrame({
  cover,
  accent,
  alt,
  sizes,
  priority,
  maxTilt = 9,
  distort,
  children,
  className,
  rest = 0,
  style,
}: CoverFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 170, damping: 20 });
  const ry = useSpring(0, { stiffness: 170, damping: 20 });
  const lift = useSpring(0, { stiffness: 240, damping: 22 });
  const gx = useSpring(50, { stiffness: 200, damping: 30 });
  const gy = useSpring(20, { stiffness: 200, damping: 30 });
  const glare = useMotionTemplate`radial-gradient(520px circle at ${gx}% ${gy}%, rgb(255 255 255 / 0.42), transparent 55%)`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * maxTilt);
    rx.set(-(py - 0.5) * 2 * maxTilt);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const onEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && !prefersReducedMotion()) lift.set(1);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    lift.set(0);
  };

  const image = (
    <ZemiImage
      image={cover}
      aspect="4/5"
      sizes={sizes}
      priority={priority}
      alt={alt}
      className={styles.coverImg}
      placeholderShape={ACCENT_SHAPE[accent]}
      fallback={
        <span className={styles.coverFallback} aria-hidden="true">
          <ShapeIcon shape={ACCENT_SHAPE[accent]} size="38%" color="var(--accent)" />
        </span>
      }
    />
  );

  return (
    <motion.div
      ref={ref}
      className={cn(styles.frame, className)}
      data-lift=""
      style={{
        ...accentVars(accent),
        rotateX: rx,
        rotateY: ry,
        rotateZ: rest,
        transformPerspective: 1100,
        ...style,
      }}
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <div className={styles.frameInner}>
        {distort ? <DistortImage strength={26}>{image}</DistortImage> : image}
        <motion.span
          className={styles.frameGlare}
          style={{ backgroundImage: glare, opacity: lift }}
          aria-hidden="true"
        />
      </div>
      {children ? <div className={styles.frameLayers}>{children}</div> : null}
    </motion.div>
  );
}
