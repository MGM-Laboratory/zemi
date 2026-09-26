'use client';

import { useQuery } from '@tanstack/react-query';
import type { AdminOverview, AuditEntry, EventAdminRow } from '@zemi/shared';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarPlus,
  Inbox,
  MapPin,
  Mic2,
  PanelTop,
  Radio,
  ScanLine,
  Sparkles,
  Table2,
  Ticket,
  Users,
  BarChart3,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AccessSummary, useGreeting } from '@/components/admin/access-summary';
import { Character } from '@/components/admin/characters/character';
import { Button } from '@/components/admin/ui/button';
import { Card, CardHeader } from '@/components/admin/ui/card';
import { DateText, StatCard, Timeline, type TimelineItem } from '@/components/admin/ui/display';
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { PageHeader } from '@/components/admin/ui/page-header';
import { StatusChip } from '@/components/admin/ui/status-chip';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { useAbility, useRefetchMe } from '@/lib/admin/ability';
import { adminFetch } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatNumber, formatPercent } from '@/lib/admin/format';
import { useAdminMutation, useNow } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { useTakenDates } from '../fields';
import { fridayLabel, nextFreeFridays, planFridayPayload } from '../lib';
import { CoverThumb, Countdown, EventNumber, LiveDot, SeatsBar } from '../parts';
import { createEvent, rowStatus } from '../use-event';
import { TREND_COLORS } from './colors';

const TrendChart = dynamic(() => import('./trend-chart'), {
  ssr: false,
  loading: () => <Skeleton className="size-full" rounded="lg" />,
});

/** /admin: what matters this week, at a glance, and only what you are allowed to touch. */
export function OverviewDashboard() {
  const ability = useAbility();
  const { hello, line } = useGreeting();
  const query = useQuery({
    queryKey: adminKeys.overview(),
    queryFn: ({ signal }) => adminFetch<AdminOverview>('/admin/overview', { signal }),
    refetchInterval: 60_000,
  });
  const o = query.data;
  const canCreate = ability.has('events.create');
  // Totals only count the events this admin can see. "No Fridays yet" is only true for someone
  // who can see all of them; a scoped admin with nothing shared gets the normal layout instead.
  const seesAll = ability.isSuperadmin || ability.canAll('event', 'view');

  return (
    <>
      <PageHeader
        title={hello}
        description={line}
        sticky={false}
        actions={
          canCreate ? (
            <Button asChild variant="primary">
              <Link href={adminRoutes.newEvent}>
                <CalendarPlus />
                New event
              </Link>
            </Button>
          ) : null
        }
      />

      {query.isPending ? (
        <OverviewSkeleton />
      ) : !o ? (
        <div className="space-y-8">
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="The overview did not load."
          />
          <Card>
            <CardHeader
              title="Your access"
              description="Straight from your access policy. The server checks every action too."
            />
            <AccessSummary />
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {o.live ? <LiveBanner row={o.live} /> : null}

          {o.totals.events === 0 && seesAll ? (
            <FirstFriday fridays={o.emptyFridays} canCreate={canCreate} />
          ) : (
            <div
              className={cn(
                'grid gap-6',
                // Without the power to plan one, an all-planned calendar has nothing to offer: skip it.
                (canCreate || o.emptyFridays.length > 0) && 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]',
              )}
            >
              {o.next && o.next.id !== o.live?.id ? (
                <NextEventCard row={o.next} />
              ) : (
                <NoNextCard canCreate={canCreate} live={Boolean(o.live)} scoped={!seesAll} />
              )}
              {canCreate || o.emptyFridays.length > 0 ? (
                <EmptyFridays fridays={o.emptyFridays} canCreate={canCreate} />
              ) : null}
            </div>
          )}

          <Totals o={o} />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <TrendCard trend={o.trend} />
            <UpcomingList
              rows={o.upcoming.filter((r) => r.id !== o.next?.id && r.id !== o.live?.id)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ActivityCard entries={o.activity} />
            <Card>
              <CardHeader
                title="Your access"
                description="In plain words. The server checks every action too."
              />
              <AccessSummary className="xl:grid-cols-1" />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ live */

function LiveBanner({ row }: { row: EventAdminRow }) {
  const reduce = useReducedMotion();
  const perms = new Set(row.permissions);
  const href = perms.has('stream.view')
    ? adminRoutes.event(row.id, 'stream')
    : adminRoutes.event(row.id);
  return (
    <motion.section
      aria-label="Happening now"
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[24px] bg-red-600 text-white"
    >
      {!reduce ? (
        <motion.span
          aria-hidden="true"
          className="absolute -top-16 -right-10 size-56 rounded-full bg-white/15"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}
      <Link
        href={href}
        className="group relative flex flex-col gap-4 p-5 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white sm:flex-row sm:items-center sm:p-6"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <CoverThumb
            image={row.cover}
            accent={row.accent}
            width={56}
            rounded="md"
            className="ring-2 ring-white/40"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
              <LiveDot tone="white" />
              Happening now
            </p>
            <p className="mt-1 truncate font-display text-[clamp(1.25rem,2.4vw,1.75rem)] leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.5]">
              {row.title}
            </p>
            <p className="mt-0.5 text-sm text-white">
              <DateText
                value={row.startsAt}
                end={row.endsAt}
                format="time-range"
                className="mono"
              />
              {row.venue ? ` · ${row.venue}` : ''} · {row.checkedIn} checked in
            </p>
          </div>
        </div>
        <span className="inline-flex h-10 items-center gap-2 self-start rounded-full bg-white px-4 text-[0.9375rem] font-semibold text-red-600 transition-transform group-hover:translate-x-0.5 group-active:scale-95 sm:self-auto">
          {perms.has('stream.view') ? (
            <Radio className="size-4" />
          ) : (
            <PanelTop className="size-4" />
          )}
          {perms.has('stream.view') ? 'Open the stream' : 'Open the event'}
          <ArrowRight className="size-4" />
        </span>
      </Link>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ next event */

function NextEventCard({ row }: { row: EventAdminRow }) {
  const now = useNow(30_000);
  const status = rowStatus(row, now);
  const perms = new Set(row.permissions);
  const actions: Array<{ href: string; label: string; icon: ReactNode; show: boolean }> = [
    {
      href: adminRoutes.event(row.id, 'attendance'),
      label: 'Open scanner',
      icon: <ScanLine />,
      show: perms.has('attendance.scan'),
    },
    {
      href: adminRoutes.event(row.id, 'stream'),
      label: 'Stream',
      icon: <Radio />,
      show: perms.has('stream.view'),
    },
    {
      href: adminRoutes.event(row.id, 'registrations'),
      label: 'Registrations',
      icon: <Ticket />,
      show: perms.has('registrations.view'),
    },
  ];
  return (
    <Card padding="none" className="group relative overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        <Link
          href={adminRoutes.event(row.id)}
          className="shrink-0 self-start rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          aria-label={`Open ${row.title}`}
        >
          <CoverThumb
            image={row.cover}
            accent={row.accent}
            width={132}
            rounded="lg"
            sizes="264px"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label text-ink-3">Next up</span>
            <EventNumber number={row.number} />
            <StatusChip kind="event" value={status} size="sm" />
            {row.visibility !== 'published' ? (
              <StatusChip kind="visibility" value={row.visibility} size="sm" />
            ) : null}
          </div>
          <h2 className="mt-2 font-display text-[clamp(1.35rem,2.2vw,1.875rem)] leading-[1.05] font-extrabold tracking-[-0.03em] [font-variation-settings:'CASL'_0.3]">
            <Link href={adminRoutes.event(row.id)} className="underline-offset-4 hover:underline">
              {row.title}
            </Link>
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-ink-2">
            <DateText value={row.startsAt} format="date-long" />
            <DateText
              value={row.startsAt}
              end={row.endsAt}
              format="time-range"
              className="mono text-sm text-ink-3"
            />
            {row.venue ? (
              <span className="inline-flex items-center gap-1 text-ink-3">
                <MapPin className="size-3.5" aria-hidden="true" />
                {row.venue}
              </span>
            ) : null}
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="text-xs font-medium text-ink-3">Starts in</p>
              <p className="font-display text-[2rem] leading-none font-extrabold tracking-[-0.04em] text-blue-600 [font-variation-settings:'CASL'_0.2]">
                <Countdown
                  to={row.startsAt}
                  doneLabel="now"
                  fallback={<DateText value={row.startsAt} format="relative" />}
                  className="font-display [font-variation-settings:'MONO'_0]"
                />
              </p>
            </div>
            <SeatsBar
              registrations={row.registrations}
              capacity={row.capacity}
              className="max-w-[14rem] min-w-[10rem] flex-1"
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href={adminRoutes.event(row.id)}>
                <PanelTop />
                Open workspace
              </Link>
            </Button>
            {actions
              .filter((a) => a.show)
              .map((a) => (
                <Button key={a.label} asChild size="sm" variant="secondary">
                  <Link href={a.href}>
                    {a.icon}
                    {a.label}
                  </Link>
                </Button>
              ))}
          </div>
        </div>
      </div>
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 h-1',
          { blue: 'bg-blue', yellow: 'bg-yellow', red: 'bg-red', green: 'bg-green' }[row.accent],
        )}
        aria-hidden="true"
      />
    </Card>
  );
}

function NoNextCard({
  canCreate,
  live,
  scoped,
}: {
  canCreate: boolean;
  live: boolean;
  /** The admin only sees some events, so "nothing planned" means "nothing planned that is yours". */
  scoped: boolean;
}) {
  return (
    <EmptyState
      title={
        live
          ? 'Nothing else on the calendar yet.'
          : scoped
            ? 'Nothing on your calendar yet.'
            : 'No Friday on the calendar.'
      }
      description={
        canCreate
          ? scoped
            ? 'Plan a free Friday and it is all yours to set up.'
            : 'Pick one of the free Fridays, or start from scratch.'
          : scoped
            ? 'When someone shares a Friday with you, it shows up here.'
            : 'When the next one is planned, it shows up here.'
      }
      cast={[
        { shape: 'circle', mood: 'look', size: 48, lookAt: { x: 0.9, y: 0.1 } },
        { shape: 'square', mood: 'sleep', size: 40 },
      ]}
      action={
        canCreate ? (
          <Button asChild variant="primary">
            <Link href={adminRoutes.newEvent}>
              <CalendarPlus />
              New event
            </Link>
          </Button>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ empty Fridays */

function usePlanFriday() {
  const router = useRouter();
  const refetchMe = useRefetchMe();
  return useAdminMutation({
    mutationFn: (date: string) => createEvent(planFridayPayload(date)),
    invalidate: [adminKeys.events.lists(), adminKeys.overview()],
    successMessage: (_d, date) =>
      `Friday ${fridayLabel(date, 'date-short')} is on the calendar. As a draft, for now.`,
    celebrate: true,
    onSuccess: async (created) => {
      await refetchMe().catch(() => undefined);
      router.push(adminRoutes.event(created.id, 'details'));
    },
  });
}

function EmptyFridays({ fridays, canCreate }: { fridays: string[]; canCreate: boolean }) {
  const plan = usePlanFriday();
  const shown = fridays.slice(0, 6);
  return (
    <Card>
      <CardHeader
        title="Fridays without a plan"
        description={
          shown.length
            ? 'The next eight weeks. Every Friday deserves a table.'
            : 'Every Friday in the next eight weeks has something. Look at you.'
        }
        icon={<CalendarCheck className="size-5 text-green" />}
      />
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((d, i) => (
            <FridayRow key={d} date={d} index={i} plan={plan} canCreate={canCreate} />
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-ink-3">
            <Character shape="arch" mood="happy" size={40} />
            All planned. Enjoy it while it lasts.
          </div>
          {canCreate ? <PlanAhead plan={plan} /> : null}
        </div>
      )}
      {fridays.length > shown.length ? (
        <p className="mt-3 text-xs text-ink-3">
          And {fridays.length - shown.length} more after that.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * All eight weeks are planned: offer the first free Friday after that, from the same "taken
 * dates" the new-event form uses (it includes Fridays a scoped admin cannot see).
 */
function PlanAhead({ plan }: { plan: ReturnType<typeof usePlanFriday> }) {
  const { dates, ready } = useTakenDates();
  const next = ready ? nextFreeFridays(dates, 1)[0] : undefined;
  if (!next) return null;
  return (
    <div className="border-t border-line pt-4">
      <p className="label mb-2 text-ink-3">Planning ahead?</p>
      <ul>
        <FridayRow date={next} index={0} plan={plan} canCreate label="Plan ahead" />
      </ul>
    </div>
  );
}

function FridayRow({
  date,
  index,
  plan,
  canCreate,
  label = 'Plan this Friday',
}: {
  date: string;
  index: number;
  plan: ReturnType<typeof usePlanFriday>;
  canCreate: boolean;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const pending = plan.isPending && plan.variables === date;
  const [day, month] = fridayLabel(date, 'date-short').split(' ');
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.05 }}
      className="group flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-3 py-2.5 transition-colors hover:border-ink-4 hover:bg-surface-muted/60"
    >
      <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-yellow-50 leading-none transition-transform duration-300 group-hover:-rotate-6">
        <span className="mono text-[0.625rem] text-[#7a5600] uppercase">{month}</span>
        <span className="font-display text-base font-extrabold text-ink">{day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium text-ink">{fridayLabel(date, 'date')}</span>
        <span className="mono block text-xs text-ink-3">13:15 to 15:15 WIB</span>
      </span>
      {canCreate ? (
        <Button
          size="sm"
          variant={index === 0 ? 'primary' : 'secondary'}
          icon={<Sparkles />}
          loading={pending}
          disabled={plan.isPending && !pending}
          onClick={() => plan.mutate(date)}
        >
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">Plan</span>
        </Button>
      ) : null}
    </motion.li>
  );
}

/** Big empty moment for a brand new install. */
function FirstFriday({ fridays, canCreate }: { fridays: string[]; canCreate: boolean }) {
  const plan = usePlanFriday();
  const first = fridays[0];
  return (
    <EmptyState
      size="lg"
      title="No Fridays yet. Let's set the first table."
      description={
        canCreate
          ? 'Start a draft for the next free Friday. Nobody sees it until you publish.'
          : 'When someone plans a Friday, it shows up here.'
      }
      cast={[
        { shape: 'circle', mood: 'look', size: 56 },
        { shape: 'triangle', mood: 'idle', size: 48 },
        { shape: 'square', mood: 'sleep', size: 44 },
        { shape: 'arch', mood: 'happy', size: 50 },
      ]}
      action={
        canCreate ? (
          <>
            {first ? (
              <Button
                variant="primary"
                icon={<Sparkles />}
                loading={plan.isPending}
                onClick={() => plan.mutate(first)}
              >
                Plan {fridayLabel(first, 'date-short')}
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href={adminRoutes.newEvent}>
                <CalendarPlus />
                Pick another date
              </Link>
            </Button>
          </>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ totals */

function Totals({ o }: { o: AdminOverview }) {
  const ability = useAbility();
  const t = o.totals;
  const rate = t.registrations ? t.checkIns / t.registrations : null;
  const tiles: Array<{ key: string; node: ReactNode; href?: string }> = [
    {
      key: 'events',
      href: adminRoutes.events,
      node: (
        <StatCard
          className="h-full"
          label="Events"
          value={formatNumber(t.events)}
          hint={`${t.upcoming} coming up`}
          accent="blue"
          icon={<CalendarCheck />}
        />
      ),
    },
    {
      key: 'registrations',
      node: (
        <StatCard
          className="h-full"
          label="Registrations"
          value={formatNumber(t.registrations)}
          hint="all time"
          accent="yellow"
          icon={<Ticket />}
        />
      ),
    },
    {
      key: 'checkins',
      node: (
        <StatCard
          className="h-full"
          label="Check-ins"
          value={formatNumber(t.checkIns)}
          hint={rate != null ? `${formatPercent(rate)} showed up` : 'none yet'}
          accent="green"
          icon={<ScanLine />}
        />
      ),
    },
  ];
  if (ability.canAny('speaker', 'view') || ability.has('speakers.create')) {
    tiles.push({
      key: 'speakers',
      href: adminRoutes.speakers,
      node: (
        <StatCard
          className="h-full"
          label="Speakers"
          value={formatNumber(t.speakers)}
          accent="red"
          icon={<Mic2 />}
        />
      ),
    });
  }
  if (ability.canAny('publication', 'view') || ability.has('publications.create')) {
    tiles.push({
      key: 'publications',
      href: adminRoutes.publications,
      node: (
        <StatCard
          className="h-full"
          label="Publications"
          value={formatNumber(t.publications)}
          accent="yellow"
          icon={<BookOpen />}
        />
      ),
    });
  }
  if (t.unreadMessages != null && ability.has('inbox.view')) {
    tiles.push({
      key: 'inbox',
      href: adminRoutes.inbox,
      node: (
        <StatCard
          className="h-full"
          label="Unread messages"
          value={formatNumber(t.unreadMessages)}
          hint={t.unreadMessages ? 'someone said hi' : 'inbox zero'}
          accent="red"
          icon={<Inbox />}
        />
      ),
    });
  }
  return (
    <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {tiles.map((tile) =>
        tile.href ? (
          <Link
            key={tile.key}
            href={tile.href}
            className="block h-full rounded-[20px] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98]"
          >
            {tile.node}
          </Link>
        ) : (
          <div key={tile.key} className="h-full">
            {tile.node}
          </div>
        ),
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ trend */

function TrendCard({ trend }: { trend: AdminOverview['trend'] }) {
  const reduce = useReducedMotion();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const rows = [...trend].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  return (
    <Card>
      <CardHeader
        title="Registered vs showed up"
        description="The last few Fridays you can see."
        actions={
          rows.length ? (
            <SegmentedControl<'chart' | 'table'>
              aria-label="Show as"
              size="sm"
              value={view}
              onValueChange={setView}
              options={[
                {
                  value: 'chart',
                  label: <span className="sr-only">Chart</span>,
                  icon: <BarChart3 />,
                },
                { value: 'table', label: <span className="sr-only">Table</span>, icon: <Table2 /> },
              ]}
            />
          ) : null
        }
      />
      {!rows.length ? (
        <EmptyState
          size="sm"
          framed={false}
          title="No past Fridays yet."
          description="After the first one wraps, this fills up."
          cast={[{ shape: 'arch', mood: 'sleep', size: 40 }]}
        />
      ) : view === 'chart' ? (
        <>
          <div className="mb-3 flex flex-wrap gap-4 text-[0.8125rem] text-ink-2" aria-hidden="true">
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: TREND_COLORS.registrations }}
              />
              Registered
            </span>
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: TREND_COLORS.checkedIn }}
              />
              Checked in
            </span>
          </div>
          <div
            className="h-60 w-full"
            role="img"
            aria-label={`Bar chart of registrations and check-ins for ${rows.length} events. Switch to the table for the numbers.`}
          >
            <TrendChart data={rows} animate={!reduce} />
          </div>
        </>
      ) : (
        <div className="max-h-72 overflow-auto" data-lenis-prevent>
          <table className="w-full text-sm">
            <caption className="sr-only">Registrations and check-ins per event</caption>
            <thead className="sticky top-0 bg-white text-left text-xs text-ink-3">
              <tr>
                <th className="py-2 font-semibold">Event</th>
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 text-right font-semibold">Registered</th>
                <th className="py-2 text-right font-semibold">Checked in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...rows].reverse().map((r) => (
                <tr key={r.eventId}>
                  <td className="py-2 pr-3">
                    <Link
                      href={adminRoutes.event(r.eventId)}
                      className="font-medium text-ink hover:underline"
                    >
                      {r.label}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ink-3">
                    <DateText value={r.startsAt} format="date" />
                  </td>
                  <td className="mono py-2 text-right tabular-nums">{r.registrations}</td>
                  <td className="mono py-2 text-right tabular-nums">{r.checkedIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ upcoming */

function UpcomingList({ rows }: { rows: EventAdminRow[] }) {
  const now = useNow(30_000);
  return (
    <Card>
      <CardHeader
        title="Coming up"
        actions={
          <Link
            href={`${adminRoutes.events}?tab=upcoming`}
            className="text-sm font-medium text-blue hover:underline"
          >
            All events
          </Link>
        }
      />
      {rows.length ? (
        <ul className="-mx-2">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link
                href={adminRoutes.event(r.id)}
                className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
              >
                <CoverThumb image={r.cover} accent={r.accent} width={36} rounded="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium text-ink">
                    {r.title}
                  </span>
                  <span className="block text-[0.8125rem] text-ink-3">
                    <DateText value={r.startsAt} format="date" /> · {r.registrations} registered
                  </span>
                </span>
                <StatusChip
                  kind={r.visibility === 'draft' ? 'visibility' : 'event'}
                  value={(r.visibility === 'draft' ? 'draft' : rowStatus(r, now)) as never}
                  size="sm"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-3 text-sm text-ink-3">
          <Character shape="square" mood="sleep" size={36} />
          Nothing else planned yet.
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ activity */

function toneFor(action: string): TimelineItem['tone'] {
  if (
    action.startsWith('registration') ||
    action.startsWith('checkin') ||
    action.startsWith('attendance')
  )
    return 'green';
  if (action.startsWith('stream') || action.startsWith('recording')) return 'red';
  if (action.startsWith('event')) return 'blue';
  if (action.startsWith('speaker') || action.startsWith('publication')) return 'yellow';
  return 'neutral';
}

function ActivityCard({ entries }: { entries: AuditEntry[] }) {
  const ability = useAbility();
  const canAudit = ability.isSuperadmin || ability.has('audit.view');
  // Sign-ins and sign-outs are not changes (the audit log still has them). Summaries are full
  // sentences, some already starting with the actor ("Rani signed in"), so the actor goes in a
  // byline instead of in front.
  const items: TimelineItem[] = entries
    .filter((e) => !e.action.startsWith('auth.'))
    .slice(0, 10)
    .map((e) => ({
      id: e.id,
      at: e.createdAt,
      tone: toneFor(e.action),
      title: <span className="text-ink">{e.summary}</span>,
      description: (
        <span className="flex flex-wrap items-center gap-x-2">
          <span>by {e.actorName}</span>
          {e.resourceType === 'event' && e.resourceId && e.action !== 'event.delete' ? (
            <Link href={adminRoutes.event(e.resourceId)} className="text-blue hover:underline">
              Open the event
            </Link>
          ) : null}
        </span>
      ),
    }));
  return (
    <Card>
      <CardHeader
        title="Recent activity"
        description="Who changed what, lately."
        icon={<Users className="size-5 text-blue" />}
        actions={
          canAudit ? (
            <Link
              href={adminRoutes.audit}
              className="text-sm font-medium text-blue hover:underline"
            >
              Audit log
            </Link>
          ) : null
        }
      />
      <Timeline
        items={items}
        empty={
          <p className="flex items-center gap-3 text-sm text-ink-3">
            <Character shape="circle" mood="sleep" size={36} />
            Quiet week. Nothing changed yet.
          </p>
        }
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ skeleton */

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the overview">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-64" rounded="lg" />
        <Skeleton className="h-64" rounded="lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" rounded="lg" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-80" rounded="lg" />
        <Skeleton className="h-80" rounded="lg" />
      </div>
    </div>
  );
}
