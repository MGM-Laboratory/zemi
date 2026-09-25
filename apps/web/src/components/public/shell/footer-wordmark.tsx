'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { pointer } from '@/lib/hooks/use-pointer';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import styles from './shell.module.css';

const LETTERS = ['z', 'e', 'm', 'ı'] as const;

/**
 * The giant footer wordmark. Letters near the pointer loosen (CASL) and gain weight; the idea
 * dot cycles shapes on its own and on click.
 */
export function FooterWordmark() {
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [dot, setDot] = useState(0);

  // Fit the word to the full width of its container.
  useEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;
    const fit = () => {
      root.style.setProperty('--fit', '100px');
      const natural = inner.scrollWidth || 1;
      const style = getComputedStyle(root);
      const avail = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      root.style.setProperty('--fit', `${Math.floor((100 * avail * 0.985) / natural)}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(root);
    const unsub = pointer.subscribe((p) => {
      if (!visible || p.type === 'touch') return;
      for (const el of letterRefs.current) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const d = Math.hypot(p.x - (r.left + r.width / 2), p.y - (r.top + r.height / 2));
        const k = Math.max(0, 1 - d / Math.max(260, r.width * 1.4));
        el.style.setProperty('--casl', (0.35 + 0.65 * k).toFixed(3));
        el.style.setProperty('--w', String(Math.round(900 + 100 * k)));
        el.style.translate = `0 ${(-k * 3).toFixed(2)}%`;
      }
    });
    const t = setInterval(() => {
      if (visible && document.visibilityState === 'visible') setDot((d) => (d + 1) % 4);
    }, 3200);
    return () => {
      unsub();
      io.disconnect();
      clearInterval(t);
    };
  }, []);

  const shape = SHAPE_ORDER[dot]!;

  return (
    <div ref={rootRef} className={styles.bigWord} aria-hidden="true">
      <span ref={innerRef} className={styles.bigWordInner}>
      {LETTERS.map((l, i) => (
        <span
          key={l}
          ref={(el) => {
            letterRefs.current[i] = el;
          }}
          className={styles.bigLetter}
          style={{ transition: 'translate 500ms cubic-bezier(.22,1,.36,1), --casl 380ms cubic-bezier(.22,1,.36,1), font-weight 380ms' }}
        >
          {l}
          {i === 3 ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setDot((d) => (d + 1) % 4)}
              className="absolute left-1/2 top-[-0.07em] size-[0.19em] -translate-x-[46%] cursor-pointer"
              aria-hidden="true"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.svg
                  key={shape}
                  viewBox="0 0 46 46"
                  className="absolute inset-0 size-full overflow-visible"
                  initial={{ scale: 0, rotate: -140 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 120, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 16 }}
                >
                  <path d={SHAPE_PATHS_46[shape]} fill={SHAPE_COLORS[shape]} />
                </motion.svg>
              </AnimatePresence>
            </button>
          ) : null}
        </span>
      ))}
      </span>
    </div>
  );
}
