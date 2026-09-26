'use client';

import { useQueryClient } from '@tanstack/react-query';
import { VENUE_KINDS, pluralize, type VenueKind } from '@zemi/shared';
import { ExternalLink, MapPin, Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useVenues } from '@/components/admin/fields';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  notify,
  type ColumnDef,
} from '@/components/admin/ui';
import { useAbility } from '@/lib/admin/ability';
import { api } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';
import type { VenueRow } from '../shared/types';
import { VENUE_KIND_META, venueSummary } from './venue-meta';
import { VenueSheet } from './venue-sheet';

const TONE_BG = { blue: 'bg-blue-50 text-blue-600', red: 'bg-red-50 text-red-600', yellow: 'bg-yellow-50 text-[#7a5600]', green: 'bg-green-50 text-green-600', neutral: 'bg-surface-muted text-ink-2' } as const;

function KindIcon({ kind, className }: { kind: VenueKind; className?: string }) {
  const m = VENUE_KIND_META[kind] ?? VENUE_KIND_META.other;
  const Icon = m.icon;
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105', TONE_BG[m.tone], className)} aria-hidden="true">
      <Icon className="size-[18px]" />
    </span>
  );
}

/** /admin/venues: every room, how often it is used, and a sheet to add or edit one. */
export function VenuesPage() {
  const ability = useAbility();
  const canManage = ability.has('venues.manage');
  const venues = useVenues();
  const qc = useQueryClient();
  const wide = useMediaQuery('(min-width: 768px)');
  const reduce = useReducedMotion();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<VenueKind | null>(null);
  const [open, setOpen] = useState<VenueRow | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<VenueRow | null>(null);

  const all = (venues.data ?? []) as VenueRow[];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((v) => {
      if (kind && v.kind !== kind) return false;
      if (!q) return true;
      return [v.name, v.building, v.address, v.notes].some((s) => s?.toLowerCase().includes(q));
    });
  }, [all, search, kind]);

  const columns = useMemo<ColumnDef<VenueRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Room',
        meta: { hideable: false },
        cell: ({ row: { original: v } }) => (
          <div className="group flex min-w-0 items-center gap-3">
            <KindIcon kind={v.kind} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{v.name}</p>
              <p className="truncate text-sm text-ink-3">{VENUE_KIND_META[v.kind]?.label ?? v.kind}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'where',
        accessorFn: (v) => `${v.building ?? ''} ${v.floor ?? ''}`,
        header: 'Where',
        cell: ({ row: { original: v } }) => (
          <div className="min-w-0 text-sm">
            <p className="line-clamp-1 text-ink-2">{[v.building, v.floor ? `floor ${v.floor}` : null].filter(Boolean).join(', ') || <span className="text-ink-4">Not set</span>}</p>
            {v.address ? <p className="line-clamp-1 max-w-[22rem] text-ink-4 2xl:max-w-[36rem]">{v.address}</p> : null}
          </div>
        ),
      },
      {
        accessorKey: 'capacity',
        header: 'Seats',
        meta: { align: 'right', width: '5.5rem' },
        sortUndefined: 'last',
        cell: ({ row: { original: v } }) => (v.capacity != null ? <span className="mono tabular-nums">{v.capacity.toLocaleString('en-US')}</span> : <span className="text-ink-4">?</span>),
      },
      {
        accessorKey: 'eventCount',
        header: 'Events',
        meta: { align: 'right', width: '5.75rem' },
        cell: ({ row: { original: v } }) => (
          <Badge size="sm" tone={v.eventCount ? 'blue' : 'neutral'}>
            {v.eventCount ?? 0}
          </Badge>
        ),
      },
      {
        id: 'map',
        header: () => <span className="sr-only">Map</span>,
        enableSorting: false,
        meta: { width: '6.5rem', stopRowClick: true, align: 'right', label: 'Map' },
        cell: ({ row: { original: v } }) =>
          v.mapsUrl ? (
            <Button size="xs" variant="ghost" icon={<MapPin />} asChild>
              <a href={v.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${v.name} in Google Maps`}>
                Map
              </a>
            </Button>
          ) : null,
      },
    ],
    [],
  );

  const empty =
    all.length === 0 ? (
      <EmptyState
        size="lg"
        framed={!wide}
        title="No rooms yet."
        description="Add the classroom or theater you use most. Events can pick it in one click after that."
        cast={[
          { shape: 'arch', mood: 'look', size: 54, lookAt: { x: 0.8, y: 0 } },
          { shape: 'square', mood: 'sleep', size: 40 },
        ]}
        action={
          canManage ? (
            <Button variant="primary" icon={<Plus />} onClick={() => setOpen('new')}>
              Add a room
            </Button>
          ) : null
        }
      />
    ) : (
      <EmptyState
        framed={!wide}
        size="sm"
        title="No room matches that."
        description={canManage && search ? `Want to add "${search}" as a new room?` : 'Try another word, or clear the filter.'}
        cast={[{ shape: 'circle', mood: 'look', size: 44, lookAt: { x: -0.7, y: 0.2 } }]}
        action={
          <>
            {canManage && search ? (
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setOpen('new')}>
                Add &quot;{search}&quot;
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch('');
                setKind(null);
              }}
            >
              Clear
            </Button>
          </>
        }
      />
    );

  const totalEvents = all.reduce((n, v) => n + (v.eventCount ?? 0), 0);

  const filterBar = (
    <FilterBar
      className={wide ? 'w-full' : 'mb-5'}
      search={<SearchInput value={search} onValueChange={setSearch} placeholder="Search rooms, buildings, notes" slashToFocus debounceMs={120} />}
      filters={
        <Select<VenueKind>
          className="w-[10.5rem]"
          aria-label="Kind"
          placeholder="Any kind"
          clearable="Any kind"
          value={kind}
          onValueChange={setKind}
          options={VENUE_KINDS.map((k) => ({ value: k, label: VENUE_KIND_META[k].label }))}
        />
      }
      chips={kind ? [{ key: 'kind', label: `Kind: ${VENUE_KIND_META[kind].label}`, onRemove: () => setKind(null) }] : []}
    />
  );

  return (
    <div>
      <PageHeader
        title="Venues"
        description="Classrooms, theaters and the odd lab. Pick them on events so nobody wanders the wrong building at 13:14."
        meta={
          venues.data ? (
            <>
              <Badge tone="outline">{pluralize(all.length, 'room')}</Badge>
              <Badge tone="outline">{pluralize(totalEvents, 'event')} booked in them</Badge>
            </>
          ) : null
        }
        actions={
          canManage ? (
            <Button variant="primary" icon={<Plus />} onClick={() => setOpen('new')}>
              New room
            </Button>
          ) : null
        }
      />

      {wide && !(venues.isError) ? null : filterBar}

      {venues.isError ? (
        <ErrorState error={venues.error} onRetry={() => void venues.refetch()} retrying={venues.isFetching} />
      ) : wide ? (
        <DataTable
          toolbar={filterBar}
          aria-label="Venues"
          columns={columns}
          data={venues.isPending ? undefined : rows}
          getRowId={(r) => r.id}
          loading={venues.isPending}
          fetching={venues.isFetching}
          clientPageSize={50}
          noun="rooms"
          storageKey="venues"
          onRowClick={(r) => setOpen(r)}
          activeRowId={open && open !== 'new' ? open.id : null}
          empty={empty}
          maxHeight={null}
        />
      ) : venues.isPending ? (
        <div className="space-y-2.5" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" rounded="lg" />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="space-y-2.5" aria-label="Venues">
          {rows.map((v, i) => (
            <motion.li key={v.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
              <Card padding="none" interactive className="group">
                <button type="button" onClick={() => setOpen(v)} className="flex w-full items-center gap-3 rounded-[20px] p-4 text-left focus-visible:outline-2 focus-visible:outline-focus">
                  <KindIcon kind={v.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{v.name}</span>
                    <span className="block truncate text-sm text-ink-3">{venueSummary(v) || VENUE_KIND_META[v.kind].label}</span>
                  </span>
                  <Badge size="sm" tone={v.eventCount ? 'blue' : 'neutral'}>
                    {v.eventCount === 1 ? '1 event' : `${v.eventCount ?? 0} events`}
                  </Badge>
                </button>
                {v.mapsUrl ? (
                  <div className="border-t border-line px-4 py-2">
                    <a href={v.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue">
                      <MapPin className="size-4" aria-hidden="true" /> Open in Maps <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                ) : null}
              </Card>
            </motion.li>
          ))}
        </ul>
      ) : (
        empty
      )}

      <VenueSheet
        venue={open}
        onClose={() => setOpen(null)}
        canManage={canManage}
        draftName={search && !rows.length ? search : undefined}
        onDelete={(v) => setToDelete(v)}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        destructive
        title={toDelete ? `Delete ${toDelete.name}?` : 'Delete room?'}
        confirmLabel="Delete room"
        typeToConfirm={toDelete && (toDelete.eventCount ?? 0) > 0 ? toDelete.name : undefined}
        description={
          toDelete ? (
            (toDelete.eventCount ?? 0) > 0 ? (
              <>
                {pluralize(toDelete.eventCount ?? 0, 'event')} {toDelete.eventCount === 1 ? 'uses' : 'use'} this room. They keep their date and everything else, but lose the room, so each one needs a new
                one picked. This cannot be undone.
              </>
            ) : (
              'No events use this room, so nothing else changes. This cannot be undone.'
            )
          ) : undefined
        }
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await api.delete(`/admin/venues/${toDelete.id}`);
          } catch (err) {
            notify.error(err);
            throw err;
          }
          await qc.invalidateQueries({ queryKey: adminKeys.venues.all });
          await qc.invalidateQueries({ queryKey: adminKeys.events.all });
          notify.success(`${toDelete.name} is gone.`);
          setOpen(null);
        }}
      />
    </div>
  );
}
