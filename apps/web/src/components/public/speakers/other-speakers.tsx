'use client';

import { useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { SpeakerCard as SpeakerCardData } from '@zemi/shared';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { SpeakerCard } from './speaker-card';
import styles from './speakers.module.css';

/** A horizontal strip of other speakers, snap-scrolling, with arrow buttons on wide screens. */
export function OtherSpeakers({
  speakers,
  renderedAt,
}: {
  speakers: SpeakerCardData[];
  renderedAt: number;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const reduced = useReducedMotion();
  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(240, el.clientWidth * 0.7),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };
  return (
    <div className="relative">
      <div className="container-page mb-2 hidden justify-end gap-2 md:flex">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll back"
          className="grid size-11 place-items-center rounded-full border border-line-strong bg-white text-ink transition-[transform,border-color] hover:border-ink active:scale-90"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll forward"
          className="grid size-11 place-items-center rounded-full border border-line-strong bg-white text-ink transition-[transform,border-color] hover:border-ink active:scale-90"
        >
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      </div>
      <ul ref={ref} className={styles.strip} aria-label="Other speakers">
        {speakers.map((s) => (
          <li key={s.slug} className={styles.stripItem}>
            <SpeakerCard speaker={s} renderedAt={renderedAt} nameAs="h3" compact sizes="220px" />
          </li>
        ))}
      </ul>
    </div>
  );
}
