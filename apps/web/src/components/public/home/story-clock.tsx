'use client';

import { useMotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ScrollTrigger, useGSAP } from '@/components/motion/gsap';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { FridayClock, type ClockBeat } from '@/components/public/shell/friday-clock';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { minutesOf } from './story-plan';
import { STAMP_LINE } from './motion-config';

const START = 13 * 60 + 15;
const TOTAL = 120;

export interface StoryClockProps {
  /** Labels for the pill, one per stamped time. */
  beats: ClockBeat[];
  /** Id of the element that holds every `[data-story-time]` anchor. */
  rootId: string;
}

/**
 * Wires the Friday clock to the home story (DESIGN.md section 2).
 *
 * Every element with `data-story-time="HH:mm"` is an anchor: the clock reads that time when the
 * anchor's top crosses the stamp line (`data-story-at` takes another ScrollTrigger start, like
 * "top 82%", or "end" for the anchor's bottom reaching the bottom of the viewport). Between
 * anchors the time runs linearly, so the stamps and the clock always agree, pins included.
 * Reduced motion: the clock steps from stamp to stamp.
 *
 * At the last stamp (15:15, the closing copy coming in) it celebrates once and holds on
 * "15:15, see you next week" until the footer takes over.
 *
 * Render it after the story sections so its triggers are created (and refreshed) after the pins.
 */
export function StoryClock({ beats, rootId }: StoryClockProps) {
  const progress = useMotionValue(0);
  const [hidden, setHidden] = useState(false);
  const [cheers, setCheers] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const celebrated = useRef(false);

  useGSAP(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-story-time]'));
    const anchors = els
      .map((el) => ({
        el,
        min: minutesOf(el.dataset.storyTime ?? ''),
        st: ScrollTrigger.create({
          trigger: el,
          start:
            el.dataset.storyAt === 'end' ? 'bottom bottom' : el.dataset.storyAt || STAMP_LINE,
        }),
      }))
      .filter((a) => Number.isFinite(a.min));
    if (!anchors.length) return;

    const celebrate = () => {
      celebrated.current = true;
      setCheers((n) => n + 1);
      const pill = wrap.current?.querySelector('[role="img"]');
      void shapeConfetti({
        from: pill ?? null,
        count: prefersReducedMotion() ? 24 : 72,
        spread: 70,
        startVelocity: 30,
        angle: 70,
      });
    };

    // An anchor above the fold (the hero) counts from the very top of the page.
    const at = (i: number) => Math.max(0, anchors[i]!.st.start);
    const update = (y: number) => {
      const stepped = prefersReducedMotion();
      let min = anchors[0]!.min;
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i]!;
        const next = anchors[i + 1];
        if (y < at(i)) break;
        if (!next || stepped) {
          min = a.min;
          continue;
        }
        const span = Math.max(1, at(i + 1) - at(i));
        min = a.min + (next.min - a.min) * Math.min(1, (y - at(i)) / span);
      }
      progress.set(Math.min(1, Math.max(0, (min - START) / TOTAL)));

      const last = anchors[anchors.length - 1]!;
      if (!celebrated.current && y >= at(anchors.length - 1) - 2 && last.min >= START + TOTAL)
        celebrate();
      else if (celebrated.current && y < at(anchors.length - 1) - 120) celebrated.current = false;
    };

    const master = ScrollTrigger.create({
      start: 0,
      end: 'max',
      // Reads every anchor's start, so it refreshes after all of them (see motion/gsap.ts).
      refreshPriority: -1,
      onUpdate: (self) => update(self.scroll()),
      onRefresh: (self) => update(self.scroll()),
    });
    update(master.scroll());
  });

  // Keep every pin honest when things above the story move: the announcement bar being dismissed,
  // a web font swapping in (the hero height is content driven on phones), images settling.
  // Only the story's own offset and the hero height are compared, so pin spacers can't loop it.
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const first = root.querySelector('section');
      return `${Math.round(root.getBoundingClientRect().top + window.scrollY)}|${first?.offsetHeight ?? 0}`;
    };
    let key = measure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = measure();
        if (next === key) return;
        key = next;
        ScrollTrigger.refresh();
      }, 160);
    };
    const ro = new ResizeObserver(check);
    ro.observe(document.body);
    const hero = root.querySelector('section');
    if (hero) ro.observe(hero);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      key = measure();
      ScrollTrigger.refresh();
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [rootId]);

  // Tuck the clock away once the footer takes over the bottom of the screen.
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setHidden(!!e?.isIntersecting), {
      rootMargin: '0px 0px -45% 0px',
    });
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap}>
      <FridayClock progress={hidden ? null : progress} beats={beats} cheer={cheers} />
    </div>
  );
}
