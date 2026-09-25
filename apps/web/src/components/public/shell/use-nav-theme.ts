'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * 'dark' while any element marked `data-nav-theme="dark"` sits under the nav's center line.
 * Rescans on route change and (debounced) on DOM changes inside <main>.
 */
export function useNavTheme(probeY = 36): 'light' | 'dark' {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    let io: IntersectionObserver | null = null;
    const hits = new Set<Element>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const build = () => {
      io?.disconnect();
      hits.clear();
      const h = window.innerHeight;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) hits.add(e.target);
            else hits.delete(e.target);
          }
          setTheme(hits.size > 0 ? 'dark' : 'light');
        },
        { rootMargin: `-${probeY}px 0px -${Math.max(0, h - probeY - 1)}px 0px`, threshold: 0 },
      );
      document.querySelectorAll('[data-nav-theme="dark"]').forEach((el) => io!.observe(el));
      if (!document.querySelector('[data-nav-theme="dark"]')) setTheme('light');
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(build, 180);
    };

    build();
    const main = document.getElementById('main') ?? document.body;
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' || r.addedNodes.length || r.removedNodes.length) {
          schedule();
          return;
        }
      }
    });
    mo.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-nav-theme'] });
    window.addEventListener('resize', schedule);
    return () => {
      io?.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      if (timer) clearTimeout(timer);
    };
  }, [pathname, probeY]);

  return theme;
}
