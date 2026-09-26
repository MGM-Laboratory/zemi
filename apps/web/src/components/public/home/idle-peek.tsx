'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Character, type CharacterHandle } from '@/components/brand/character';

const LINES = [
  'Still there? The coffee is getting cold.',
  'Psst. The next Friday is right up there.',
  'Take your time. Research is slow too.',
];
const IDLE_MS = 25_000;

/**
 * DESIGN.md section 7: after 25s without input on the home page, Q peeks in from the screen edge.
 * Any input sends it away again. Decorative (aria-hidden); clicking it makes it cheer.
 */
export function IdlePeek() {
  const [shown, setShown] = useState(false);
  const [line, setLine] = useState(LINES[0]!);
  const q = useRef<CharacterHandle>(null);
  const count = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let visible = false;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible') return arm();
        setLine(LINES[count.current % LINES.length]!);
        count.current += 1;
        visible = true;
        setShown(true);
      }, IDLE_MS);
    };
    const onActivity = (e: Event) => {
      // Poking Q is allowed: it cheers, then leaves on the next real activity.
      if (e.type === 'pointerdown' && (e.target as Element | null)?.closest?.('[data-idle-peek]')) {
        q.current?.cheer();
        return;
      }
      if (e.type === 'pointermove' && (e.target as Element | null)?.closest?.('[data-idle-peek]'))
        return;
      if (visible) {
        visible = false;
        setShown(false);
      }
      arm();
    };
    const events: Array<keyof WindowEventMap> = [
      'pointermove',
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
      'scroll',
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, []);

  return (
    <AnimatePresence>
      {shown ? (
        <motion.div
          key="peek"
          aria-hidden="true"
          data-idle-peek=""
          className="pointer-events-none fixed bottom-[18%] right-0 z-[80] flex items-end gap-2"
          initial={{ x: '110%', rotate: -20 }}
          animate={{ x: '28%', rotate: -14 }}
          exit={{ x: '110%', rotate: -20, transition: { duration: 0.35 } }}
          transition={{ type: 'spring', stiffness: 180, damping: 18 }}
        >
          <motion.p
            className="mb-16 max-w-[13rem] rounded-[18px] rounded-br-[4px] bg-ink px-4 py-3 text-[0.9375rem] font-bold leading-snug text-white shadow-3"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.5 } }}
            style={{ rotate: 14 }}
          >
            {line}
          </motion.p>
          <span className="pointer-events-auto">
            <Character ref={q} shape="circle" size="clamp(88px, 10vw, 140px)" seed={12} />
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
