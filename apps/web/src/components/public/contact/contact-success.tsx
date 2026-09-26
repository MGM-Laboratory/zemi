'use client';

import { useEffect, useRef } from 'react';
import { SHAPE_ORDER } from '@zemi/shared';
import { Character, type CharacterHandle } from '@/components/brand/character';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { Button } from '@/components/public/ui/button';
import styles from './contact.module.css';
import type { SentMessage } from './contact-form';

export interface ContactSuccessProps {
  sent: SentMessage;
  onAnother: () => void;
}

/** After the plane lands: the crew cheers, shape confetti, and what happens next. */
export function ContactSuccess({ sent, onAnother }: ContactSuccessProps) {
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const crew = useRef<Array<CharacterHandle | null>>([]);
  const first = sent.name.trim().split(/\s+/)[0] ?? sent.name;
  const presenting = /present/i.test(sent.topic);

  useEffect(() => {
    heading.current?.focus({ preventScroll: false });
    void shapeConfetti({ from: root.current, count: 110, spread: 90 });
    const timers = crew.current.map((c, i) => setTimeout(() => c?.cheer(), 180 + i * 110));
    const again = crew.current.map((c, i) => setTimeout(() => c?.cheer(), 1500 + (3 - i) * 110));
    return () => [...timers, ...again].forEach(clearTimeout);
  }, []);

  return (
    <div ref={root} className={styles.success}>
      <div className="flex items-end justify-center gap-[clamp(6px,2vw,16px)]" aria-hidden="true">
        {SHAPE_ORDER.map((shape, i) => (
          <Character
            key={shape}
            ref={(h) => void (crew.current[i] = h)}
            shape={shape}
            mood="happy"
            size={`clamp(${48 + (i % 2) * 6}px, ${8 + (i % 2)}vw, ${84 + (i % 2) * 10}px)`}
            seed={i}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <p className="label text-green-600">Message sent</p>
        <h2
          ref={heading}
          tabIndex={-1}
          className="display text-display-m text-ink outline-none"
          style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
        >
          Plane landed. Thanks, {first}.
        </h2>
        <p className="text-body-l max-w-[34rem] text-ink-2">
          {presenting ? 'A talk! We love that. We will write back to ' : 'A real human will read it and write back to '}
          <strong className="font-bold text-ink">{sent.email}</strong>
          {presenting
            ? ' to find you a Friday. Start thinking about a working title (it will change anyway).'
            : ', usually within two working days. We sent a little copy to your inbox too.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" variant="secondary" shape="triangle" onClick={onAnother}>
          Send another
        </Button>
        <Button href="/events" size="lg">
          See the Fridays
        </Button>
      </div>
    </div>
  );
}
