'use client';

import { Film, Images, Radio, RotateCcw, ScanLine } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/admin/ui/button';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { DateText } from '@/components/admin/ui/display';
import { ShapeGlyph } from '@/components/admin/ui/badge';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { Countdown, LiveDot } from '../parts';
import { useEventActions, useWorkspaceEvent } from '../use-event';

/**
 * One line that says where this Friday is in its life: counting down, live (with shortcuts
 * to the stream and the scanner), wrapped (recording and documentation status), or cancelled.
 */
export function StateBanner({ className }: { className?: string }) {
  const { event, status, can, id } = useWorkspaceEvent();
  const pathname = usePathname() ?? '';
  // No "go to the Stream tab" button while you are on the Stream tab.
  const away = (tab: 'stream' | 'attendance' | 'media') => pathname !== adminRoutes.event(id, tab);
  const reduce = useReducedMotion();
  const confirm = useConfirm();
  const { restore } = useEventActions(id);
  const reg = event.counts.registrations;

  const base =
    'relative flex flex-col gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5';

  if (status === 'cancelled') {
    return (
      <div role="status" className={cn(base, 'border-line bg-surface-muted', className)}>
        <div className="flex min-w-0 items-start gap-3">
          <ShapeGlyph shape="triangle" className="mt-1 size-3.5 shrink-0 text-red" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              Cancelled
              {event.cancelledAt ? (
                <>
                  {' '}
                  <DateText
                    value={event.cancelledAt}
                    format="relative"
                    className="font-normal text-ink-3"
                  />
                </>
              ) : null}
              .
            </p>
            <p className="text-sm text-ink-3">
              {event.cancelReason ? `Reason: ${event.cancelReason}` : 'No reason given.'} The page
              stays up with a cancelled note, and registration is closed.
            </p>
          </div>
        </div>
        {can('publish') ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw />}
            loading={restore.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Bring this Friday back?',
                description:
                  'The cancelled note goes away and registration follows its normal settings again. Nobody gets an email about it.',
                confirmLabel: 'Restore event',
              });
              if (ok) restore.mutate();
            }}
          >
            Restore
          </Button>
        ) : null}
      </div>
    );
  }

  if (status === 'ongoing') {
    return (
      <motion.div
        role="status"
        initial={reduce ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(base, 'border-red bg-red text-white', className)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <LiveDot tone="white" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.4]">
              Happening now
            </p>
            <p className="text-sm text-white/85">
              {event.stream.state === 'live'
                ? 'The stream is live.'
                : event.mode === 'offline'
                  ? 'In the room, no stream today.'
                  : 'The stream is not live yet.'}{' '}
              {event.counts.checkedIn} checked in so far.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('stream.view') && event.mode !== 'offline' && away('stream') ? (
            <Button
              asChild
              size="sm"
              className="border-transparent bg-white text-red-600 hover:bg-white/90"
            >
              <Link href={adminRoutes.event(id, 'stream')}>
                <Radio />
                {can('stream.control') ? 'Stream controls' : 'Watch the stream'}
              </Link>
            </Button>
          ) : null}
          {can('attendance.scan') && event.mode !== 'online' && away('attendance') ? (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
            >
              <Link href={adminRoutes.event(id, 'attendance')}>
                <ScanLine />
                Open scanner
              </Link>
            </Button>
          ) : null}
        </div>
      </motion.div>
    );
  }

  if (status === 'past') {
    const recordings = event.recordings.filter((r) => r.video);
    const media = event.media.length;
    return (
      <div role="status" className={cn(base, 'border-line bg-surface-muted', className)}>
        <div className="flex min-w-0 items-start gap-3">
          <ShapeGlyph shape="arch" className="mt-1 size-3.5 shrink-0 text-green" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              Wrapped{' '}
              <DateText value={event.endsAt} format="relative" className="font-normal text-ink-3" />
              .{' '}
              <span className="font-normal text-ink-3">
                {event.counts.checkedIn} of {reg} showed up.
              </span>
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <Film className="size-3.5" aria-hidden="true" />
                {recordings.length
                  ? `Recording ready${recordings.length > 1 ? ` (${recordings.length})` : ''}`
                  : event.mode === 'offline'
                    ? 'No stream, no recording'
                    : 'No recording yet'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Images className="size-3.5" aria-hidden="true" />
                {media
                  ? `${media} photo${media === 1 ? '' : 's'} and videos`
                  : 'No documentation yet'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('stream.view') && event.mode !== 'offline' && away('stream') ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={adminRoutes.event(id, 'stream')}>
                <Film />
                Recordings
              </Link>
            </Button>
          ) : null}
          {can('media.manage') && away('media') ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={adminRoutes.event(id, 'media')}>
                <Images />
                {media ? 'Documentation' : 'Add photos'}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  // scheduled
  return (
    <div role="status" className={cn(base, 'border-blue/15 bg-blue-50', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <motion.span
          className="mt-1 inline-flex"
          animate={reduce ? undefined : { rotate: [0, 12, -8, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3 }}
          aria-hidden="true"
        >
          <ShapeGlyph shape="circle" className="size-3.5 text-blue" />
        </motion.span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            Coming up in{' '}
            <Countdown
              to={event.startsAt}
              className="text-blue-600"
              fallback={<DateText value={event.startsAt} format="relative" />}
            />
          </p>
          <p className="text-sm text-ink-3">
            <DateText value={event.startsAt} format="date-long" />,{' '}
            <DateText
              value={event.startsAt}
              end={event.endsAt}
              format="time-range"
              className="mono"
            />
            {' · '}
            {reg
              ? `${reg} registered${event.capacity ? ` of ${event.capacity}` : ''}`
              : 'Nobody registered yet'}
            {event.visibility === 'draft' ? '. Still a draft, so nobody can register.' : '.'}
          </p>
        </div>
      </div>
      {can('stream.view') && event.mode !== 'offline' && away('stream') ? (
        <Button asChild size="sm" variant="secondary" className="self-start sm:self-auto">
          <Link href={adminRoutes.event(id, 'stream')}>
            <Radio />
            Stream setup
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
