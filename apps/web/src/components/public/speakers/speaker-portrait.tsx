'use client';

import { motion, type MotionValue } from 'motion/react';
import type { CSSProperties } from 'react';
import { initials, type ImageRef } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { frameMask, speakerLook } from './lib';
import styles from './speakers.module.css';

export interface SpeakerPortraitProps {
  slug: string;
  name: string;
  image: ImageRef | null;
  /** Real `sizes` for the photo (portraits top out at 512w). */
  sizes: string;
  /** Hovered / focused: the photo squishes and the backdrop spins a little. */
  active?: boolean;
  /** Shuffle counter: re-rolls the backdrop shape and tilt. */
  deal?: number;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Inset of the photo inside the square box, so the backdrop can peek out. Default 9%. */
  inset?: string;
  /** Scroll parallax offsets (px) for the backdrop and the photo layers. */
  parallax?: { backdrop?: MotionValue<number>; photo?: MotionValue<number> };
}

const SQUISH = { scaleX: [1, 1.08, 0.97, 1.015, 1], scaleY: [1, 0.9, 1.04, 0.99, 1] };

/**
 * A person's portrait inside their frame shape (arch, circle, rounded square or drop), sitting
 * on a brand shape. Same person, same frame everywhere. Decorative: the name is always next to it.
 */
export function SpeakerPortrait({
  slug,
  name,
  image,
  sizes,
  active = false,
  deal = 0,
  priority,
  className,
  style,
  inset = '9%',
  parallax,
}: SpeakerPortraitProps) {
  const reduced = useReducedMotion();
  const look = speakerLook(slug, deal);
  const mask = frameMask(look.frame);
  const text = initials(name) || '?';

  return (
    <span className={cn(styles.portrait, className)} style={style} aria-hidden="true">
      <motion.span
        className={styles.layer}
        style={parallax?.backdrop ? { y: parallax.backdrop } : undefined}
      >
        <motion.span
          className={styles.backdrop}
          initial={false}
          animate={
            reduced
              ? { x: `${look.dx}%`, y: `${look.dy}%`, rotate: look.tilt, scale: 1 }
              : {
                  x: `${look.dx * (active ? 1.35 : 1)}%`,
                  y: `${look.dy * (active ? 1.35 : 1)}%`,
                  rotate: look.tilt + (active ? 24 : 0),
                  scale: active ? 1.06 : 1,
                }
          }
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <ShapeIcon shape={look.backdrop} size="100%" color={look.color} />
        </motion.span>
      </motion.span>
      <motion.span
        className={styles.layer}
        style={parallax?.photo ? { y: parallax.photo } : undefined}
      >
        <motion.span
          className={styles.photo}
          style={{
            inset,
            WebkitMaskImage: mask,
            maskImage: mask,
            backgroundColor: image?.color ?? undefined,
          }}
          initial={false}
          animate={active && !reduced ? SQUISH : { scaleX: 1, scaleY: 1 }}
          transition={
            active && !reduced
              ? { duration: 0.6, ease: 'easeOut', times: [0, 0.25, 0.55, 0.8, 1] }
              : { duration: 0.3 }
          }
        >
          {image ? (
            <ZemiImage image={image} fill sizes={sizes} alt="" priority={priority} />
          ) : (
            <span className={styles.initials} style={{ fontSize: 'clamp(1.75rem, 30cqi, 5rem)' }}>
              {text}
            </span>
          )}
        </motion.span>
      </motion.span>
    </span>
  );
}
