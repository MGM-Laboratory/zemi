'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import type { ImageRef } from '@zemi/shared';
import { Parallax } from '@/components/motion/reveal';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { SpeakerPortrait } from './speaker-portrait';

export interface FrontRowProps {
  people: Array<{
    slug: string;
    fullName: string;
    nickname: string | null;
    avatar: ImageRef | null;
  }>;
}

const SPOTS = [
  { left: '4%', top: '18%', size: '46%', speed: 0.12, rot: -6 },
  { left: '44%', top: '0%', size: '40%', speed: 0.24, rot: 5 },
  { left: '52%', top: '48%', size: '34%', speed: 0.06, rot: -3 },
];

/** A little collage of the three most frequent speakers for the header. Decorative. */
export function FrontRow({ people }: FrontRowProps) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="relative aspect-[5/4] w-full" aria-hidden="true">
      {people.slice(0, 3).map((p, i) => {
        const spot = SPOTS[i]!;
        return (
          <div
            key={p.slug}
            className="absolute"
            style={{ left: spot.left, top: spot.top, width: spot.size }}
          >
            <Parallax speed={spot.speed}>
              <motion.div
                initial={
                  reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: spot.rot * 3 }
                }
                animate={{ opacity: 1, scale: 1, rotate: spot.rot }}
                transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.3 + i * 0.12 }}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                className="relative"
              >
                <SpeakerPortrait
                  slug={p.slug}
                  name={p.fullName}
                  image={p.avatar}
                  active={active === i}
                  sizes="(min-width: 1024px) 14vw, 30vw"
                  priority={i === 0}
                />
                <span
                  className="display absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[0.9375rem] text-white shadow-2"
                  style={{ fontVariationSettings: "'CASL' 1, 'MONO' 0", rotate: `${-spot.rot}deg` }}
                >
                  {p.nickname || p.fullName.split(/\s+/)[0]}
                </span>
              </motion.div>
            </Parallax>
          </div>
        );
      })}
    </div>
  );
}
