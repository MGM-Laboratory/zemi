'use client';

import { useRef, useState } from 'react';
import { Character, type CharacterHandle } from '@/components/brand/character';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { useLenis } from '@/components/motion/smooth-scroll';

const QUIPS = [
  "Okay, okay. I'm up.",
  'Is it Friday yet?',
  'Coffee first. Then questions.',
  'You found me. Tell no one.',
  'See you at 13:15.',
];

/** Tiny easter egg: Q naps in the footer. Wake it up. */
export function FooterEgg() {
  const [awake, setAwake] = useState(false);
  const [n, setN] = useState(0);
  const ref = useRef<CharacterHandle>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const wake = () => {
    setAwake(true);
    setN((x) => x + 1);
    ref.current?.cheer();
    if (n % 3 === 2) void shapeConfetti({ from: btn.current, count: 60, startVelocity: 30 });
    window.setTimeout(() => setAwake(false), 4200);
  };

  return (
    <button
      ref={btn}
      type="button"
      onClick={wake}
      className="group inline-flex min-h-11 items-center gap-3 rounded-full py-1 pl-1 pr-3 text-left text-ink-inverse/60 transition-colors hover:text-ink-inverse active:scale-[0.97]"
      aria-label={awake ? QUIPS[(n - 1) % QUIPS.length] : 'Wake Q up'}
    >
      <Character ref={ref} shape="circle" mood={awake ? 'happy' : 'sleepy'} size={34} interactive={false} track={awake} />
      <span className="mono text-[0.8125rem]" aria-live="polite">
        {awake ? QUIPS[(n - 1) % QUIPS.length] : 'shh, Q is napping'}
      </span>
    </button>
  );
}

/** "Back to top" that respects smooth scroll. */
export function BackToTop() {
  const lenis = useLenis();
  return (
    <button
      type="button"
      onClick={() => {
        if (lenis) lenis.scrollTo(0, { duration: 1.4 });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('main')?.focus({ preventScroll: true });
      }}
      className="group label inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-ink-inverse/60 transition-colors hover:text-ink-inverse active:scale-[0.97]"
    >
      Back to top
      <svg viewBox="0 0 46 46" width="10" height="10" aria-hidden="true" className="-rotate-90 transition-transform duration-300 group-hover:-translate-y-0.5">
        <path d="M19.76 7.2 Q23 1 26.24 7.2L42.76 38.8 Q46 45 39 45L7 45 Q0 45 3.24 38.8 Z" fill="currentColor" transform="rotate(90 23 23)" />
      </svg>
    </button>
  );
}
