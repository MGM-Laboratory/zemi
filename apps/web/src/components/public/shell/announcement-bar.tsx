'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Marquee } from '@/components/motion/marquee';
import { cn } from '@/lib/utils';

export interface AnnouncementBarProps {
  announcement: { active: boolean; text: string; href?: string | null } | null | undefined;
  className?: string;
}

function key(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) | 0;
  return `zemi:ann:${Math.abs(h).toString(36)}`;
}

const SAFE_HREF = /^(\/(?!\/)|https?:\/\/|mailto:)/i;
/** Set on <html> (value: the message key) while a dismissed bar must stay hidden. */
const DISMISSED_ATTR = 'data-announcement-dismissed';

const noopSubscribe = () => () => {};
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Thin yellow bar above the nav, from site settings (general.announcement). Dismissible;
 * the dismissal is remembered per message text, so a new message shows again.
 *
 * Layout contract (styles/public.css), for anything that has to make room for the bar:
 * - `--announcement-h`: the bar's height while it is shown, `0px` when there is none or it was
 *   dismissed. Right from the first paint (CSS `:has()` plus a tiny pre-paint script for
 *   dismissals), so a hero sized with it never jumps.
 * - `--announcement-offset`: how much of the bar is still on screen right now (it scrolls away
 *   with the page). For `position: fixed` things that sit under the nav.
 */
export function AnnouncementBar({ announcement, className }: AnnouncementBarProps) {
  const text = announcement?.text?.trim() ?? '';
  const k = key(text);
  const ref = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('storage', cb);
    window.addEventListener('zemi:announcement', cb);
    return () => {
      window.removeEventListener('storage', cb);
      window.removeEventListener('zemi:announcement', cb);
    };
  }, []);
  // false on the server and during hydration (markup matches), then the stored answer.
  const dismissed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return !!localStorage.getItem(k);
      } catch {
        return false;
      }
    },
    () => false,
  );
  // The pre-paint script only renders into the server HTML (a fresh client render never runs it).
  const isServerOrHydrating = useSyncExternalStore(noopSubscribe, () => false, () => true);
  const show = !!announcement?.active && !!text && !dismissed;

  // The pre-paint flag only has to bridge hydration. A different message clears it.
  useIsomorphicLayoutEffect(() => {
    const html = document.documentElement;
    const flagged = html.getAttribute(DISMISSED_ATTR);
    if (flagged !== null && flagged !== k) html.removeAttribute(DISMISSED_ATTR);
  }, [k]);

  // --announcement-offset: the part of the bar still on screen. Written only while it changes,
  // which is the first few dozen pixels of scroll.
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement.style;
    if (!show || !el) {
      root.setProperty('--announcement-offset', '0px');
      return;
    }
    let bottom = el.offsetTop + el.offsetHeight;
    let last = -1;
    let raf = 0;
    const write = () => {
      raf = 0;
      const next = Math.max(0, Math.round(bottom - window.scrollY));
      if (next === last) return;
      last = next;
      root.setProperty('--announcement-offset', `${next}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };
    const onResize = () => {
      bottom = el.offsetTop + el.offsetHeight;
      onScroll();
    };
    write();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      root.setProperty('--announcement-offset', '0px');
    };
  }, [show]);

  if (!announcement?.active || !text) return null;
  if (dismissed) return null;

  const href = announcement.href && SAFE_HREF.test(announcement.href) ? announcement.href : null;
  const external = !!href && /^https?:/i.test(href);
  // The text truncates with an ellipsis (not mid-letter) on narrow screens.
  const content = (
    <span className="flex min-w-0 items-center gap-2.5">
      <ShapeIcon
        shape="triangle"
        size={10}
        color="current"
        className="flex-none rotate-90 transition-transform duration-300 group-hover/ann:translate-x-0.5"
      />
      <span className="truncate">{text}</span>
    </span>
  );

  const dismiss = () => {
    try {
      localStorage.setItem(k, '1');
    } catch {
      /* storage blocked: it comes back next visit */
    }
    window.dispatchEvent(new Event('zemi:announcement'));
  };

  // Hides a bar the visitor already dismissed before the first paint (no 40px jump on load).
  const prePaint = `try{if(localStorage.getItem(${JSON.stringify(k)}))document.documentElement.setAttribute(${JSON.stringify(DISMISSED_ATTR)},${JSON.stringify(k)})}catch(e){}`;

  return (
    <>
      {isServerOrHydrating ? <script dangerouslySetInnerHTML={{ __html: prePaint }} /> : null}
      <div
        ref={ref}
        className={cn('relative z-[91] bg-yellow text-ink', className)}
        role="region"
        aria-label="Announcement"
        data-announcement={k}
      >
        <div className="container-page flex h-[var(--announcement-bar-h,40px)] items-center gap-3 text-[0.9375rem] font-bold">
          <div className="flex h-full min-w-0 flex-1 items-center">
            {href ? (
              external ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="group/ann flex h-full min-w-0 items-center underline-offset-4 hover:underline">
                  {content}
                </a>
              ) : (
                <Link href={href} className="group/ann flex h-full min-w-0 items-center underline-offset-4 hover:underline">
                  {content}
                </Link>
              )
            ) : text.length > 70 ? (
              <Marquee speed={40} fade="4%" reactToScroll={false} label="Announcement">
                {content}
              </Marquee>
            ) : (
              <p className="min-w-0">{content}</p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="group -mr-3 grid h-full w-11 flex-none place-items-center rounded-full transition-colors hover:bg-ink/10 active:scale-90"
            aria-label="Dismiss announcement"
          >
            <X className="size-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
