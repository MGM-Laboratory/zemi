'use client';

import { useEffect, useRef, useState } from 'react';
import { SHAPE_COLORS, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import styles from './shell.module.css';

type CursorKind = 'play' | 'drag' | 'open' | 'register';

const BADGE: Record<CursorKind, { shape: ShapeName; label: string; ink: boolean }> = {
  play: { shape: 'circle', label: 'Play', ink: false },
  drag: { shape: 'square', label: 'Drag', ink: true },
  open: { shape: 'arch', label: 'Open', ink: false },
  register: { shape: 'triangle', label: 'Join', ink: false },
};

const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"], [role="link"], label[for], summary, [data-cursor]';
const TEXTY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]):not([type="button"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Custom cursor (DESIGN.md section 8). Fine pointers only, off under reduced motion.
 *
 * A 12px dot that lerps to the pointer and grows over links and buttons. The dot is white with
 * `mix-blend-mode: difference`, so it renders black on light backgrounds and white on dark ones,
 * photos included. It lives outside any stacking context: a fixed wrapper with a z-index traps
 * the blend, which is how the dot used to stay white everywhere.
 *
 * The follow is distance-adaptive: long jumps catch up fast, small moves glide, so the cursor
 * feels light instead of dragging a weight. Elements with `data-cursor="play|drag|open|register"`
 * show a labelled brand shape instead. Text inputs keep the native cursor.
 */
export function Cursor() {
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const enabled = fine && !reduced;
  return enabled ? <CursorImpl /> : null;
}

function CursorImpl() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<CursorKind>('open');

  useEffect(() => {
    const root = rootRef.current;
    const dot = dotRef.current;
    if (!root || !dot) return;
    const html = document.documentElement;
    html.setAttribute('data-custom-cursor', '');

    let tx = -100;
    let ty = -100;
    let x = tx;
    let y = ty;
    let last = 0;
    let raf = 0;
    let shown = false;

    const place = () => {
      const m = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      root.style.transform = m;
      dot.style.transform = m;
    };

    const loop = (t: number) => {
      raf = 0;
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
      last = t;
      const dx = tx - x;
      const dy = ty - y;
      const d = Math.hypot(dx, dy);
      // Frame-rate independent smoothing: fast catch-up when far, gentle glide when close.
      const f = 1 - Math.pow(d > 48 ? 0.22 : 0.62, dt * 60);
      x += dx * f;
      y += dy * f;
      place();
      if (d > 0.08) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const setState = (target: Element | null) => {
      const texty = target?.closest(TEXTY);
      if (texty) {
        root.dataset.state = 'text';
        dot.dataset.state = 'text';
        return;
      }
      const labelled = target?.closest<HTMLElement>('[data-cursor]');
      const k = labelled?.dataset.cursor as CursorKind | undefined;
      if (k && k in BADGE) {
        setKind(k);
        root.dataset.state = 'label';
        dot.dataset.state = 'label';
        return;
      }
      const state = target?.closest(INTERACTIVE) ? 'link' : 'default';
      root.dataset.state = state;
      dot.dataset.state = state;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        x = tx;
        y = ty;
        root.dataset.visible = 'true';
        dot.dataset.visible = 'true';
        place();
      }
      kick();
    };
    const onOver = (e: PointerEvent) => setState(e.target as Element);
    const onDown = () => {
      dot.dataset.down = 'true';
      root.dataset.down = 'true';
    };
    const onUp = () => {
      dot.dataset.down = 'false';
      root.dataset.down = 'false';
    };
    const onLeave = (e: PointerEvent) => {
      if (!e.relatedTarget) {
        shown = false;
        root.dataset.visible = 'false';
        dot.dataset.visible = 'false';
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerout', onLeave, { passive: true });
    return () => {
      html.removeAttribute('data-custom-cursor');
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerout', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const b = BADGE[kind];
  return (
    <>
      {/* The dot blends against the page (root stacking context), so it inverts with the background. */}
      <div ref={dotRef} className={styles.cursorDot} data-state="default" data-visible="false" aria-hidden="true">
        <span className={styles.cursorDotCore} />
      </div>
      <div ref={rootRef} className={styles.cursor} data-state="default" data-visible="false" aria-hidden="true">
        <div className={styles.cursorBadge}>
          <svg viewBox="-4 -4 54 54">
            <path d={SHAPE_PATHS_46[b.shape]} fill={SHAPE_COLORS[b.shape]} />
          </svg>
          <span
            className={styles.cursorBadgeLabel}
            style={{ color: b.ink ? '#0e1116' : '#fff', transform: b.shape === 'triangle' ? 'translateY(22%)' : b.shape === 'arch' ? 'translateY(10%)' : undefined }}
          >
            {b.label}
          </span>
        </div>
      </div>
    </>
  );
}
