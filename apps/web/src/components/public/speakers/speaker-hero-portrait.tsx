'use client';

import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useRef, useState } from 'react';
import type { ImageRef, ShapeName } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { speakerLook } from './lib';
import { SpeakerPortrait } from './speaker-portrait';

export interface SpeakerHeroPortraitProps {
  slug: string;
  name: string;
  image: ImageRef | null;
}

/**
 * The big portrait on a speaker page: frame shape mask, brand backdrop, scroll parallax on
 * both layers, and the backdrop's character peeking over the edge. The photo itself stays at
 * most ~340 CSS px (seed portraits are small); the shapes carry the size.
 */
export function SpeakerHeroPortrait({ slug, name, image }: SpeakerHeroPortraitProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);
  const look = speakerLook(slug);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  const backdrop = useTransform(p, [0, 1], reduced ? [0, 0] : [0, 70]);
  const photo = useTransform(p, [0, 1], reduced ? [0, 0] : [0, -40]);
  const friend = useTransform(p, [0, 1], reduced ? [0, 0] : [0, -60]);

  return (
    <div
      ref={ref}
      className="relative mx-auto w-full max-w-[min(17rem,68vw)] sm:max-w-[20rem] md:max-w-[26rem]"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(true)}
      onPointerLeave={() => setActive(false)}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setTimeout(() => setActive(false), 500)}
    >
      <SpeakerPortrait
        slug={slug}
        name={name}
        image={image}
        active={active}
        priority
        inset="8%"
        sizes="(min-width: 768px) 360px, 60vw"
        parallax={{ backdrop, photo }}
      />
      <CharacterPeek shape={look.backdrop} y={friend} flip={look.dx > 0} cheer={active} />
    </div>
  );
}

function CharacterPeek({
  shape,
  y,
  flip,
  cheer,
}: {
  shape: ShapeName;
  y: MotionValue<number>;
  flip: boolean;
  cheer: boolean;
}) {
  const [count, setCount] = useState(0);
  const [prev, setPrev] = useState(cheer);
  if (prev !== cheer) {
    setPrev(cheer);
    if (cheer) setCount((c) => c + 1);
  }
  return (
    <motion.div
      className="pointer-events-none absolute bottom-[-4%] z-[2]"
      style={{ y, [flip ? 'left' : 'right']: '-6%' }}
      aria-hidden="true"
    >
      <Character
        shape={shape}
        size="clamp(64px, 9vw, 104px)"
        mood={cheer ? 'happy' : 'idle'}
        cheer={count}
        track
        seed={3}
      />
    </motion.div>
  );
}
