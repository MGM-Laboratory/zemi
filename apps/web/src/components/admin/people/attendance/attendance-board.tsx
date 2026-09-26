'use client';

import '../people.css';
import { useQueryClient } from '@tanstack/react-query';
import { formatJakarta, type AttendanceCounts, type AttendanceStreamMessage, type CheckinFeedItem } from '@zemi/shared';
import { ScanLine } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { useWorkspaceEvent } from '@/components/admin/events/use-event';
import { Button } from '@/components/admin/ui/button';
import { EmptyState } from '@/components/admin/ui/feedback';
import { useNow } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { cn } from '@/lib/admin/cn';
import { AnimatedNumber } from '../animated-number';
import { ArrivalsChart, ChartCard } from '../charts';
import { peopleKeys } from '../lib';
import { useAttendanceSummary } from '../queries';
import { useAttendanceStream, type StreamStatus } from '../use-attendance-stream';
import { LiveFeed } from './live-feed';
import { QuickWalkIn } from './quick-walk-in';
import { Roster } from './roster';
import { ScannerCard, scannerPath } from './scanner-card';

const STUDIO_DEVICE = 'Studio (attendance board)';

/** 'HH:mm' WIB of an instant, floored to the 5 minute bucket the API uses for arrivals. */
function bucketOf(iso: string): string {
  const t = formatJakarta(iso, 'time');
  const [h, m] = t.split(':').map(Number);
  return `${String(h ?? 0).padStart(2, '0')}:${String(Math.floor((m ?? 0) / 5) * 5).padStart(2, '0')}`;
}

/**
 * /admin/events/[id]/attendance: the live door board. Counts and the feed come over SSE
 * (same origin, cookie auth). Each check-in also refreshes the arrivals histogram and the
 * roster, debounced, so a rush at the door is one refetch, not fifty.
 */
export function AttendanceBoard() {
  const { event, id, perms, status } = useWorkspaceEvent();
  const qc = useQueryClient();
  const canManage = perms.has('attendance.manage');
  const summary = useAttendanceSummary(id);
  const reduce = useReducedMotion();
  const [highlight, setHighlight] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void qc.invalidateQueries({ queryKey: peopleKeys.attendance(id) });
      if (canManage) void qc.invalidateQueries({ queryKey: peopleKeys.roster(id) });
    }, 1200);
  }, [qc, id, canManage]);

  const onMessage = useCallback(
    (msg: AttendanceStreamMessage) => {
      if (msg.type === 'checkin') {
        scheduleRefresh();
        if (msg.item && msg.item.action === 'check-in') {
          setHighlight(bucketOf(msg.item.createdAt));
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => setHighlight(null), 4000);
        }
      } else if (msg.type === 'counts') scheduleRefresh();
    },
    [scheduleRefresh],
  );

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  const stream = useAttendanceStream(id, { onMessage });

  const counts: AttendanceCounts = stream.counts ??
    (summary.data
      ? { registered: summary.data.registered, checkedIn: summary.data.checkedIn, inPersonRegistered: summary.data.inPersonRegistered, walkIns: summary.data.walkIns }
      : { registered: event.counts.registrations, checkedIn: event.counts.checkedIn, inPersonRegistered: event.counts.inPerson, walkIns: 0 });
  const feed: CheckinFeedItem[] = stream.summary ? stream.feed : (summary.data?.recent ?? []);
  const arrivals = summary.data?.arrivals ?? stream.summary?.arrivals ?? [];
  // Same rule as the API (summary + stream): without attendance.manage you only get your own scans.
  const ownOnly = !canManage;

  if (event.mode === 'online') {
    return (
      <EmptyState
        title="This Friday is online only."
        description="No door, no scanner. Watch the viewer count on the Stream tab instead."
        cast={[
          { shape: 'circle', mood: 'look', size: 56, lookAt: { x: 0.8, y: -0.2 } },
          { shape: 'arch', mood: 'sleep', size: 44 },
        ]}
        action={
          <Button asChild variant="secondary">
            <Link href={adminRoutes.event(id, 'stream')}>Open the stream</Link>
          </Button>
        }
      />
    );
  }

  const startTime = formatJakarta(event.startsAt, 'time');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-2xl font-extrabold tracking-[-0.025em] [font-variation-settings:'CASL'_0.25]">At the door</h2>
            <LivePill status={stream.status} lastMessageAt={stream.lastMessageAt} />
          </div>
          <p className="mt-0.5 text-sm text-ink-3">
            {status === 'scheduled'
              ? `Doors open around ${formatJakarta(new Date(new Date(event.startsAt).getTime() - 30 * 60_000), 'time')} WIB. Everything here updates live.`
              : status === 'ongoing'
                ? 'Happening now. Every scan lands here the moment it happens.'
                : status === 'cancelled'
                  ? 'This Friday was cancelled. Scans still get logged.'
                  : 'This one wrapped. Late check-ins still count.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="primary">
            <Link href={scannerPath(id)}>
              <ScanLine className="size-[1.1em]" aria-hidden="true" />
              Open scanner
            </Link>
          </Button>
        </div>
      </div>

      {/* Phones stack everything in door order (areas). From lg the right-hand things share one
          sticky column: its wrapper is `display: contents` below lg, so its children join the grid. */}
      <div
        className={cn(
          'grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr] xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]',
          canManage
            ? "[grid-template-areas:'hero'_'scan'_'feed'_'chart'_'walk'_'roster'] lg:[grid-template-areas:'hero_side'_'chart_side'_'roster_side']"
            : "[grid-template-areas:'hero'_'scan'_'feed'_'chart'] lg:[grid-template-areas:'hero_side'_'chart_side'_'rest_side']",
        )}
      >
        <div className="min-w-0 [grid-area:hero]">
          <HeroCounts counts={counts} pulse={stream.pulse} feed={feed} arrivals={arrivals} loading={!stream.counts && summary.isPending} />
        </div>
        <div className="min-w-0 [grid-area:chart]">
          <ChartCard
            title="Arrivals"
            description={`Check-ins per 5 minutes, WIB. Starts at ${startTime}.`}
            height={240}
            fetching={summary.isFetching && !summary.isPending}
            empty={arrivals.every((a) => a.count === 0) ? <QuietDoor loading={summary.isPending} /> : undefined}
            table={{ columns: ['Time (WIB)', 'Arrived'], numeric: [1], rows: arrivals.filter((a) => a.count > 0).map((a) => [a.time, a.count]) }}
          >
            <ArrivalsChart data={arrivals} startTime={startTime} highlight={highlight} animate={!reduce} />
          </ChartCard>
        </div>
        {canManage ? (
          <div className="min-w-0 [grid-area:roster]">
            <Roster eventId={id} device={STUDIO_DEVICE} />
          </div>
        ) : null}

        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4 lg:[grid-area:side]">
          <div className="min-w-0 [grid-area:scan]">
            <ScannerCard eventId={id} />
          </div>
          <section aria-labelledby="feed-title" className="flex max-h-[28rem] min-h-0 min-w-0 flex-col rounded-[24px] border border-line bg-white [grid-area:feed] lg:max-h-[38rem]">
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-5">
              <div>
                <h2 id="feed-title" className="font-display text-lg font-extrabold tracking-[-0.02em]">
                  Live feed
                </h2>
                <p className="text-[0.8125rem] text-ink-3">{ownOnly ? 'Your own scans (door access shows only those).' : 'Every device, newest first.'}</p>
              </div>
              <span className="mono text-sm text-ink-3 tabular-nums" aria-label={`${feed.length} recent items`}>
                {feed.length}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5 sm:p-2" tabIndex={0} aria-label="Live feed, scrollable">
              <LiveFeed items={feed} freshIds={stream.freshIds} ownOnly={ownOnly} loading={stream.status === 'connecting' && !feed.length} />
            </div>
          </section>
          {canManage ? (
            <div className="min-w-0 [grid-area:walk]">
              <QuickWalkIn eventId={id} device={STUDIO_DEVICE} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function HeroCounts({
  counts,
  pulse,
  feed,
  arrivals,
  loading,
}: {
  counts: AttendanceCounts;
  pulse: number;
  feed: CheckinFeedItem[];
  arrivals: Array<{ time: string; count: number }>;
  loading: boolean;
}) {
  const reduce = useReducedMotion();
  const now = useNow(15_000);
  const frac = counts.registered ? Math.min(1, counts.checkedIn / counts.registered) : 0;
  const pct = Math.round(frac * 100);
  const waiting = Math.max(0, counts.registered - counts.checkedIn);
  const tenMin = useMemo(() => {
    const since = now.getTime() - 10 * 60_000;
    return feed.reduce((n, it) => (new Date(it.createdAt).getTime() >= since ? n + (it.action === 'check-in' ? 1 : -1) : n), 0);
  }, [feed, now]);
  const busiest = arrivals.reduce((best, a) => (a.count > best.count ? a : best), { time: '', count: 0 });

  return (
    <section aria-label="Door numbers" className="relative h-full overflow-hidden rounded-[24px] border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink-3">Checked in</p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {loading ? '' : `${counts.checkedIn} of ${counts.registered} checked in`}
          </p>
          <p className="mt-1 flex items-baseline gap-2 font-display leading-[0.9] font-extrabold tracking-[-0.045em] [font-variation-settings:'CASL'_0.25]" aria-hidden="true">
            <motion.span
              key={pulse}
              initial={reduce || pulse === 0 ? false : { scale: 1.08, y: -2 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16 }}
              className="inline-block origin-bottom-left text-[clamp(3.5rem,9vw,6rem)] text-ink"
            >
              <AnimatedNumber value={loading ? 0 : counts.checkedIn} />
            </motion.span>
            <span className="text-[clamp(1.5rem,3.2vw,2.25rem)] text-ink-3">
              / <AnimatedNumber value={loading ? 0 : counts.registered} />
            </span>
          </p>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            {counts.registered ? (
              <>
                {waiting ? `${waiting.toLocaleString('en-US')} still to come` : 'Everyone made it'}
                {counts.inPersonRegistered !== counts.registered ? ` · ${counts.inPersonRegistered} said in person` : ''}
              </>
            ) : (
              'Nobody registered yet.'
            )}
          </p>
        </div>
        <PercentRing frac={frac} pct={pct} pulse={pulse} />
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-line pt-4 sm:gap-4">
        <MiniStat label="Last 10 min" value={Math.max(0, tenMin)} hint={tenMin > 0 ? 'through the door' : 'quiet'} />
        <MiniStat label="Walk-ins" value={counts.walkIns} hint="added at the door" />
        <MiniStat label="Busiest" value={busiest.count ? busiest.time : 'Not yet'} hint={busiest.count ? `${busiest.count} ${busiest.count === 1 ? 'person' : 'people'} in 5 min` : 'no rush so far'} mono={Boolean(busiest.count)} />
      </dl>

      <div className="pointer-events-none absolute -right-3 -bottom-4 opacity-90 sm:right-5 sm:bottom-auto sm:top-5" aria-hidden="true">
        <Character shape="arch" mood={pulse ? 'cheer' : 'idle'} size={40} replayKey={pulse} className="hidden sm:block" />
      </div>
    </section>
  );
}

function PercentRing({ frac, pct, pulse }: { frac: number; pct: number; pulse: number }) {
  const reduce = useReducedMotion();
  const size = 148;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="meter"
      aria-label="Share of registrations checked in"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}% checked in`}
      className="relative mx-auto shrink-0 sm:mx-0 sm:mr-10"
      style={{ width: size, height: size }}
    >
      <svg key={pulse} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('-rotate-90', pulse && !reduce && 'zemi-ring-glow')} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-green-50)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-green)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - frac) : c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20 }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[2rem] leading-none font-extrabold tracking-[-0.04em]">
          <AnimatedNumber value={pct} />
          <span className="text-lg text-ink-3">%</span>
        </span>
        <span className="mt-1 text-[0.75rem] text-ink-3">showed up</span>
      </span>
    </div>
  );
}

function MiniStat({ label, value, hint, mono }: { label: string; value: number | string; hint: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.8125rem] text-ink-3">{label}</dt>
      <dd className={cn('mt-0.5 text-[1.5rem] leading-tight font-extrabold tracking-[-0.03em] text-ink', mono ? 'mono text-[1.25rem] tracking-normal' : 'font-display')}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </dd>
      <dd className="truncate text-[0.75rem] text-ink-3">{hint}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

const PILL: Record<StreamStatus, { label: string; cls: string; dot: string }> = {
  open: { label: 'Live', cls: 'bg-green-50 text-green-600', dot: 'bg-green zemi-live-dot text-green' },
  connecting: { label: 'Connecting', cls: 'bg-surface-muted text-ink-3', dot: 'bg-ink-4' },
  reconnecting: { label: 'Reconnecting', cls: 'bg-yellow-50 text-ink-2', dot: 'bg-yellow zemi-live-dot text-yellow' },
  forbidden: { label: 'No live access', cls: 'bg-red-50 text-[#b42525]', dot: 'bg-red' },
  closed: { label: 'Paused', cls: 'bg-surface-muted text-ink-3', dot: 'bg-ink-4' },
};

function LivePill({ status, lastMessageAt }: { status: StreamStatus; lastMessageAt: number | null }) {
  const p = PILL[status];
  return (
    <span
      role="status"
      className={cn('inline-flex h-7 items-center gap-2 rounded-full px-3 text-[0.8125rem] font-semibold', p.cls)}
      title={lastMessageAt ? `Last update at ${formatJakarta(new Date(lastMessageAt), 'time')} WIB` : undefined}
    >
      <span className={cn('size-2 rounded-full', p.dot)} aria-hidden="true" />
      {p.label}
    </span>
  );
}

function QuietDoor({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
      <div className="flex items-end gap-1.5" aria-hidden="true">
        <Character shape="square" mood="sleep" size={44} />
        <Character shape="circle" mood="look" size={32} lookAt={{ x: -0.8, y: 0.3 }} />
      </div>
      <p className="max-w-xs text-sm text-ink-3">{loading ? 'Counting heads...' : 'Nobody through the door yet. The bars grow as people check in.'}</p>
    </div>
  );
}
