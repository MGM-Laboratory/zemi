'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useSyncExternalStore } from 'react';
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

/**
 * Thin yellow bar above the nav, from site settings (general.announcement). Dismissible;
 * the dismissal is remembered per message text, so a new message shows again.
 */
export function AnnouncementBar({ announcement, className }: AnnouncementBarProps) {
  const text = announcement?.text?.trim() ?? '';
  const k = key(text);
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

  if (!announcement?.active || !text || dismissed) return null;

  const href = announcement.href && SAFE_HREF.test(announcement.href) ? announcement.href : null;
  const external = !!href && /^https?:/i.test(href);
  const content = (
    <span className="inline-flex items-center gap-2.5">
      <ShapeIcon shape="triangle" size={10} color="current" className="rotate-90" />
      <span>{text}</span>
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

  return (
    <div className={cn('relative z-[91] bg-yellow text-ink', className)} role="region" aria-label="Announcement">
      <div className="container-page flex h-10 items-center gap-3 text-[0.9375rem] font-bold">
        <div className="min-w-0 flex-1">
          {href ? (
            external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate underline-offset-4 hover:underline">
                {content}
              </a>
            ) : (
              <Link href={href} className="block truncate underline-offset-4 hover:underline">
                {content}
              </Link>
            )
          ) : text.length > 70 ? (
            <Marquee speed={40} fade="4%" reactToScroll={false} label="Announcement">
              {content}
            </Marquee>
          ) : (
            <p className="truncate">{content}</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-2 grid size-8 flex-none place-items-center rounded-full transition-colors hover:bg-ink/10"
          aria-label="Dismiss announcement"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
