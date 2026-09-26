'use client';

import { VISIBILITIES, type Visibility } from '@zemi/shared';
import { ExternalLink, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  DateText,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  FilterBar,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  shapeForName,
  ShapeGlyph,
  Skeleton,
  StatusChip,
  type ColumnDef,
} from '@/components/admin/ui';
import { Can, useAbility } from '@/lib/admin/ability';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { publicPaths } from '@/lib/admin/paths';
import { useStoredState, ViewToggle, type ListView } from '../shared/content-ui';
import { effectiveActions, type SpeakerRow } from '../shared/types';
import { DeleteSpeakerDialog, type DeletableSpeaker } from './delete-speaker-dialog';
import { SORT_OPTIONS, useSpeakerList, type SpeakerSort } from './speaker-data';

const PAGE_SIZE = 24;
/** Table columns that phones skip (they sit inside the name cell instead, or wait for a bigger screen). */
const PHONE_HIDDEN = new Set(['org', 'visibility']);
const VIS_LABEL: Record<Visibility, string> = { draft: 'Draft', published: 'Published', unlisted: 'Unlisted' };
const SHAPE_BG = { circle: 'bg-blue-50', triangle: 'bg-red-50', square: 'bg-yellow-50', arch: 'bg-green-50' } as const;
const SHAPE_FG = { circle: 'text-blue', triangle: 'text-red', square: 'text-yellow', arch: 'text-green' } as const;

/** /admin/speakers: search, filter, sort, grid of faces or a dense table. */
export function SpeakersList() {
  const router = useRouter();
  const ability = useAbility();
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      vis: parseAsStringLiteral(VISIBILITIES),
      sort: parseAsStringLiteral(['name', 'recent', 'talks'] as const).withDefault('name'),
      page: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  );
  const [view, setView] = useStoredState<ListView>('speakers.view', 'grid', ['grid', 'table']);
  const [toDelete, setToDelete] = useState<DeletableSpeaker | null>(null);
  const list = useSpeakerList({ search: params.q, visibility: params.vis, sort: params.sort as SpeakerSort, page: params.page, pageSize: PAGE_SIZE });
  const rows = list.data?.items;
  const total = list.data?.total ?? 0;
  const filtered = Boolean(params.q || params.vis);

  const actionsFor = (row: SpeakerRow) => effectiveActions(row.permissions, (a) => ability.can('speaker', row.id, a));
  // Tablets and small laptops drop "Updated" so the table fits without scrolling sideways.
  const xl = useMediaQuery('(min-width: 1280px)');
  // Phones keep the table to name, talks and the menu. Visibility moves under the name.
  const wide = useMediaQuery('(min-width: 768px)');

  const columns = useMemo<ColumnDef<SpeakerRow>[]>(() => {
    const cols: ColumnDef<SpeakerRow>[] = [
      {
        id: 'fullName',
        header: 'Speaker',
        enableSorting: false,
        // On phones the name column takes whatever is left and truncates (max-width 0 is the table-cell trick).
        meta: { hideable: false, className: wide ? undefined : 'w-full max-w-0' },
        cell: ({ row: { original: s } }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={s.fullName} image={s.avatar} size={40} />
            <div className="min-w-0">
              <Link href={adminRoutes.speaker(s.id)} className="line-clamp-2 font-semibold break-words text-ink hover:text-blue focus-visible:outline-2 focus-visible:outline-focus">
                {s.fullName}
                {s.nickname ? <span className="ml-1.5 font-normal text-ink-3">({s.nickname})</span> : null}
              </Link>
              {s.headline ? <p className={cn(wide ? 'line-clamp-1' : 'truncate', 'max-w-[28rem] text-sm text-ink-3')}>{s.headline}</p> : null}
              {!wide && s.visibility && s.visibility !== 'published' ? <StatusChip kind="visibility" value={s.visibility} size="sm" className="mt-1" /> : null}
            </div>
          </div>
        ),
      },
      {
        id: 'org',
        header: 'Where they work',
        enableSorting: false,
        meta: { label: 'Organization' },
        cell: ({ row: { original: s } }) =>
          s.defaultOrganization || s.defaultPosition ? (
            <div className="min-w-0 text-sm">
              <p className="line-clamp-1 text-ink-2">{s.defaultOrganization}</p>
              {s.defaultPosition ? <p className="line-clamp-1 text-ink-4">{s.defaultPosition}</p> : null}
            </div>
          ) : (
            <span className="text-ink-4">Not set</span>
          ),
      },
      {
        id: 'talks',
        header: 'Talks',
        enableSorting: false,
        meta: { align: 'right', width: wide ? '6rem' : '4.25rem' },
        cell: ({ row: { original: s } }) => <span className="mono text-ink-2 tabular-nums">{s.talkCount ?? 0}</span>,
      },
      {
        id: 'visibility',
        header: 'Visibility',
        enableSorting: false,
        meta: { width: '9rem' },
        cell: ({ row: { original: s } }) => (s.visibility ? <StatusChip kind="visibility" value={s.visibility} size="sm" /> : null),
      },
      ...(xl
        ? [
            {
              id: 'updatedAt',
              header: 'Updated',
              enableSorting: false,
              meta: { width: '9rem' },
              cell: ({ row: { original: s } }) => <DateText value={s.updatedAt} format="relative" className="text-sm text-ink-3" fallback="" />,
            } satisfies ColumnDef<SpeakerRow>,
          ]
        : []),
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { width: wide ? '3.5rem' : '3rem', stopRowClick: true, hideable: false, align: 'right' },
        cell: ({ row: { original: s } }) => <RowMenu row={s} actions={actionsFor(s)} onDelete={() => setToDelete(s)} />,
      },
    ];
    return wide ? cols : cols.filter((c) => !PHONE_HIDDEN.has(c.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ability, xl, wide]);

  const chips = [
    ...(params.q ? [{ key: 'q', label: `Search: ${params.q}`, onRemove: () => void setParams({ q: null, page: null }) }] : []),
    ...(params.vis ? [{ key: 'vis', label: `Visibility: ${VIS_LABEL[params.vis]}`, onRemove: () => void setParams({ vis: null, page: null }) }] : []),
  ];

  const empty = filtered ? (
    <EmptyState
      framed={view === 'grid'}
      title="Nobody matches that."
      description="Try a shorter name, or clear the filters."
      cast={[
        { shape: 'circle', mood: 'look', size: 48, lookAt: { x: 0.6, y: -0.2 } },
        { shape: 'triangle', mood: 'oops', size: 36 },
      ]}
      action={
        <Button variant="secondary" onClick={() => void setParams({ q: null, vis: null, page: null })}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      framed={view === 'grid'}
      size="lg"
      title="No speakers yet."
      description="Add the first person who is brave enough to share half-finished research on a Friday."
      cast={[
        { shape: 'arch', mood: 'sleep', size: 56 },
        { shape: 'circle', mood: 'look', size: 40, lookAt: { x: -0.9, y: 0.3 } },
      ]}
      action={
        <Can cap="speakers.create">
          <Button variant="primary" icon={<Plus />} asChild>
            <Link href={adminRoutes.newSpeaker}>Add a speaker</Link>
          </Button>
        </Can>
      }
    />
  );

  const filterBar = (
    <FilterBar
      className={view === 'grid' || !wide ? 'mb-5' : 'w-full'}
      search={
        <SearchInput
          value={params.q}
          onValueChange={(q) => void setParams({ q: q || null, page: null })}
          placeholder="Search by name, nickname or org"
          loading={list.isFetching && !list.isPending}
          slashToFocus
        />
      }
      filters={
        <>
          <Select<Visibility>
            size="md"
            className="w-[9.5rem] sm:w-[10.5rem]"
            aria-label="Visibility"
            placeholder="Any visibility"
            clearable="Any visibility"
            value={params.vis}
            onValueChange={(v) => void setParams({ vis: v, page: null })}
            options={VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] }))}
          />
          <Select<SpeakerSort>
            size="md"
            className="w-[10.75rem] sm:w-[11.5rem]"
            aria-label="Sort"
            value={params.sort as SpeakerSort}
            onValueChange={(v) => v && void setParams({ sort: v === 'name' ? null : v, page: null })}
            options={SORT_OPTIONS}
          />
        </>
      }
      actions={<ViewToggle value={view} onChange={setView} />}
      chips={chips}
      onClearAll={() => void setParams({ q: null, vis: null, page: null })}
    />
  );

  return (
    <div>
      <PageHeader
        title="Speakers"
        description="Everyone who stood up on a Friday, and the ones about to. Talks show up here on their own once you add people to an event."
        meta={list.data ? <Badge tone="outline">{total.toLocaleString('en-US')} in the directory</Badge> : null}
        actions={
          <Can cap="speakers.create">
            <Button variant="primary" icon={<Plus />} asChild>
              <Link href={adminRoutes.newSpeaker}>New speaker</Link>
            </Button>
          </Can>
        }
      />

      {view === 'grid' || !wide || (list.isError && !rows) ? filterBar : null}

      {list.isError && !rows ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : view === 'table' ? (
        <DataTable
          toolbar={wide ? filterBar : undefined}
          // Phones already get a fixed, short column set, so the column and density buttons would only add a row.
          showViewOptions={wide}
          aria-label="Speakers"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          loading={list.isPending}
          fetching={list.isFetching}
          total={total}
          pagination={{ page: params.page, pageSize: PAGE_SIZE }}
          onPaginationChange={({ page }) => void setParams({ page: page === 1 ? null : page })}
          pageSizes={[PAGE_SIZE]}
          noun="speakers"
          storageKey="speakers"
          onRowClick={(r) => router.push(adminRoutes.speaker(r.id))}
          empty={empty}
          maxHeight={null}
        />
      ) : (
        <>
          {list.isPending ? (
            <SpeakerGridSkeleton />
          ) : rows && rows.length ? (
            <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6', list.isFetching && 'opacity-70 transition-opacity')} aria-label="Speakers">
              {rows.map((s, i) => (
                <SpeakerCard key={s.id} speaker={s} index={i} />
              ))}
            </ul>
          ) : (
            empty
          )}
          {total > PAGE_SIZE ? (
            <Pagination className="mt-6" page={params.page} pageSize={PAGE_SIZE} total={total} noun="speakers" onPageChange={(p) => void setParams({ page: p === 1 ? null : p })} />
          ) : null}
        </>
      )}

      <DeleteSpeakerDialog speaker={toDelete} open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)} />
    </div>
  );
}

function RowMenu({ row, actions, onDelete }: { row: SpeakerRow; actions: Set<string>; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`More for ${row.fullName}`} size="sm">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem icon={<Pencil />} href={adminRoutes.speaker(row.id)}>
          {actions.has('edit') ? 'Edit' : 'Open'}
        </DropdownMenuItem>
        {row.visibility !== 'draft' ? (
          <DropdownMenuItem icon={<ExternalLink />} href={publicPaths.speaker(row.slug)} external>
            View on site
          </DropdownMenuItem>
        ) : null}
        {actions.has('delete') ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Trash2 />} destructive onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpeakerCard({ speaker: s, index }: { speaker: SpeakerRow; index: number }) {
  const reduce = useReducedMotion();
  const shape = shapeForName(s.fullName);
  const talks = s.talkCount ?? 0;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay: Math.min(index, 12) * 0.03, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0"
    >
      <Link
        href={adminRoutes.speaker(s.id)}
        className="group relative flex h-full flex-col items-center rounded-[20px] border border-line bg-white px-3 pt-5 pb-4 text-center transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98] sm:rounded-[var(--radius-card)] sm:px-4 sm:pt-6"
      >
        <span className="relative mb-3 flex size-[5.5rem] items-center justify-center sm:size-24">
          <span
            className={cn(
              'absolute inset-0 rounded-full transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-110 group-hover:rotate-12',
              SHAPE_BG[shape],
            )}
            aria-hidden="true"
          />
          <ShapeGlyph
            shape={shape}
            className={cn(
              'absolute -top-0.5 -right-0.5 size-4 opacity-0 transition-all duration-300 group-hover:rotate-90 group-hover:opacity-100 group-focus-visible:opacity-100',
              SHAPE_FG[shape],
            )}
          />
          <Avatar name={s.fullName} image={s.avatar} size={80} className="relative" />
        </span>
        <span className="line-clamp-2 font-display text-[1.0625rem] leading-tight font-extrabold tracking-[-0.015em] text-ink transition-[font-variation-settings] duration-300 [font-variation-settings:'CASL'_0.2] group-hover:[font-variation-settings:'CASL'_0.8]">
          {s.fullName}
        </span>
        {s.nickname ? <span className="mt-0.5 text-sm text-ink-3">aka {s.nickname}</span> : null}
        <span className="mt-1 line-clamp-2 min-h-[2.4em] text-[0.8125rem] leading-snug text-ink-3">
          {s.headline || [s.defaultPosition, s.defaultOrganization].filter(Boolean).join(', ') || ' '}
        </span>
        <span className="mt-auto flex flex-wrap items-center justify-center gap-1.5 pt-3">
          <Badge size="sm" tone={talks ? 'blue' : 'neutral'} shape="circle">
            {talks === 1 ? '1 talk' : `${talks} talks`}
          </Badge>
          {s.visibility && s.visibility !== 'published' ? <StatusChip kind="visibility" value={s.visibility} size="sm" /> : null}
        </span>
      </Link>
    </motion.li>
  );
}

function SpeakerGridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" aria-busy="true" aria-label="Loading speakers">
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i}>
          <Card className="flex flex-col items-center gap-3 px-4 pt-6 pb-4">
            <Skeleton className="size-24" rounded="full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-2 h-5 w-16" rounded="full" />
          </Card>
        </li>
      ))}
    </ul>
  );
}
