'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import type { PublicationCard } from '@zemi/shared';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { useFinePointer } from '@/lib/hooks/use-media-query';
import { pointer } from '@/lib/hooks/use-pointer';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { PaperCover } from './paper-cover';
import styles from './publications.module.css';

/**
 * The cover that floats next to the cursor while you hover a paper. DOM only (no canvas),
 * fine pointers only, decorative. Position is lerped in rAF from the shared pointer store and
 * the card leans into the pointer's velocity.
 */
export function CoverPreview({ pub }: { pub: PublicationCard | null }) {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const active = fine && !reduced;
  const showing = !!pub;

  useEffect(() => {
    if (!active || !showing) return;
    const el = ref.current;
    if (!el) return;
    const p = pointer.get();
    let x = p.x;
    let y = p.y;
    let rot = 0;
    let raf = 0;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const tick = () => {
      const s = pointer.get();
      const w = el.offsetWidth || 220;
      const h = el.offsetHeight || 275;
      const flip = s.x + w + 48 > window.innerWidth;
      const tx = flip ? s.x - w - 32 : s.x + 32;
      const ty = Math.min(Math.max(s.y - h * 0.55, 16), window.innerHeight - h - 16);
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      const vx = performance.now() - s.lastMove > 80 ? 0 : s.vx;
      rot += (Math.max(-12, Math.min(12, vx * 0.012)) - rot) * 0.12;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, showing]);

  if (!active) return null;

  return (
    <div ref={ref} className={styles.preview} aria-hidden="true">
      <AnimatePresence mode="popLayout">
        {pub ? (
          <motion.div
            key={pub.id}
            className={styles.previewInner}
            initial={{ opacity: 0, scale: 0.7, rotate: -8, y: 12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, rotate: 6, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            {pub.cover ? (
              <ZemiImage image={pub.cover} aspect="4/5" sizes="260px" alt="" />
            ) : (
              <PaperCover title={pub.title} type={pub.type} year={pub.publishedYear} />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
