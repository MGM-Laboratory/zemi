'use client';

import { ArrowLeft, CalendarDays, MapPin, Radio } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { DateText } from '@/components/admin/ui/display';
import { StatusChip } from '@/components/admin/ui/status-chip';
import { TabNav, type TabNavItem } from '@/components/admin/ui/tabs';
import { Button } from '@/components/admin/ui/button';
import { isApiError } from '@/lib/admin/api';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { cn } from '@/lib/admin/cn';
import { adminRoutes } from '@/lib/admin/nav';
import { MODE_LABEL, WORKSPACE_TABS, type WorkspaceTabKey } from '../lib';
import { CoverThumb, EventNumber, PublishControl, ViewOnSiteButton } from '../parts';
import {
  EventWorkspaceProvider,
  useEventActions,
  useEventAdmin,
  useLiveStatus,
  usePermSet,
  useWorkspaceEvent,
  type EventWorkspaceValue,
} from '../use-event';
import { StateBanner } from './state-banner';

/** Which workspace tab a pathname points at ('overview' for the root). */
function currentTab(pathname: string, id: string): { key: WorkspaceTabKey | null; raw: string } {
  const base = adminRoutes.event(id);
  if (pathname === base || pathname === `${base}/`) return { key: 'overview', raw: '' };
  const rest = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split('/')[0]!
    : '';
  const tab = WORKSPACE_TABS.find((t) => t.path === rest);
  return { key: tab?.key ?? null, raw: rest };
}

/**
 * The event workspace frame (`/admin/events/[id]/...`): header with cover, number, chips,
 * date, "View on site" and publish; a state banner; route tabs filtered by the event's
 * permissions. Provides `useWorkspaceEvent()` to every tab below it.
 */
export function EventWorkspace({ id, children }: { id: string; children: ReactNode }) {
  const query = useEventAdmin(id);
  const event = query.data;
  const perms = usePermSet(event?.permissions);
  const status = useLiveStatus(event);
  const pathname = usePathname() ?? '';
  const tab = currentTab(pathname, id);
  const tabMeta = WORKSPACE_TABS.find((t) => t.key === tab.key);

  useBreadcrumbs(
    event
      ? [
          { label: 'Events', href: adminRoutes.events },
          ...(tab.key && tab.key !== 'overview'
            ? [
                { label: event.title, href: adminRoutes.event(id) },
                { label: tabMeta?.label ?? tab.raw },
              ]
            : [{ label: event.title }]),
        ]
      : [{ label: 'Events', href: adminRoutes.events }, { label: 'Loading...' }],
  );

  const value = useMemo<EventWorkspaceValue | null>(
    () =>
      event && status
        ? {
            id,
            event,
            status,
            perms,
            can: (a) => perms.has(a),
            refetch: () => query.refetch(),
            isFetching: query.isFetching,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, status, perms, query.isFetching, id],
  );

  if (query.isPending) return <WorkspaceSkeleton />;
  // A failed background refetch keeps the last good copy on screen; only a first load failure shows this.
  if (!value) {
    const missing = isApiError(query.error) && query.error.isNotFound;
    return (
      <div className="space-y-6">
        <BackLink />
        <ErrorState
          error={query.error}
          title={missing ? "We couldn't find that Friday." : undefined}
          description={
            missing ? 'It may have been deleted, or the link is off by a character.' : undefined
          }
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          action={
            <Button asChild variant="ghost">
              <Link href={adminRoutes.events}>All events</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const blocked = tabMeta ? !tabMeta.visible(perms) : false;

  return (
    <EventWorkspaceProvider value={value}>
      <WorkspaceHeader />
      <StateBanner className="mb-6" />
      <div className="min-w-0">
        {blocked ? (
          <ErrorState
            title="This tab is behind a door you do not have a key for."
            description={`You can see this event, but not its ${tabMeta?.label.toLowerCase()}. Ask the superadmin if you need it.`}
            action={
              <Button asChild variant="secondary">
                <Link href={adminRoutes.event(id)}>Back to the overview</Link>
              </Button>
            }
          />
        ) : (
          children
        )}
      </div>
    </EventWorkspaceProvider>
  );
}

function BackLink() {
  return (
    <Link
      href={adminRoutes.events}
      className="group inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-3 transition-colors hover:text-ink"
    >
      <ArrowLeft
        className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5"
        aria-hidden="true"
      />
      All events
    </Link>
  );
}

/* ------------------------------------------------------------------ header */

function WorkspaceHeader() {
  const ctx = useWorkspaceEvent();
  const { event, status, perms, id } = ctx;
  const actions = useEventActions(id);
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const topbar =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--admin-topbar-h')) ||
      60;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry!.isIntersecting), {
      rootMargin: `-${topbar + 1}px 0px 0px 0px`,
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const live = event.stream.state === 'live';
  const tabs: TabNavItem[] = WORKSPACE_TABS.map((t) => ({
    href: adminRoutes.event(id, t.path || undefined),
    label: t.label,
    exact: t.key === 'overview',
    hidden: !t.visible(perms),
    live: t.key === 'stream' && live,
    count:
      t.key === 'speakers'
        ? event.speakersFull.length || undefined
        : t.key === 'registrations'
          ? event.counts.registrations || undefined
          : t.key === 'publications'
            ? event.publications.length || undefined
            : t.key === 'media'
              ? event.media.length || undefined
              : undefined,
  }));

  const publishControl = (size: 'sm' | 'md') =>
    perms.has('publish') ? (
      <PublishControl
        size={size}
        visibility={event.visibility}
        cancelled={status === 'cancelled'}
        pending={actions.publish.isPending}
        onChange={(visibility, from) => actions.publish.mutate({ visibility, from })}
      />
    ) : null;

  return (
    <header className="mb-5">
      <div className="mb-4">
        <BackLink />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="group flex min-w-0 items-start gap-4">
          <CoverThumb
            image={event.cover}
            accent={event.accent}
            title={event.title}
            width={68}
            rounded="lg"
            className="hidden sm:inline-block"
            sizes="136px"
          />
          <CoverThumb
            image={event.cover}
            accent={event.accent}
            title={event.title}
            width={52}
            rounded="md"
            className="sm:hidden"
            sizes="104px"
          />
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <EventNumber number={event.number} />
              <StatusChip kind="event" value={status} size="sm" />
              <StatusChip kind="visibility" value={event.visibility} size="sm" />
            </div>
            <h1 className="font-display text-[clamp(1.5rem,2.6vw,2.375rem)] leading-[1.04] font-extrabold tracking-[-0.03em] break-words text-ink [font-variation-settings:'CASL'_0.2]">
              {event.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem] text-ink-2">
              <span className="inline-flex flex-wrap items-center gap-x-1.5">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <CalendarDays className="size-4 text-ink-4" aria-hidden="true" />
                  <DateText value={event.startsAt} format="date" />
                </span>
                <span className="text-ink-3" aria-hidden="true">
                  ·
                </span>
                <DateText
                  value={event.startsAt}
                  end={event.endsAt}
                  format="time-range"
                  className="mono text-[0.875rem] whitespace-nowrap"
                />
              </span>
              {event.mode !== 'online' ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-4 shrink-0 text-ink-4" aria-hidden="true" />
                  <span className="truncate">
                    {event.venueFull?.name ?? <span className="text-ink-3">No room yet</span>}
                  </span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Radio className="size-4 text-ink-4" aria-hidden="true" />
                {MODE_LABEL[event.mode]}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ViewOnSiteButton slug={event.slug} visibility={event.visibility} />
          {publishControl('md')}
        </div>
      </div>

      <div ref={sentinel} aria-hidden="true" className="h-0" />
      <div
        className={cn(
          'sticky top-[var(--admin-topbar-h,60px)] z-20 -mx-4 mt-5 bg-white/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
          stuck && 'shadow-[0_1px_0_var(--color-line)]',
        )}
      >
        <AnimatePresence initial={false}>
          {stuck ? (
            <motion.div
              key="mini"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="hidden overflow-hidden sm:block"
            >
              <div className="flex items-center gap-3 pt-2.5">
                <CoverThumb image={event.cover} accent={event.accent} width={24} rounded="sm" />
                <span className="min-w-0 truncate font-display text-base font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.2]">
                  {event.title}
                </span>
                <StatusChip kind="event" value={status} size="sm" />
                <span className="ml-auto flex items-center gap-2">{publishControl('sm')}</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <TabNav aria-label="Event sections" items={tabs} />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ skeleton */

function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the event">
      <Skeleton className="mb-5 h-4 w-24" />
      <div className="flex items-start gap-4">
        <Skeleton className="h-[85px] w-[68px] shrink-0" rounded="lg" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-full max-w-lg" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="mt-6 flex gap-6 border-b border-line pb-3">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 lg:col-span-2" rounded="lg" />
        <Skeleton className="h-48" rounded="lg" />
      </div>
    </div>
  );
}
