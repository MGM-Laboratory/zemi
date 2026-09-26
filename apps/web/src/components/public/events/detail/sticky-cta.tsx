'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type RefObject } from 'react';
import { Button } from '@/components/public/ui/button';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';

/**
 * Phones and tablets: a bottom bar with "Save my seat" once the hero button has scrolled away.
 * Hides near the footer so it never covers the last links.
 */
export function StickyCta({
  target,
  onRegister,
  label,
  sub,
  hidden,
}: {
  target: RefObject<HTMLElement | null>;
  onRegister: () => void;
  label: string;
  sub: string;
  hidden?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setShow(!e!.isIntersecting && e!.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(el);
    const footer = document.querySelector('footer');
    const io2 = footer
      ? new IntersectionObserver(([e]) => setNearEnd(e!.isIntersecting), { threshold: 0 })
      : null;
    if (footer) io2?.observe(footer);
    return () => {
      io.disconnect();
      io2?.disconnect();
    };
  }, [target]);

  const visible = show && !nearEnd && !hidden;
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="sticky"
          initial={reduced ? { opacity: 0 } : { y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: 90, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[60] lg:hidden"
        >
          <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3 rounded-full border border-line bg-white/95 py-2 pl-5 pr-2 shadow-3 backdrop-blur">
            <p className="min-w-0 truncate text-[0.9375rem] font-bold text-ink">{sub}</p>
            <Button
              size="md"
              onClick={onRegister}
              magnetic={false}
              cursor="register"
              aria-haspopup="dialog"
              className="flex-none"
            >
              {label}
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
