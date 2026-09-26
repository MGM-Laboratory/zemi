'use client';

import type { EventMediaAdminItem } from '@zemi/shared';
import { ChevronLeft, ChevronRight, Star, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog as RDialog } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { Character } from '@/components/admin/characters/character';
import { AdminImage } from '@/components/admin/ui/media';
import { cn } from '@/lib/admin/cn';
import { formatDuration } from '@/lib/admin/format';
import { mediaLabel } from './media-grid';

/**
 * Full-screen viewer for the gallery. Arrow keys (or swipes) go to the previous and next item,
 * Escape closes, focus returns to the tile. Videos play with native controls.
 */
export function MediaLightbox({
  items,
  openId,
  onOpenChange,
  onNavigate,
  canManage,
  onToggleFeatured,
}: {
  items: EventMediaAdminItem[];
  openId: string | null;
  onOpenChange: (open: boolean) => void;
  onNavigate: (id: string) => void;
  canManage: boolean;
  onToggleFeatured: (item: EventMediaAdminItem) => void;
}) {
  const reduce = useReducedMotion();
  const index = openId ? items.findIndex((i) => i.id === openId) : -1;
  const item = index >= 0 ? items[index]! : null;
  const [dir, setDir] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // The tile to return focus to: the item on screen when the viewer closes.
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    if (openId) lastId.current = openId;
  }, [openId]);

  const go = (delta: number) => {
    if (!items.length || index < 0) return;
    setDir(delta);
    const next = (index + delta + items.length) % items.length;
    onNavigate(items[next]!.id);
  };

  // Close if the open item disappears (removed elsewhere).
  useEffect(() => {
    if (openId && index < 0) onOpenChange(false);
  }, [openId, index, onOpenChange]);

  return (
    <RDialog.Root open={Boolean(item)} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[60] bg-[rgba(14,17,22,0.96)] data-[state=open]:animate-[zemi-fade-in_180ms_var(--ease-out)]" />
        <RDialog.Content
          className="fixed inset-0 z-[61] flex flex-col text-white outline-none"
          onCloseAutoFocus={(e) => {
            const el = lastId.current ? document.querySelector<HTMLElement>(`[data-media-open="${lastId.current}"]`) : null;
            if (el) {
              e.preventDefault();
              el.focus({ preventScroll: false });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              go(1);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              go(-1);
            }
          }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) touch.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const s = touch.current;
            const t = e.changedTouches[0];
            touch.current = null;
            if (!s || !t) return;
            const dx = t.clientX - s.x;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          {item ? (
            <>
              <div className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-6">
                <RDialog.Title className="mono min-w-0 truncate text-sm text-white/75">
                  {index + 1} of {items.length}
                  <span className="sr-only">. {mediaLabel(item, index)}</span>
                </RDialog.Title>
                <RDialog.Description className="sr-only">Use the left and right arrow keys to move between photos and videos.</RDialog.Description>
                <div className="flex items-center gap-2">
                  {canManage && item.status === 'ready' ? (
                    <button
                      type="button"
                      onClick={() => onToggleFeatured(item)}
                      aria-pressed={item.featured}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95',
                        item.featured ? 'bg-yellow text-ink' : 'bg-white/12 text-white hover:bg-white/20',
                      )}
                    >
                      <Star className={cn('size-4', item.featured && 'fill-current')} aria-hidden="true" />
                      {item.featured ? 'Starred' : 'Star it'}
                    </button>
                  ) : null}
                  <RDialog.Close
                    aria-label="Close"
                    className="flex size-10 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-90"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </RDialog.Close>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={item.id}
                    className="flex size-full min-h-0 items-center justify-center"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 60, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -60, scale: 0.98 }}
                    transition={{ duration: reduce ? 0.12 : 0.34, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Stage item={item} />
                  </motion.div>
                </AnimatePresence>

                {items.length > 1 ? (
                  <>
                    <NavButton side="left" onClick={() => go(-1)} label="Previous" />
                    <NavButton side="right" onClick={() => go(1)} label="Next" />
                  </>
                ) : null}
              </div>

              <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                {items.length > 1 ? <SmallNav onClick={() => go(-1)} label="Previous" side="left" /> : null}
                <div className="min-w-0 flex-1 text-center">
                  <p className={cn('text-[0.9375rem]', item.caption ? 'text-white' : 'text-white/45 italic')}>{item.caption || 'No caption yet.'}</p>
                  <p className="mt-1 truncate text-xs text-white/45">
                    {item.originalFilename}
                    {item.video?.durationSec ? `, ${formatDuration(item.video.durationSec)}` : ''}
                  </p>
                </div>
                {items.length > 1 ? <SmallNav onClick={() => go(1)} label="Next" side="right" /> : null}
              </div>
            </>
          ) : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function Stage({ item }: { item: EventMediaAdminItem }) {
  if (item.status === 'ready' && item.kind === 'image' && item.image) {
    const ratio = item.image.width / Math.max(1, item.image.height);
    return (
      <AdminImage
        image={item.image}
        sizes="100vw"
        priority
        fit="contain"
        alt={item.caption ?? item.image.alt ?? ''}
        className="max-h-full max-w-full rounded-lg bg-transparent"
        style={{ aspectRatio: String(ratio), height: 'min(100%, calc(100dvh - 11rem))', backgroundImage: 'none', backgroundColor: 'transparent' }}
      />
    );
  }
  if (item.status === 'ready' && item.kind === 'video' && item.video) {
    const v = item.video;
    return (
      <video
        key={item.id}
        controls
        autoPlay
        playsInline
        poster={v.poster ?? undefined}
        className="max-h-[calc(100dvh-11rem)] max-w-full rounded-lg bg-black"
        aria-label={item.caption ?? 'Documentation video'}
      >
        {v.mp4 ? <source src={v.mp4} type="video/mp4" /> : null}
        {v.webm ? <source src={v.webm} type="video/webm" /> : null}
      </video>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Character shape={item.status === 'failed' ? 'triangle' : 'square'} mood={item.status === 'failed' ? 'oops' : 'sleep'} size={64} />
      <p className="font-display text-xl font-extrabold">{item.status === 'failed' ? "This one didn't process." : 'Still processing.'}</p>
      <p className="max-w-sm text-sm text-white/60">
        {item.status === 'failed' ? (item.error ?? 'Try uploading another copy.') : 'Give it a minute. Videos take the longest.'}
      </p>
    </div>
  );
}

function NavButton({ side, onClick, label }: { side: 'left' | 'right'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/22 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-90 sm:flex',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      {side === 'left' ? <ChevronLeft className="size-6" aria-hidden="true" /> : <ChevronRight className="size-6" aria-hidden="true" />}
    </button>
  );
}

/** Phone-size previous/next next to the caption (the side arrows hide under 640px). */
function SmallNav({ side, onClick, label }: { side: 'left' | 'right'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/22 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-90 sm:hidden"
    >
      {side === 'left' ? <ChevronLeft className="size-5" aria-hidden="true" /> : <ChevronRight className="size-5" aria-hidden="true" />}
    </button>
  );
}
