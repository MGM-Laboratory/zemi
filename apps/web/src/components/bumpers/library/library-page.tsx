'use client';

import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { canUseBumpers, type BumperListQuery } from '@zemi/shared';
import { Sparkles } from 'lucide-react';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useState } from 'react';
import { Button } from '@/components/admin/ui/button';
import { EmptyState, ErrorState } from '@/components/admin/ui/feedback';
import { Pagination, SearchInput } from '@/components/admin/ui/filters';
import { PageHeader } from '@/components/admin/ui/page-header';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { useAbility } from '@/lib/admin/ability';
import { adminKeys } from '@/lib/admin/query-keys';
import { bumperKeys, bumpersApi } from '../api';
import { resolveInputFor } from './cover-data';
import { EventPicker, type EventPickLike } from './event-picker';
import { GenerateDialog } from './generate-dialog';
import { FOUR_CAST } from './labels';
import { NewShowMenu, useCanCreateShow } from './new-show-menu';
import { ShowGrid, ShowGridSkeleton } from './show-grid';

const TABS = ['active', 'archived'] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZES = [24, 48, 96];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /admin/bumpers: every show the principal can run. Active and archived tabs, an event filter,
 * search, and a grid of cards whose covers play on hover. "New show" generates from a Friday,
 * starts blank, or picks a starter kit; `?new=1` (the command palette) opens that menu.
 */
export function BumperLibrary() {
  const ability = useAbility();
  const allowed = canUseBumpers(ability);
  const canCreate = useCanCreateShow();
  const [state, setState] = useQueryStates({
    status: parseAsStringLiteral(TABS).withDefault('active'),
    q: parseAsString.withDefault(''),
    event: parseAsString,
    page: parseAsInteger.withDefault(1),
    size: parseAsInteger.withDefault(24),
    new: parseAsString,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [eventPick, setEventPick] = useState<EventPickLike | null>(null);

  const { status, q, page } = state;
  const pageSize = PAGE_SIZES.includes(state.size) ? state.size : 24;
  const eventId = state.event && UUID.test(state.event) ? state.event.toLowerCase() : undefined;
  const filters: Partial<BumperListQuery> = { eventId, search: q || undefined };
  const params: Partial<BumperListQuery> = { ...filters, status, page, pageSize };

  const list = useQuery({
    queryKey: bumperKeys.list(params),
    queryFn: ({ signal }) => bumpersApi.list(params, signal),
    placeholderData: keepPreviousData,
    enabled: allowed,
    // "On air" follows the OBS outputs connecting and leaving.
    refetchInterval: 20_000,
  });
  const counts = useQueries({
    queries: TABS.map((t) => {
      const p: Partial<BumperListQuery> = { ...filters, status: t, page: 1, pageSize: 1 };
      return {
        queryKey: adminKeys.bumpers.list({ ...p, count: true }),
        queryFn: ({ signal }: { signal: AbortSignal }) => bumpersApi.list(p, signal),
        enabled: allowed,
        staleTime: 15_000,
      };
    }),
  });

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtered = Boolean(q || eventId);
  // The filter's label: picked just now, or read off a row of that event.
  const fromRows = eventPick && eventPick.id === eventId ? eventPick : (rows.find((r) => r.eventId === eventId)?.event ?? null);
  // A filter to a Friday with no shows (after a reload): look the event up for its label.
  const labelInput = resolveInputFor([], [eventId]);
  const labelQuery = useQuery({
    queryKey: [...bumperKeys.all, 'resolve', labelInput],
    queryFn: () => bumpersApi.resolve(labelInput),
    enabled: allowed && !!eventId && !fromRows && list.isSuccess,
    staleTime: 60_000,
  });
  const labelEvent = eventId ? labelQuery.data?.events?.[eventId] : undefined;
  const eventLabel: EventPickLike | null = fromRows ?? (labelEvent ? { id: labelEvent.id, number: labelEvent.number, title: labelEvent.title, startsAt: labelEvent.startsAt, accent: labelEvent.accent } : null);

  const menuShown = canCreate && (menuOpen || state.new === '1');
  const onMenu = (open: boolean) => {
    setMenuOpen(open);
    if (!open && state.new) void setState({ new: null });
  };

  if (!allowed) {
    return (
      <>
        <PageHeader title="Bumpers" />
        <ErrorState title="Bumpers are behind a door you do not have a key for." description="Ask the superadmin for bumper access on an event, or the Manage all bumpers permission." />
      </>
    );
  }

  const empty =
    status === 'archived' && !filtered ? (
      <EmptyState
        title="Nothing in the archive."
        description="Archived shows keep their bumpers and history. Their OBS links pause until you restore them."
        cast={[
          { shape: 'square', mood: 'sleep', size: 52 },
          { shape: 'arch', mood: 'sleep', size: 44 },
        ]}
      />
    ) : filtered ? (
      <EmptyState
        title={q ? `Nothing matches "${q}".` : 'No shows for this Friday yet.'}
        description={q ? 'Try the Zemi number, or fewer words.' : status === 'archived' ? 'Nothing archived for it either.' : 'Generate one and it shows up here.'}
        cast={[
          { shape: 'circle', mood: 'look', size: 44, lookAt: { x: 0.8, y: 0.3 } },
          { shape: 'triangle', mood: 'oops', size: 48 },
        ]}
        action={
          <Button variant="secondary" onClick={() => void setState({ q: '', event: null, page: 1 })}>
            Clear the filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        size="lg"
        title="No shows yet. The crew is waiting in the wings."
        description="Generate one from a Friday's lineup and rundown. It takes a few seconds, and you can change every card after."
        cast={FOUR_CAST}
        action={
          canCreate ? (
            <Button variant="primary" icon={<Sparkles />} onClick={() => setGenerating(true)}>
              Generate a show
            </Button>
          ) : null
        }
      />
    );

  return (
    <>
      <PageHeader
        title="Bumpers"
        description="Animated cards for the room screen and the livestream. Build a show once, then play it full window, drive it from a controller or put it in OBS."
        actions={canCreate ? <NewShowMenu open={menuShown} onOpenChange={onMenu} /> : null}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl<Tab>
          aria-label="Which shows"
          value={status}
          onValueChange={(t) => void setState({ status: t, page: 1 })}
          options={TABS.map((t, i) => ({ value: t, label: t === 'active' ? 'Active' : 'Archived', count: counts[i]?.data?.total }))}
          className="self-start"
        />
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">
          <EventPicker
            value={eventId ?? null}
            selected={eventLabel}
            onChange={(id, e) => {
              setEventPick(e);
              void setState({ event: id, page: 1 });
            }}
            clearable
            placeholder="Every Friday"
            className="sm:min-w-0 sm:flex-1 lg:w-72 lg:flex-none"
            aria-label="Filter by event"
          />
          <SearchInput
            value={q}
            onValueChange={(v) => void setState({ q: v, page: 1 })}
            placeholder="Search shows or #98"
            slashToFocus
            loading={list.isFetching && !list.isPending}
            aria-label="Search shows"
            className="sm:min-w-0 sm:flex-1 lg:w-72 lg:flex-none"
          />
        </div>
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : list.isPending ? (
        <ShowGridSkeleton />
      ) : rows.length ? (
        <div className="space-y-6">
          <h2 className="sr-only">{status === 'active' ? 'Active shows' : 'Archived shows'}</h2>
          <ShowGrid rows={rows} fetching={list.isFetching && list.isPlaceholderData} aria-label={status === 'active' ? 'Active shows' : 'Archived shows'} />
          {total > PAGE_SIZES[0]! ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              pageSizes={PAGE_SIZES}
              onPageChange={(p) => void setState({ page: p })}
              onPageSizeChange={(s) => void setState({ size: s, page: 1 })}
              noun="shows"
            />
          ) : null}
        </div>
      ) : total > 0 ? (
        <EmptyState
          size="sm"
          title="This page is empty."
          description="The shows moved up a page or two."
          action={
            <Button variant="secondary" onClick={() => void setState({ page: 1 })}>
              Back to the first page
            </Button>
          }
        />
      ) : (
        empty
      )}

      {canCreate ? <GenerateDialog open={generating} onOpenChange={setGenerating} /> : null}
    </>
  );
}
