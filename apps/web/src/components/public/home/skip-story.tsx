'use client';

import type { MouseEvent } from 'react';
import { useLenis } from '@/components/motion/smooth-scroll';

/**
 * "Skip the story" link for keyboard users (awwwards.md, part 3: pinned sections must not trap
 * keyboard users). Lenis swallows anchor clicks, which leaves focus at the top of the page, so this
 * jumps straight to the target (no smooth scroll through every pin) and moves focus to its heading.
 */
export function SkipStoryLink({ targetId, children }: { targetId: string; children: string }) {
  const lenis = useLenis();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    e.preventDefault();
    // Lenis also handles anchor clicks (on window, ignoring defaultPrevented) with a smooth,
    // offset scroll that would fight this jump.
    e.stopPropagation();
    const top = target.getBoundingClientRect().top + window.scrollY;
    if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
    else window.scrollTo({ top, behavior: 'instant' });
    const heading = target.querySelector<HTMLElement>('h2') ?? target;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={onClick}
      data-transition="off"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-[120] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-white"
    >
      {children}
    </a>
  );
}
