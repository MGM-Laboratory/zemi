'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * Nav theme contract (DESIGN.md section 4). Any page, any owner:
 *
 * - Put `data-nav-theme="dark"` on any dark surface: a section, a hero, the footer, even a layer
 *   that moves (the home closing marks its rising ink). While it sits under the middle of the nav,
 *   the nav flips to paper tone (white wordmark and mark, light links).
 * - `data-nav-theme="light"` inside a dark one flips it back for that part (a white card on a
 *   dark stage). The innermost marked element under the probe wins.
 * - Nothing else to do: rects are read live (transforms, GSAP pins and `position: fixed` all
 *   count), parts clipped away by an `overflow: hidden` ancestor don't count, elements can be
 *   added, removed or re-marked at any time, and the probe follows the nav itself (so the
 *   announcement bar pushing it down is fine).
 *
 * The probe is the vertical center of the nav bar (`[data-nav-bar]`'s parent), at the middle of
 * the screen horizontally.
 */
export type NavTheme = 'light' | 'dark';

interface Marked {
  el: Element;
  /** Nearest ancestor that clips its overflow, if any. */
  clip: Element | null;
}

function clipAncestor(el: Element): Element | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return p;
  }
  return null;
}

function collect(): Marked[] {
  return Array.from(document.querySelectorAll('[data-nav-theme]')).map((el) => ({ el, clip: clipAncestor(el) }));
}

function probePoint(): { x: number; y: number } {
  const header = document.querySelector('[data-nav-bar]')?.parentElement;
  const r = header?.getBoundingClientRect();
  const y = r && r.height ? r.top + r.height / 2 : 36;
  return { x: window.innerWidth / 2, y: Math.max(1, y) };
}

/** Pure read: the theme under the nav right now. Also used by the pre-paint boot script. */
export function readNavTheme(list: Marked[] = collect()): NavTheme {
  const { x, y } = probePoint();
  let best: Element | null = null;
  for (const { el, clip } of list) {
    const mark = el.getAttribute('data-nav-theme');
    if (mark !== 'dark' && mark !== 'light') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    if (clip) {
      const c = clip.getBoundingClientRect();
      if (y < c.top || y > c.bottom || x < c.left || x > c.right) continue;
    }
    if (!best || best.contains(el)) best = el;
  }
  return best?.getAttribute('data-nav-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Inline script for the public layout (after the page and the footer): sets the nav's theme before
 * the first paint, so a page that opens on a dark hero never flashes an ink nav. Same rule as
 * `readNavTheme`, minus the clip check.
 */
export const NAV_THEME_BOOT_SCRIPT = `(function(){try{var b=document.querySelector('[data-nav-bar]');if(!b)return;var h=b.parentElement.getBoundingClientRect();var y=Math.max(1,h.top+h.height/2),x=innerWidth/2,best=null,els=document.querySelectorAll('[data-nav-theme]');for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();if(r.width&&r.height&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom&&(!best||best.contains(els[i])))best=els[i]}if(best&&best.getAttribute('data-nav-theme')==='dark')b.setAttribute('data-theme','dark')}catch(e){}})();`;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Keep sampling this long after the last scroll: scrubbed layers keep moving for a moment. */
const SETTLE_MS = 1200;

/**
 * 'dark' while an element marked `data-nav-theme="dark"` sits under the middle of the nav (see the
 * contract above). Starts from whatever the pre-paint script decided, then tracks scroll, resize,
 * route changes and DOM changes, reading rects at most once per frame.
 */
export function useNavTheme(): NavTheme {
  const pathname = usePathname();
  const [theme, setTheme] = useState<NavTheme>(() => {
    if (typeof document === 'undefined') return 'light';
    return document.querySelector('[data-nav-bar]')?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  });

  useIsomorphicLayoutEffect(() => {
    let list = collect();
    let raf = 0;
    let until = 0;
    let dirty: ReturnType<typeof setTimeout> | null = null;

    const frame = () => {
      raf = 0;
      const next = readNavTheme(list);
      setTheme((t) => (t === next ? t : next));
      if (performance.now() < until) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      until = performance.now() + SETTLE_MS;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const refreshList = () => {
      dirty = null;
      list = collect();
      kick();
    };

    // First read happens before paint (layout effect), so hydration never shows a stale theme.
    setTheme(readNavTheme(list));
    kick();

    // The story re-renders often while scrolling: re-read the marked list at most every 250 ms.
    const mo = new MutationObserver((records) => {
      // A section flipping its own mark (the home closing) should land this frame.
      if (records.some((r) => r.type === 'attributes')) {
        if (dirty) clearTimeout(dirty);
        refreshList();
        return;
      }
      if (!dirty) dirty = setTimeout(refreshList, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-nav-theme'] });
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    return () => {
      mo.disconnect();
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
      if (raf) cancelAnimationFrame(raf);
      if (dirty) clearTimeout(dirty);
    };
  }, [pathname]);

  return theme;
}
