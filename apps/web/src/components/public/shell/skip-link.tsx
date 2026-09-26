'use client';

import type { MouseEvent } from 'react';
import { useLenis } from '@/components/motion/smooth-scroll';

/**
 * First focusable element on every public page. Lenis handles same-page hash links itself (on
 * window, ignoring defaultPrevented) and leaves focus at the top, so this moves focus by hand.
 */
export function SkipLink({ href = '#main' }: { href?: string }) {
  const lenis = useLenis();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(href.replace(/^#/, ''));
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY);
    if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
    else window.scrollTo({ top, behavior: 'instant' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };

  return (
    <a
      href={href}
      onClick={onClick}
      data-transition="off"
      className="sr-only z-[300] rounded-full bg-ink px-5 py-3 font-bold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      Skip to content
    </a>
  );
}
