'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { BumperListQuery } from '@zemi/shared';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useWorkspaceEvent } from '@/components/admin/events/use-event';
import { Button } from '@/components/admin/ui/button';
import { EmptyState, ErrorState } from '@/components/admin/ui/feedback';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { bumperKeys, bumpersApi } from '../api';
import type { EventPickLike } from './event-picker';
import { GenerateDialog } from './generate-dialog';
import { FOUR_CAST } from './labels';
import { NewShowMenu } from './new-show-menu';
import { ShowGrid, ShowGridSkeleton } from './show-grid';

type Tab = 'active' | 'archived';

/**
 * The event workspace's Bumpers tab (`/admin/events/[id]/bumpers`, `bumpers.run`): this Friday's
 * shows with Play and Controller on every card, and Generate with the Friday already picked
 * (`bumpers.edit`).
 */
export function EventBumpersTab() {
  const { id, event, can } = useWorkspaceEvent();
  const canBuild = can('bumpers.edit');
  const [tab, setTab] = useState<Tab>('active');
  const [generating, setGenerating] = useState(false);
  const pick = useMemo<EventPickLike>(
    () => ({ id, number: event.number ?? null, title: event.title, startsAt: event.startsAt, accent: event.accent, canBuild }),
    [id, event.number, event.title, event.startsAt, event.accent, canBuild],
  );

  const params: Partial<BumperListQuery> = { eventId: id, status: tab, page: 1, pageSize: 60 };
  const list = useQuery({
    queryKey: bumperKeys.list(params),
    queryFn: ({ signal }) => bumpersApi.list(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });
  const archivedParams: Partial<BumperListQuery> = { eventId: id, status: 'archived', page: 1, pageSize: 1 };
  const archived = useQuery({
    queryKey: adminKeys.bumpers.list({ ...archivedParams, count: true }),
    queryFn: ({ signal }) => bumpersApi.list(archivedParams, signal),
    staleTime: 15_000,
  });
  const archivedCount = archived.data?.total ?? 0;
  const rows = list.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold tracking-[-0.02em] text-ink [font-variation-settings:'CASL'_0.2]">Bumpers</h2>
          <p className="mt-1 max-w-2xl text-[0.9375rem] text-ink-3">The animated cards for this Friday&apos;s room screen and stream. Play one full window, drive it from a controller, or put it in OBS.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canBuild ? (
            <>
              <Button variant="primary" icon={<Sparkles />} onClick={() => setGenerating(true)}>
                Generate
              </Button>
              <NewShowMenu event={pick} variant="secondary" />
            </>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link href={`${adminRoutes.bumpers}?event=${id}`}>
              All bumper shows
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </div>

      {archivedCount > 0 || tab === 'archived' ? (
        <SegmentedControl<Tab>
          aria-label="Which shows"
          size="sm"
          value={tab}
          onValueChange={setTab}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived', count: archivedCount },
          ]}
        />
      ) : null}

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : list.isPending ? (
        <ShowGridSkeleton count={3} />
      ) : rows.length ? (
        <ShowGrid rows={rows} hideEvent fetching={list.isFetching && list.isPlaceholderData} aria-label={tab === 'active' ? "This Friday's shows" : "This Friday's archived shows"} />
      ) : tab === 'archived' ? (
        <EmptyState
          size="sm"
          title="Nothing archived for this Friday."
          cast={[
            { shape: 'square', mood: 'sleep', size: 44 },
            { shape: 'arch', mood: 'sleep', size: 38 },
          ]}
        />
      ) : (
        <EmptyState
          size="lg"
          title="No bumpers for this Friday yet."
          description={
            canBuild
              ? 'Generate a show from the lineup and the rundown. It takes a few seconds, and every card stays yours to tweak.'
              : 'Nobody has built a show for this one. Someone with bumper access can generate it in a few seconds.'
          }
          cast={FOUR_CAST}
          action={
            canBuild ? (
              <Button variant="primary" icon={<Sparkles />} onClick={() => setGenerating(true)}>
                Generate a show
              </Button>
            ) : null
          }
        />
      )}

      {canBuild ? <GenerateDialog open={generating} onOpenChange={setGenerating} event={pick} /> : null}
    </div>
  );
}
