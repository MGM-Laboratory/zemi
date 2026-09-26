'use client';

import { formatJakarta, initials, type CheckinFeedItem } from '@zemi/shared';
import { Hand, QrCode, Undo2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Character } from '@/components/admin/characters/character';
import { formatRelative } from '@/lib/admin/format';
import { useNow } from '@/lib/admin/hooks';
import { cn } from '@/lib/admin/cn';

/**
 * The door feed: every check-in and undo from any device, newest first. Items that arrive
 * over SSE slide in with a green wash that fades (`freshIds`); the rest render still.
 */
export function LiveFeed({
  items,
  freshIds,
  ownOnly,
  loading,
  className,
}: {
  items: CheckinFeedItem[];
  freshIds: ReadonlySet<string>;
  /** Scan-only viewers: the API only sends their own scans. Say so. */
  ownOnly?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const now = useNow(20_000);

  if (!items.length) {
    return (
      <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
        <div className="flex items-end gap-1.5" aria-hidden="true">
          <Character shape="arch" mood={loading ? 'look' : 'sleep'} size={48} />
          <Character shape="circle" mood="look" size={34} lookAt={{ x: -0.8, y: 0.3 }} />
        </div>
        <p className="max-w-[16rem] text-sm text-ink-3">
          {loading ? 'Listening for the door...' : ownOnly ? 'Your scans show up here the moment they land.' : 'Quiet so far. Every scan and manual check-in lands here live.'}
        </p>
      </div>
    );
  }

  return (
    <ol className={cn('relative', className)} aria-label="Recent check-ins, newest first">
      <AnimatePresence initial={false}>
        {items.map((it) => {
          const fresh = freshIds.has(it.id);
          const undo = it.action === 'undo';
          return (
            <motion.li
              key={it.id}
              layout={reduce ? false : 'position'}
              initial={reduce || !fresh ? false : { opacity: 0, y: -18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={cn(
                'group relative flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-muted',
                fresh && !undo && 'zemi-feed-fresh',
              )}
            >
              <span
                className={cn(
                  'relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold transition-transform duration-200 group-hover:scale-105',
                  undo ? 'bg-surface-muted text-ink-3' : 'bg-green text-white',
                )}
                aria-hidden="true"
              >
                {initials(it.fullName) || '?'}
                <span
                  className={cn(
                    'absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full border-2 border-white',
                    undo ? 'bg-ink-3 text-white' : it.method === 'qr' ? 'bg-ink text-white' : 'bg-yellow text-ink',
                  )}
                >
                  {undo ? <Undo2 className="size-2.5" strokeWidth={3} /> : it.method === 'qr' ? <QrCode className="size-2.5" strokeWidth={3} /> : <Hand className="size-2.5" strokeWidth={3} />}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium text-ink', undo && 'text-ink-3 line-through decoration-ink-4')}>{it.fullName}</p>
                <p className="text-[0.8125rem] leading-snug text-ink-3">
                  {undo ? 'Check-in undone' : it.method === 'qr' ? 'Scanned' : 'Checked in by hand'} by <span className="text-ink-2">{it.actorName}</span>
                  {it.device ? (
                    <>
                      {' '}
                      on <span className="text-ink-2">{it.device}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="mono text-[0.8125rem] font-semibold text-ink tabular-nums">{formatJakarta(it.createdAt, 'time')}</p>
                <p className="text-[0.75rem] text-ink-3" suppressHydrationWarning>
                  {formatRelative(it.createdAt, now)}
                </p>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
