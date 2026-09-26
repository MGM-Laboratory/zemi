'use client';

import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import type { EventAdminRow, Paginated, Visibility } from '@zemi/shared';
import {
  CalendarPlus,
  CopyPlus,
  ExternalLink,
  EyeOff,
  LayoutGrid,
  MapPin,
  MoreHorizontal,
  PanelTop,
  Rows3,
  Send,
  Trash2,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import { Button, IconButton } from '@/components/admin/ui/button';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { DataTable, type ColumnDef } from '@/components/admin/ui/data-table';
import { DateText } from '@/components/admin/ui/display';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { FilterBar, Pagination, SearchInput } from '@/components/admin/ui/filters';
import { AvatarStack } from '@/components/admin/ui/media';
import { PageHeader } from '@/components/admin/ui/page-header';
import { StatusChip } from '@/components/admin/ui/status-chip';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { useAbility, useRefetchMe } from '@/lib/admin/ability';
import { adminFetch, api } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatPercent } from '@/lib/admin/format';
import { useAdminMutation, useMediaQuery, useNow } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { checkInRate } from '../lib';
import { CoverThumb, EventNumber, SeatsBar, viewOnSiteUrl } from '../parts';
import { eventDetailKey, notifyPublished, rowStatus } from '../use-event';

const TABS = ['upcoming', 'live', 'past', 'drafts', 'all'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  past: 'Past',
  drafts: 'Drafts',
  all: 'All',
};

function tabQuery(tab: Tab): {
  when: 'upcoming' | 'past' | 'live' | 'all';
  visibility?: Visibility;
} {
  if (tab === 'drafts') return { when: 'all', visibility: 'draft' };
  return { when: tab };
}

const listFetch = (params: Record<string, string | number | undefined>, signal?: AbortSignal) =>
  adminFetch<Paginated<EventAdminRow>>('/admin/events', { query: params, signal });

/* ------------------------------------------------------------------ row actions */

function useRowActions() {
  const router = useRouter();
  const refetchMe = useRefetchMe();
  const invalidate = [adminKeys.events.lists(), adminKeys.overview()];
  const publish = useAdminMutation({
    mutationFn: (v: { id: string; visibility: Visibility; from?: Element | null }) =>
      api.post<unknown>(`/admin/events/${v.id}/publish`, { visibility: v.visibility }),
    invalidate: (_d, v) => [...invalidate, eventDetailKey(v.id)],
    onSuccess: (_d, v) => notifyPublished(v.visibility, v.from),
  });
  const duplicate = useAdminMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/admin/events/${id}/duplicate`),
    invalidate,
    successMessage: 'Copied. Here is your new draft.',
    onSuccess: async (res) => {
      if (res?.id) {
        await refetchMe().catch(() => undefined);
        router.push(adminRoutes.event(res.id, 'details'));
      }
    },
  });
  const remove = useAdminMutation({
    mutationFn: (id: string) => api.delete(`/admin/events/${id}`),
    invalidate,
    successMessage: 'Deleted. It is gone for good.',
  });
  return { publish, duplicate, remove };
}

function RowActions({
  row,
  actions,
}: {
  row: EventAdminRow;
  actions: ReturnType<typeof useRowActions>;
}) {
  const ability = useAbility();
  const confirm = useConfirm();
  const router = useRouter();
  const p = new Set(row.permissions);
  const canDup = ability.has('events.create');
  const published = row.visibility !== 'draft';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Actions for ${row.title}`} size="sm" tooltip={false}>
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          icon={<PanelTop />}
          onSelect={() => router.push(adminRoutes.event(row.id))}
        >
          Open
        </DropdownMenuItem>
        {published ? (
          <DropdownMenuItem icon={<ExternalLink />} href={viewOnSiteUrl(row.slug)} external>
            View on site
          </DropdownMenuItem>
        ) : null}
        {canDup && p.has('view') ? (
          <DropdownMenuItem icon={<CopyPlus />} onSelect={() => actions.duplicate.mutate(row.id)}>
            Duplicate
          </DropdownMenuItem>
        ) : null}
        {p.has('publish') ? (
          published ? (
            <DropdownMenuItem
              icon={<EyeOff />}
              onSelect={async () => {
                const ok = await confirm({
                  title: `Unpublish "${row.title}"?`,
                  description:
                    'It disappears from the site and new registrations stop. People who already registered keep their tickets, and nobody gets an email.',
                  confirmLabel: 'Unpublish',
                });
                if (ok) actions.publish.mutate({ id: row.id, visibility: 'draft' });
              }}
            >
              Unpublish
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              icon={<Send />}
              onSelect={() => actions.publish.mutate({ id: row.id, visibility: 'published' })}
            >
              Publish
            </DropdownMenuItem>
          )
        ) : null}
        {p.has('delete') ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={<Trash2 />}
              destructive
              onSelect={async () => {
                const ok = await confirm({
                  title: 'Delete this event?',
                  description: `${row.registrations ? `${row.registrations} registrations and their tickets go with it (the QR codes stop working). ` : ''}The page, rundown, links, stream keys and recordings go too, but the files stay in the media library. Nobody is emailed. This cannot be undone.`,
                  destructive: true,
                  confirmLabel: 'Delete event',
                  typeToConfirm: row.title,
                });
                if (ok) actions.remove.mutate(row.id);
              }}
            >
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ page */

/** /admin/events: tabs, search, table or card grid, per-row actions by permission. */
export function EventsList() {
  const ability = useAbility();
  const router = useRouter();
  const reduce = useReducedMotion();
  const now = useNow(30_000);
  const [state, setState] = useQueryStates({
    tab: parseAsStringLiteral(TABS).withDefault('upcoming'),
    q: parseAsString.withDefault(''),
    page: parseAsInteger.withDefault(1),
    size: parseAsInteger.withDefault(20),
    view: parseAsStringLiteral(['table', 'grid'] as const),
  });
  const { tab, q, page, size } = state;
  const isPhone = useMediaQuery('(max-width: 639px)');
  // No explicit choice: cards on phones, the table elsewhere.
  const view = state.view ?? (isPhone ? 'grid' : 'table');
  const pageSize = [20, 50, 100].includes(size) ? size : 20;
  const params = { ...tabQuery(tab), search: q || undefined, page, pageSize };
  const list = useQuery({
    queryKey: adminKeys.events.list(params),
    queryFn: ({ signal }) => listFetch(params, signal),
    placeholderData: keepPreviousData,
  });
  // Tab counts: tiny pageSize=1 requests, refreshed with the list.
  const counts = useQueries({
    queries: TABS.map((t) => {
      const p = { ...tabQuery(t), search: q || undefined, page: 1, pageSize: 1 };
      return {
        queryKey: adminKeys.events.list({ ...p, count: true }),
        queryFn: ({ signal }: { signal: AbortSignal }) => listFetch(p, signal),
        staleTime: 30_000,
      };
    }),
  });
  const actions = useRowActions();
  const canCreate = ability.has('events.create');

  const columns = useMemo<ColumnDef<EventAdminRow>[]>(
    () => [
      {
        id: 'event',
        accessorKey: 'title',
        header: 'Event',
        meta: { hideable: false },
        cell: ({ row }) => (
          <div className="group flex min-w-[12rem] items-center gap-3">
            <CoverThumb
              image={row.original.cover}
              accent={row.original.accent}
              width={36}
              rounded="sm"
            />
            <div className="min-w-0">
              <EventNumber number={row.original.number} className="text-[0.625rem]" />
              <div className="line-clamp-2 font-medium text-ink">{row.original.title}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'startsAt',
        header: 'Date',
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <DateText value={row.original.startsAt} format="date" className="text-ink" />
            <div className="mono text-[0.75rem] text-ink-3">
              <DateText
                value={row.original.startsAt}
                end={row.original.endsAt}
                format="time-range"
              />
            </div>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => rowStatus(r, now),
        // Visibility and stream state stack under the status, so the whole table fits a laptop screen.
        meta: { label: 'Status, visibility and stream' },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <StatusChip kind="event" value={rowStatus(row.original, now)} size="sm" />
            <StatusChip kind="visibility" value={row.original.visibility} size="sm" />
            {row.original.streamState !== 'idle' ? (
              <StatusChip kind="stream" value={row.original.streamState} size="sm" />
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'venue',
        header: 'Room',
        meta: { className: 'min-w-[7rem]' },
        cell: ({ row }) =>
          row.original.venue ? (
            <span
              className="block max-w-[8rem] truncate whitespace-nowrap text-ink-2"
              title={row.original.venue}
            >
              {row.original.venue}
            </span>
          ) : (
            <span className="whitespace-nowrap text-ink-4">No room</span>
          ),
      },
      {
        accessorKey: 'registrations',
        header: 'Seats',
        meta: { width: '6.5rem' },
        cell: ({ row }) => (
          <SeatsBar
            registrations={row.original.registrations}
            capacity={row.original.capacity}
            compact
            className="w-[5.5rem]"
          />
        ),
      },
      {
        id: 'checkin',
        header: 'In',
        meta: { align: 'right', label: 'Check-in rate' },
        accessorFn: (r) => checkInRate(r.checkedIn, r.registrations) ?? -1,
        cell: ({ row }) => {
          const rate = checkInRate(row.original.checkedIn, row.original.registrations);
          // Doors have not opened yet: a 0% here would read like nobody came.
          const notYet = rowStatus(row.original, now) === 'scheduled' && !row.original.checkedIn;
          return notYet ? (
            <span className="whitespace-nowrap text-ink-4">Soon</span>
          ) : rate == null ? (
            <span className="whitespace-nowrap text-ink-4">None</span>
          ) : (
            <Tooltip
              content={`${row.original.checkedIn} of ${row.original.registrations} checked in`}
            >
              <span className="mono tabular-nums text-ink-2" tabIndex={0}>
                {formatPercent(rate)}
              </span>
            </Tooltip>
          );
        },
      },
      {
        id: 'speakers',
        header: 'Speakers',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.speakers.length ? (
            <AvatarStack
              people={(
                row.original.speakerAvatars ??
                row.original.speakers.map((fullName) => ({ fullName, avatar: null }))
              ).map((s) => ({ name: s.fullName, image: s.avatar }))}
              size={26}
              max={3}
            />
          ) : (
            <span className="whitespace-nowrap text-ink-4">Nobody</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: {
          width: '3.5rem',
          stopRowClick: true,
          hideable: false,
          align: 'right',
          // Pinned to the right edge so the menu is reachable without scrolling sideways.
          className:
            'sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-line)] group-hover/row:bg-[#fafaf9]',
          headerClassName: 'sticky right-0 shadow-[inset_1px_0_0_var(--color-line)]',
        },
        cell: ({ row }) => <RowActions row={row.original} actions={actions} />,
      },
    ],
    [now, actions],
  );

  const setTab = (t: Tab) => void setState({ tab: t, page: 1 });
  const hasSearch = Boolean(q);
  const empty = (
    <EmptyState
      title={
        hasSearch
          ? `Nothing matches "${q}".`
          : tab === 'upcoming'
            ? 'No Fridays on the calendar.'
            : tab === 'live'
              ? 'Nothing is live right now.'
              : tab === 'past'
                ? 'No past events yet.'
                : tab === 'drafts'
                  ? 'No drafts. Everything is out there.'
                  : 'No events yet.'
      }
      description={
        hasSearch
          ? 'Try fewer words, or look in All.'
          : tab === 'live'
            ? 'When a Friday is happening, it shows up here with a red dot.'
            : canCreate && (tab === 'upcoming' || tab === 'all')
              ? 'Plan the next one and it shows up here.'
              : undefined
      }
      cast={
        tab === 'live'
          ? [
              { shape: 'triangle', mood: 'sleep', size: 50 },
              { shape: 'circle', mood: 'look', size: 36, lookAt: { x: -0.9, y: 0.2 } },
            ]
          : undefined
      }
      action={
        hasSearch ? (
          <Button variant="secondary" onClick={() => void setState({ q: '', page: 1 })}>
            Clear the search
          </Button>
        ) : canCreate && tab !== 'live' && tab !== 'past' ? (
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

  const rows = list.data?.items;
  const total = list.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Events"
        description="Every Friday, past and upcoming. Click one to open its workspace."
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Tab>
          aria-label="Which events"
          value={tab}
          onValueChange={setTab}
          options={TABS.map((t, i) => ({
            value: t,
            label: (
              <span className="flex items-center gap-1.5">
                {t === 'live' && (counts[i]?.data?.total ?? 0) > 0 ? (
                  <span className="relative flex size-2" aria-hidden="true">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-red/70" />
                    <span className="relative inline-flex size-2 rounded-full bg-red" />
                  </span>
                ) : null}
                {TAB_LABEL[t]}
              </span>
            ),
            count: counts[i]?.data?.total,
          }))}
        />
        <SegmentedControl<'table' | 'grid'>
          aria-label="View"
          size="sm"
          value={view}
          onValueChange={(v) => void setState({ view: v })}
          options={[
            {
              value: 'table',
              label: <span className="sr-only sm:not-sr-only">Table</span>,
              icon: <Rows3 />,
            },
            {
              value: 'grid',
              label: <span className="sr-only sm:not-sr-only">Cards</span>,
              icon: <LayoutGrid />,
            },
          ]}
        />
      </div>

      {list.isError && !list.data ? (
        <ErrorState
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : view === 'table' ? (
        <DataTable
          aria-label="Events"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          loading={list.isPending}
          fetching={list.isFetching && !list.isPending}
          total={total}
          pagination={{ page, pageSize }}
          onPaginationChange={(p) => void setState({ page: p.page, size: p.pageSize })}
          onRowClick={(r) => router.push(adminRoutes.event(r.id))}
          storageKey="admin-events"
          noun="events"
          empty={empty}
          maxHeight={null}
          toolbar={
            <FilterBar
              className="w-full"
              search={
                <SearchInput
                  value={q}
                  onValueChange={(v) => void setState({ q: v, page: 1 })}
                  placeholder="Search title, speaker, room"
                  slashToFocus
                  loading={list.isFetching && !list.isPending}
                  aria-label="Search events"
                />
              }
            />
          }
        />
      ) : (
        <div className="space-y-4">
          <FilterBar
            search={
              <SearchInput
                value={q}
                onValueChange={(v) => void setState({ q: v, page: 1 })}
                placeholder="Search title, speaker, room"
                slashToFocus
                loading={list.isFetching && !list.isPending}
                aria-label="Search events"
              />
            }
          />
          {list.isPending ? (
            <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:gap-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-36 sm:aspect-[4/6] sm:h-auto" rounded="lg" />
              ))}
            </div>
          ) : rows && rows.length ? (
            <>
              <ul
                className={cn(
                  'grid gap-3 transition-opacity sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:gap-4',
                  list.isFetching && 'opacity-70',
                )}
                aria-label="Events"
              >
                {rows.map((r, i) => (
                  <motion.li
                    key={r.id}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : Math.min(i * 0.03, 0.3) }}
                  >
                    <EventCardTile row={r} now={now} actions={actions} />
                  </motion.li>
                ))}
              </ul>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={(p) => void setState({ page: p })}
                onPageSizeChange={(s) => void setState({ size: s, page: 1 })}
                noun="events"
              />
            </>
          ) : (
            empty
          )}
        </div>
      )}
    </>
  );
}

function EventCardTile({
  row,
  now,
  actions,
}: {
  row: EventAdminRow;
  now: Date;
  actions: ReturnType<typeof useRowActions>;
}) {
  const status = rowStatus(row, now);
  const rate =
    status === 'scheduled' && !row.checkedIn ? null : checkInRate(row.checkedIn, row.registrations);
  const chips = (
    <>
      <StatusChip kind="event" value={status} size="sm" />
      <StatusChip kind="visibility" value={row.visibility} size="sm" className="bg-white/95" />
      {row.streamState === 'live' ? <StatusChip kind="stream" value="live" size="sm" /> : null}
    </>
  );
  return (
    <article className="group relative flex h-full flex-row overflow-hidden rounded-[22px] border border-line bg-white transition-[border-color,box-shadow,transform] duration-200 focus-within:border-line-strong hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-2)] sm:flex-col">
      {/* Phones: a compact row with a small cover. Wider: a poster card. */}
      <div className="relative w-28 shrink-0 self-start sm:w-full">
        <CoverThumb
          image={row.cover}
          accent={row.accent}
          title={row.title}
          fluid
          rounded="none"
          sizes="(min-width: 1280px) 20vw, (min-width: 640px) 40vw, 112px"
        />
        <div className="absolute top-2.5 left-2.5 hidden flex-wrap gap-1.5 pr-12 sm:flex">
          {chips}
        </div>
      </div>
      <div className="absolute top-2 right-2 z-10 rounded-full bg-white/95 shadow-[var(--shadow-1)]">
        <RowActions row={row} actions={actions} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 sm:gap-2 sm:p-4">
        <div className="flex flex-wrap gap-1.5 pr-10 sm:hidden">{chips}</div>
        <EventNumber number={row.number} className="text-[0.625rem]" />
        <h3 className="line-clamp-2 font-display text-[1.0625rem] leading-tight font-extrabold tracking-[-0.02em] [font-variation-settings:'CASL'_0.3]">
          <Link
            href={adminRoutes.event(row.id)}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {row.title}
          </Link>
        </h3>
        <p className="text-[0.8125rem] text-ink-3">
          <DateText value={row.startsAt} format="date" className="text-ink-2" />
          <br />
          <DateText
            value={row.startsAt}
            end={row.endsAt}
            format="time-range"
            className="mono text-[0.75rem]"
          />
        </p>
        {row.venue ? (
          <p className="flex items-center gap-1.5 text-[0.8125rem] text-ink-3">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{row.venue}</span>
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <SeatsBar
            registrations={row.registrations}
            capacity={row.capacity}
            className="max-w-[9rem]"
          />
          <div className="text-right">
            {row.speakers.length ? (
              <AvatarStack
                people={(
                  row.speakerAvatars ?? row.speakers.map((fullName) => ({ fullName, avatar: null }))
                ).map((s) => ({ name: s.fullName, image: s.avatar }))}
                size={24}
                max={3}
              />
            ) : null}
            {rate != null ? (
              <p className="mono mt-1 text-[0.6875rem] text-ink-4">{formatPercent(rate)} in</p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
