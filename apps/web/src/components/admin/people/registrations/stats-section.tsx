'use client';

import { formatJakarta, fromJakartaInput, jakartaDateInput, type EventAdmin, type RegistrationStats } from '@zemi/shared';
import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { ProgressRing } from '@/components/admin/ui/progress';
import { cn } from '@/lib/admin/cn';
import { useNow } from '@/lib/admin/hooks';
import { AnimatedNumber } from '../animated-number';
import { ArrivalsChart, BarList, ChartCard, HourChart, Meter, StackedShare, TimelineChart } from '../charts';
import { CHART, SOURCE_COLOR, SOURCE_LABEL, SOURCE_ORDER, type RegistrationSource } from '../lib';

/* ------------------------------------------------------------------ KPI row */

function Tile({ label, children, hint, className, accent }: { label: string; children: ReactNode; hint?: ReactNode; className?: string; accent?: 'blue' | 'green' | 'yellow' | 'red' }) {
  const bar = { blue: 'bg-blue', green: 'bg-green', yellow: 'bg-yellow', red: 'bg-red' } as const;
  return (
    <div className={cn('group relative flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-line bg-white p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-1)] sm:p-5', className)}>
      <p className="text-sm text-ink-3">{label}</p>
      <div className="mt-2 min-w-0 flex-1">{children}</div>
      {hint ? <p className="mt-2.5 text-[0.8125rem] text-ink-3">{hint}</p> : null}
      {accent ? <span className={cn('absolute inset-x-0 bottom-0 h-1 origin-left scale-x-[0.18] transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-x-100', bar[accent])} aria-hidden="true" /> : null}
    </div>
  );
}

function Big({ value, suffix }: { value: number; suffix?: ReactNode }) {
  return (
    <p className="flex items-baseline gap-1.5 font-display text-[2.25rem] leading-none font-extrabold tracking-[-0.04em] [font-variation-settings:'CASL'_0.2]">
      <AnimatedNumber value={value} />
      {suffix ? <span className="font-body text-base font-medium tracking-normal text-ink-3">{suffix}</span> : null}
    </p>
  );
}

export function StatsRow({ stats, event, loading }: { stats: RegistrationStats | undefined; event: EventAdmin; loading: boolean }) {
  const now = useNow(60_000);
  if (loading && !stats) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[8.5rem]" rounded="lg" />
        ))}
      </div>
    );
  }
  if (!stats) return null;
  const cap = stats.capacity ?? event.capacity ?? null;
  const rate = stats.total ? stats.checkedIn / stats.total : null;
  const over = cap != null && stats.total > cap ? stats.total - cap : 0;
  const before = new Date(event.startsAt).getTime() > now.getTime();

  return (
    <section aria-label="Registration numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <Tile
        label="Registered"
        accent="blue"
        hint={
          <>
            {cap ? (over ? `${over} over the ${cap} seats` : `${Math.max(0, cap - stats.total)} of ${cap} seats left`) : 'No seat cap'}
            {stats.cancelled ? ` · ${stats.cancelled} cancelled` : ''}
          </>
        }
      >
        <Big value={stats.total} suffix={cap ? `/ ${cap}` : undefined} />
        {cap ? <Meter value={stats.total} max={cap} label={`${stats.total} of ${cap} seats taken`} className="mt-3" /> : null}
      </Tile>

      <Tile label="Checked in" accent="green" hint={rate != null ? `${Math.round(rate * 100)}% of registrations showed up` : before ? 'Doors open on the day.' : 'Nobody to check in.'}>
        <div className="flex items-center justify-between gap-3">
          <Big value={stats.checkedIn} />
          <ProgressRing value={rate ?? 0} size={52} stroke={5} tone="green" label="Check-in rate" doneCheck={false} />
        </div>
      </Tile>

      <Tile label="In the room or online">
        <p className="mb-2.5 flex items-baseline gap-3 font-display text-[1.5rem] leading-none font-extrabold tracking-[-0.03em]">
          <AnimatedNumber value={stats.inPerson} />
          <span className="font-body text-sm font-medium tracking-normal text-ink-3">in person</span>
          <AnimatedNumber value={stats.online} />
          <span className="font-body text-sm font-medium tracking-normal text-ink-3">online</span>
        </p>
        <StackedShare
          legend={false}
          parts={[
            { key: 'in-person', label: 'In person', value: stats.inPerson, color: CHART.blue },
            { key: 'online', label: 'Online', value: stats.online, color: CHART.green },
          ]}
        />
      </Tile>

      <Tile label="Walk-ins" accent="yellow" hint={stats.walkIns ? 'Added at the door on the day.' : before ? 'Door crew can add them on the day.' : 'Everyone came with a ticket.'}>
        <Big value={stats.walkIns} />
      </Tile>

      <Tile label="Returning or new">
        <p className="mb-2.5 flex items-baseline gap-3 font-display text-[1.5rem] leading-none font-extrabold tracking-[-0.03em]">
          <AnimatedNumber value={stats.returning} />
          <span className="font-body text-sm font-medium tracking-normal text-ink-3">back again</span>
          <AnimatedNumber value={stats.firstTimers} />
          <span className="font-body text-sm font-medium tracking-normal text-ink-3">first time</span>
        </p>
        <StackedShare
          legend={false}
          parts={[
            { key: 'returning', label: 'Back again', value: stats.returning, color: CHART.blue },
            { key: 'first', label: 'First time', value: stats.firstTimers, color: CHART.green },
          ]}
        />
      </Tile>
    </section>
  );
}

/* ------------------------------------------------------------------ charts */

export function ChartsGrid({ stats, event, loading, error, onRetry, fetching }: { stats: RegistrationStats | undefined; event: EventAdmin; loading: boolean; error: unknown; onRetry: () => void; fetching: boolean }) {
  const reduce = useReducedMotion();
  if (loading && !stats) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-72 lg:col-span-2" rounded="lg" />
        <Skeleton className="h-64" rounded="lg" />
        <Skeleton className="h-64" rounded="lg" />
      </div>
    );
  }
  if (!stats) return <ErrorState error={error} onRetry={onRetry} size="sm" />;

  const animate = !reduce;
  const eventDay = jakartaDateInput(event.startsAt);
  const startTime = formatJakarta(event.startsAt, 'time');
  const arrivalsTotal = stats.arrivals.reduce((a, b) => a + b.count, 0);
  const signupsTotal = stats.byHour.reduce((a, b) => a + b.count, 0);
  const domainsTotal = stats.domains.reduce((a, b) => a + b.count, 0);
  const otherDomains = Math.max(0, stats.total - domainsTotal);
  const peakHour = stats.byHour.reduce((best, h) => (h.count > best.count ? h : best), { hour: -1, count: 0 });
  const busiestArrival = stats.arrivals.reduce((best, h) => (h.count > best.count ? h : best), { time: '', count: 0 });
  const lastDay = stats.timeline[stats.timeline.length - 1];
  const bestDay = stats.timeline.reduce((best, d) => (d.count > best.count ? d : best), { date: '', count: 0, cumulative: 0 });
  const sources = SOURCE_ORDER.map((key) => ({
    key,
    label: SOURCE_LABEL[key as RegistrationSource],
    value: stats.sources.find((s) => s.source === key)?.count ?? 0,
    color: SOURCE_COLOR[key]!,
  })).filter((s) => s.value > 0 || s.key === 'web');
  const extraSources = stats.sources.filter((s) => !(SOURCE_ORDER as readonly string[]).includes(s.source));

  const day = (d: string) => formatJakarta(fromJakartaInput(d, '12:00'), 'date-short');
  const lead = leadTime(stats.timeline, eventDay);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard
        className="lg:col-span-2"
        title="Sign-ups over time"
        description="Running total by day (WIB). Hover a day for its own count."
        height={240}
        fetching={fetching}
        headline={
          lastDay ? (
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">{stats.total.toLocaleString('en-US')}</span> so far
              {bestDay.count ? (
                <>
                  , busiest day <span className="font-semibold text-ink">{day(bestDay.date)}</span> with {bestDay.count}
                </>
              ) : null}
              .
            </p>
          ) : null
        }
        empty={stats.timeline.length === 0 ? <EmptyChart text="No sign-ups yet. Share the link and this line starts climbing." shape="circle" /> : undefined}
        table={{ columns: ['Day', 'New', 'Total'], numeric: [1, 2], rows: stats.timeline.map((d) => [day(d.date), d.count, d.cumulative]) }}
      >
        <TimelineChart data={stats.timeline} capacity={stats.capacity ?? event.capacity ?? null} eventDay={eventDay} animate={animate} />
      </ChartCard>

      <ChartCard
        title="When people sign up"
        description="Registrations by hour of day, WIB."
        fetching={fetching}
        headline={peakHour.count ? <p className="text-sm text-ink-2">Peak at <span className="font-semibold text-ink">{String(peakHour.hour).padStart(2, '0')}:00</span>. Post reminders a little before.</p> : null}
        empty={signupsTotal === 0 ? <EmptyChart text="Nothing to plot yet." shape="square" /> : undefined}
        table={{ columns: ['Hour (WIB)', 'Sign-ups'], numeric: [1], rows: stats.byHour.map((h) => [`${String(h.hour).padStart(2, '0')}:00`, h.count]) }}
      >
        <HourChart data={stats.byHour} animate={animate} />
      </ChartCard>

      <ChartCard
        title="Arrivals on the day"
        description="Check-ins per 5 minutes, from half an hour before the start."
        fetching={fetching}
        headline={
          busiestArrival.count ? (
            <p className="text-sm text-ink-2">
              Busiest at the door: <span className="font-semibold text-ink">{busiestArrival.time}</span> ({busiestArrival.count} people).
            </p>
          ) : null
        }
        empty={arrivalsTotal === 0 ? <EmptyChart text="Nobody through the door yet. The bars grow as people check in." shape="arch" /> : undefined}
        table={{ columns: ['Time (WIB)', 'Arrived'], numeric: [1], rows: stats.arrivals.filter((a) => a.count > 0).map((a) => [a.time, a.count]) }}
      >
        <ArrivalsChart data={stats.arrivals} startTime={startTime} animate={animate} />
      </ChartCard>

      <ChartCard
        className="lg:row-span-2"
        title="Email domains"
        description="Where people study or work, roughly."
        height={200}
        fluid
        fetching={fetching}
        empty={stats.domains.length === 0 ? <EmptyChart text="No emails yet." shape="triangle" /> : undefined}
        table={{
          columns: ['Domain', 'People'],
          numeric: [1],
          rows: [...stats.domains.map((d) => [d.domain, d.count]), ...(otherDomains ? [['Everything else', otherDomains]] : [])],
        }}
      >
        <BarList
          color={CHART.blue}
          total={stats.total}
          items={[
            ...stats.domains.map((d) => ({ key: d.domain, label: <span className="mono text-[0.8125rem]">{d.domain}</span>, value: d.count })),
            ...(otherDomains ? [{ key: '__other', label: <span className="text-ink-3">Everything else</span>, value: otherDomains }] : []),
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Where sign-ups came from"
        description="The website form, the studio, or the door."
        height={120}
        fluid
        fetching={fetching}
        empty={stats.total === 0 ? <EmptyChart text="No sign-ups yet." shape="circle" /> : undefined}
        table={{ columns: ['Source', 'People'], numeric: [1], rows: [...sources.map((s) => [s.label, s.value]), ...extraSources.map((s) => [s.source, s.count])] }}
      >
        <div className="flex h-full flex-col justify-center">
          <StackedShare parts={sources} height={18} />
        </div>
      </ChartCard>

      <ChartCard
        title="How early people sign up"
        description="Days between signing up and the Friday itself."
        height={150}
        fluid
        fetching={fetching}
        headline={
          lead.total ? (
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">{Math.round((lead.lastMinute / lead.total) * 100)}%</span> signed up in the last three days.
            </p>
          ) : null
        }
        empty={lead.total === 0 ? <EmptyChart text="No sign-ups yet." shape="triangle" /> : undefined}
        table={{ columns: ['When', 'Sign-ups'], numeric: [1], rows: lead.buckets.map((b) => [b.label, b.value]) }}
      >
        <BarList color={CHART.blue} total={lead.total} items={lead.buckets.map((b) => ({ key: b.key, label: b.label, value: b.value }))} />
      </ChartCard>
    </div>
  );
}

/** Buckets sign-ups by how many Jakarta days before the event day they happened (from the daily timeline). */
function leadTime(timeline: RegistrationStats['timeline'], eventDay: string) {
  const dayMs = 86_400_000;
  const event = Date.parse(`${eventDay}T00:00:00Z`);
  const defs = [
    { key: 'week', label: 'Over a week before', test: (d: number) => d > 7 },
    { key: 'days', label: '4 to 7 days before', test: (d: number) => d >= 4 && d <= 7 },
    { key: 'close', label: '1 to 3 days before', test: (d: number) => d >= 1 && d <= 3 },
    { key: 'day', label: 'On the day', test: (d: number) => d <= 0 },
  ];
  const buckets = defs.map((b) => ({ key: b.key, label: b.label, value: 0 }));
  for (const t of timeline) {
    const before = Math.round((event - Date.parse(`${t.date}T00:00:00Z`)) / dayMs);
    const i = defs.findIndex((b) => b.test(before));
    if (i >= 0) buckets[i]!.value += t.count;
  }
  const total = buckets.reduce((a, b) => a + b.value, 0);
  const lastMinute = (buckets[2]?.value ?? 0) + (buckets[3]?.value ?? 0);
  return { buckets, total, lastMinute };
}

function EmptyChart({ text, shape }: { text: string; shape: 'circle' | 'square' | 'arch' | 'triangle' }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
      <Character shape={shape} mood="sleep" size={44} />
      <p className="max-w-xs text-sm text-ink-3">{text}</p>
    </div>
  );
}
