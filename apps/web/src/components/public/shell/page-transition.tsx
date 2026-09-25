'use client';

import { useAnimate } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SHAPE_COLORS, SHAPE_ORDER } from '@zemi/shared';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import styles from './shell.module.css';

type Phase = 'idle' | 'covering' | 'covered' | 'revealing';

const COVER_MS = 0.3;
const STAGGER = 0.035;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/**
 * Route curtain: four brand-colored rounded columns sweep up over the page, the route changes
 * underneath, then they carry on up and off. About 600ms end to end. Reduced motion: a 150ms fade.
 *
 * Intercepts plain left-clicks on same-origin links to a different pathname. It leaves alone:
 * modifier keys, target=_blank, download, hash or query-only changes, /api, /media, files,
 * /admin, and anything inside `[data-no-transition]` or with `data-transition="off"`.
 * Back/forward navigations don't get the curtain.
 */
export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [active, setActive] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const phase = useRef<Phase>('idle');
  const target = useRef<string | null>(null);
  const covered = useRef<Promise<void> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slow = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cols = useCallback(() => Array.from(scope.current?.querySelectorAll<HTMLElement>('[data-col]') ?? []), [scope]);

  const reveal = useCallback(async () => {
    if (phase.current === 'idle' || phase.current === 'revealing') return;
    await covered.current;
    phase.current = 'revealing';
    if (safety.current) clearTimeout(safety.current);
    if (slow.current) clearTimeout(slow.current);
    setWaiting(false);
    const root = scope.current;
    if (!root) return;
    if (prefersReducedMotion()) {
      await animate(root.querySelector('[data-fade]')!, { opacity: 0 }, { duration: 0.15 });
    } else {
      const r = window.innerWidth * 0.125;
      const h = window.innerHeight;
      const mark = root.querySelector('[data-mark]');
      if (mark) animate(mark, { opacity: 0, scale: 0.8 }, { duration: 0.15 });
      await Promise.all(
        cols().map((el, i) =>
          animate(el, { y: -(h + 2 * r) - 20 }, { duration: COVER_MS, delay: i * STAGGER, ease: EASE_IN_OUT }),
        ),
      );
    }
    phase.current = 'idle';
    setActive(false);
    target.current = null;
  }, [animate, cols, scope]);

  const start = useCallback(
    (href: string) => {
      if (phase.current !== 'idle') return;
      phase.current = 'covering';
      target.current = new URL(href, window.location.href).pathname;
      setActive(true);
      const root = scope.current;
      const run = async () => {
        if (!root) return;
        if (prefersReducedMotion()) {
          await animate(root.querySelector('[data-fade]')!, { opacity: [0, 1] }, { duration: 0.15 });
        } else {
          const r = window.innerWidth * 0.125;
          const h = window.innerHeight;
          await Promise.all(
            cols().map((el, i) =>
              animate(el, { y: [h + 10, -r] }, { duration: COVER_MS, delay: i * STAGGER, ease: EASE_IN_OUT }),
            ),
          );
          const mark = root.querySelector('[data-mark]');
          if (mark) animate(mark, { opacity: [0, 1], scale: [0.8, 1] }, { duration: 0.2 });
        }
        phase.current = 'covered';
      };
      covered.current = run();
      void covered.current.then(() => {
        router.push(href);
        slow.current = setTimeout(() => setWaiting(true), 350);
        safety.current = setTimeout(() => void reveal(), 5000);
      });
    },
    [animate, cols, reveal, router, scope],
  );

  // New route committed: lift the curtain.
  useEffect(() => {
    // Any pathname change after a push (including redirects to a new slug) ends the transition.
    if (phase.current === 'idle') return;
    void reveal();
  }, [pathname, reveal]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || !a.href) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      if (a.dataset.transition === 'off' || a.closest('[data-no-transition]')) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (/^\/(api|media|admin)(\/|$)/.test(url.pathname)) return;
      if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return;
      e.preventDefault();
      start(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [start]);

  useEffect(
    () => () => {
      if (safety.current) clearTimeout(safety.current);
      if (slow.current) clearTimeout(slow.current);
    },
    [],
  );

  return (
    <div ref={scope} aria-hidden="true">
      <div className={styles.curtain} data-active={active}>
        {SHAPE_ORDER.map((s) => (
          <div key={s} data-col="" className={styles.curtainCol} style={{ background: SHAPE_COLORS[s] }} />
        ))}
        <div data-mark="" className={styles.curtainMark}>
          <div className="grid size-20 place-items-center rounded-[28px] bg-white shadow-3">
            <ZemiMark size={40} variant={waiting ? 'loading' : 'idle'} decorative />
          </div>
        </div>
      </div>
      <div data-fade="" className={styles.curtainFade} style={{ visibility: active ? 'visible' : 'hidden' }} />
    </div>
  );
}
