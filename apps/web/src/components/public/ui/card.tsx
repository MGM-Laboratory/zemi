'use client';

import { motion, useMotionTemplate, useSpring } from 'motion/react';
import Link from 'next/link';
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { Accent } from '@zemi/shared';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

const ACCENT_BORDER: Record<Accent, string> = {
  blue: 'hover:border-blue/40',
  red: 'hover:border-red/40',
  yellow: 'hover:border-yellow',
  green: 'hover:border-green/40',
};

const ACCENT_TINT: Record<Accent, string> = {
  blue: 'bg-blue-50',
  red: 'bg-red-50',
  yellow: 'bg-yellow-50',
  green: 'bg-green-50',
};

export interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** 3D hover tilt toward the pointer. Default true (fine pointers only, off under reduced motion). */
  tilt?: boolean;
  /** Max tilt in degrees. Default 5. */
  maxTilt?: number;
  /** Tints hover border (and the surface with `tinted`). */
  accent?: Accent;
  tinted?: boolean;
  /** Graph paper surface (register form, ticket). */
  graph?: boolean;
  as?: 'div' | 'article' | 'li' | 'section';
  /** Custom cursor label. */
  cursor?: 'play' | 'drag' | 'open' | 'register';
}

/**
 * Card shell: 28px radius, hairline border, soft lift + pointer tilt with a glare on hover.
 * Put a stretched link inside for clickable cards (see `CardLink`).
 *
 * @example <Card accent={event.accent}><CardLink href={`/events/${event.slug}`}>{event.title}</CardLink></Card>
 */
export function Card({
  children,
  className,
  style,
  tilt = true,
  maxTilt = 5,
  accent,
  tinted,
  graph,
  as = 'div',
  cursor,
}: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 180, damping: 22 });
  const ry = useSpring(0, { stiffness: 180, damping: 22 });
  const lift = useSpring(0, { stiffness: 260, damping: 24 });
  const gx = useSpring(50, { stiffness: 200, damping: 30 });
  const gy = useSpring(0, { stiffness: 200, damping: 30 });
  const glareX = useMotionTemplate`${gx}%`;
  const glareY = useMotionTemplate`${gy}%`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tilt || e.pointerType !== 'mouse' || prefersReducedMotion()) return;
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
    if (e.pointerType === 'mouse' && !prefersReducedMotion()) lift.set(-4);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    lift.set(0);
  };

  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      ref={ref}
      className={cn(
        styles.card,
        'group/card relative isolate overflow-hidden rounded-[28px] border border-line bg-white hover:shadow-3',
        // Keyboard focus on the stretched CardLink rings the whole card (outline isn't clipped by own overflow).
        'has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-3 has-[[data-card-link]:focus-visible]:outline-focus has-[[data-card-link]:focus-visible]:outline-solid',
        accent && ACCENT_BORDER[accent],
        accent && tinted && ACCENT_TINT[accent],
        graph && styles.graph,
        className,
      )}
      style={{
        rotateX: rx,
        rotateY: ry,
        y: lift,
        transformPerspective: 900,
        ['--gx' as string]: glareX,
        ['--gy' as string]: glareY,
        ...style,
      }}
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      data-cursor={cursor}
    >
      {children}
      {tilt ? <span className={styles.cardGlare} aria-hidden="true" /> : null}
    </Tag>
  );
}

/**
 * A link whose ::after covers the whole card, so the card is clickable while text stays selectable.
 * The focus ring is drawn on the Card itself (see `has-[[data-card-link]:focus-visible]` above):
 * the card is overflow-hidden, so a ring on the ::after would be clipped away.
 */
export function CardLink({ href, children, className, external }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  const cls = cn(
    'outline-none focus-visible:outline-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:content-[""]',
    className,
  );
  const isExternal = external ?? /^https?:\/\//.test(href);
  return isExternal ? (
    <a href={href} className={cls} target="_blank" rel="noopener noreferrer" data-card-link="">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <Link href={href} className={cls} data-card-link="">
      {children}
    </Link>
  );
}
