'use client';

import { PUBLICATION_TYPE_LABELS, PUBLICATION_TYPES, VISIBILITIES, type PublicationType, type Visibility } from '@zemi/shared';
import { ExternalLink, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo, useState } from 'react';
import {
  AdminImage,
  AvatarStack,
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
import { effectiveActions, type PublicationRow } from '../shared/types';
import { DeletePublicationDialog } from './publication-activity';
import { SORT_OPTIONS, STATUS_LABELS, usePublicationList, type PublicationSort } from './publication-data';

const PAGE_SIZE = 24;
const VIS_LABEL: Record<Visibility, string> = { draft: 'Draft', published: 'Published', unlisted: 'Unlisted' };
const TYPE_SHAPE: Partial<Record<PublicationType, 'circle' | 'triangle' | 'square' | 'arch'>> = {
  'journal-article': 'square',
  'conference-paper': 'triangle',
  preprint: 'circle',
  thesis: 'arch',
  book: 'square',
  'book-chapter': 'square',
  dataset: 'circle',
  software: 'triangle',
  project: 'arch',
};
const SHAPE_TINT = { circle: 'bg-blue-50 text-blue', triangle: 'bg-red-50 text-red', square: 'bg-yellow-50 text-yellow', arch: 'bg-green-50 text-green' } as const;

function yearOptions() {
  const now = new Date().getFullYear() + 1;
  return Array.from({ length: now - 1989 }, (_, i) => String(now - i)).map((y) => ({ value: y, label: y }));
}

function Cover({ row, className }: { row: PublicationRow; className?: string }) {
  const shape = TYPE_SHAPE[row.type] ?? 'circle';
  return (
    <span className={cn('relative block shrink-0 overflow-hidden rounded-lg bg-surface-muted', className)}>
      {row.cover ? (
        <AdminImage image={row.cover} sizes="64px" className="size-full" imgClassName="transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <span className={cn('flex size-full items-center justify-center', SHAPE_TINT[shape])}>
          <ShapeGlyph shape={shape} className="size-4 transition-transform duration-500 group-hover:rotate-90" />
        </span>
      )}
    </span>
  );
}

function authorLine(row: PublicationRow): string {
  const names = (row.authors ?? []).map((a) => a.fullName).filter(Boolean);
  if (!names.length) return 'No authors yet';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** /admin/publications: filter by type, year, visibility and text. */
export function PublicationsList() {
  const router = useRouter();
  const ability = useAbility();
  const wide = useMediaQuery('(min-width: 768px)');
  const xl = useMediaQuery('(min-width: 1280px)');
  const xxl = useMediaQuery('(min-width: 1536px)');
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      type: parseAsStringLiteral(PUBLICATION_TYPES),
      year: parseAsInteger,
      vis: parseAsStringLiteral(VISIBILITIES),
      sort: parseAsStringLiteral(['year', 'recent', 'title'] as const).withDefault('year'),
      page: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  );
  const [toDelete, setToDelete] = useState<PublicationRow | null>(null);
  const list = usePublicationList({ search: params.q, type: params.type, year: params.year, visibility: params.vis, sort: params.sort as PublicationSort, page: params.page, pageSize: PAGE_SIZE });
  const rows = list.data?.items;
  const total = list.data?.total ?? 0;
  const filtered = Boolean(params.q || params.type || params.year || params.vis);
  const years = useMemo(yearOptions, []);
  const actionsFor = (row: PublicationRow) => effectiveActions(row.permissions, (a) => ability.can('publication', row.id, a));

  const columns = useMemo<ColumnDef<PublicationRow>[]>(
    () => [
      {
        id: 'title',
        header: 'Publication',
        enableSorting: false,
        meta: { hideable: false },
        cell: ({ row: { original: p } }) => (
          <div className="group flex min-w-0 items-center gap-3">
            <Cover row={p} className="h-14 w-[2.8rem]" />
            <div className="min-w-0">
              <Link href={adminRoutes.publication(p.id)} className="line-clamp-2 font-semibold text-ink hover:text-blue focus-visible:outline-2 focus-visible:outline-focus">
                {p.title}
              </Link>
              <p className="line-clamp-1 text-sm text-ink-3">{authorLine(p)}</p>
              {xl ? null : (
                <p className="line-clamp-1 text-sm text-ink-3">
                  {[p.containerTitle, PUBLICATION_TYPE_LABELS[p.type] ?? p.type].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        ),
      },
      // On tablets and small laptops "where" moves under the title so nothing scrolls sideways.
      ...(xl
        ? [
            {
              id: 'where',
              header: 'Where',
              enableSorting: false,
              cell: ({ row: { original: p } }) => (
                <div className="min-w-0 text-sm">
                  <p className="line-clamp-1 max-w-[16rem] text-ink-2">{p.containerTitle || <span className="text-ink-3">Not set</span>}</p>
                  <p className="line-clamp-1 text-ink-3">{PUBLICATION_TYPE_LABELS[p.type] ?? p.type}</p>
                </div>
              ),
            } satisfies ColumnDef<PublicationRow>,
          ]
        : []),
      {
        id: 'year',
        header: 'Year',
        enableSorting: false,
        meta: { width: '4.75rem' },
        cell: ({ row: { original: p } }) => <span className="mono tabular-nums">{p.publishedYear ?? <span className="text-ink-3">?</span>}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        meta: { width: '8.5rem' },
        cell: ({ row: { original: p } }) => (
          <div className="flex flex-wrap items-center gap-1">
            {p.visibility ? <StatusChip kind="visibility" value={p.visibility} size="sm" /> : null}
            {p.status && p.status !== 'published' ? (
              <Badge size="sm" tone="yellow">
                {STATUS_LABELS[p.status]}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'extras',
        header: 'Has',
        enableSorting: false,
        meta: { width: '8.25rem', label: 'PDF and DOI' },
        cell: ({ row: { original: p } }) => (
          <div className="flex flex-wrap items-center gap-1">
            {p.hasPdf ? (
              <Badge size="sm" tone="red" icon={<FileText />}>
                PDF
              </Badge>
            ) : null}
            {p.doi ? (
              <Badge size="sm" tone="outline">
                DOI
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'authors',
        header: 'Authors',
        enableSorting: false,
        meta: { width: '8rem' },
        cell: ({ row: { original: p } }) => <AvatarStack people={(p.authors ?? []).map((a) => ({ name: a.fullName, image: a.avatar }))} max={3} size={26} />,
      },
      ...(xxl
        ? [
            {
              id: 'updatedAt',
              header: 'Updated',
              enableSorting: false,
              meta: { width: '8rem' },
              cell: ({ row: { original: p } }) => <DateText value={p.updatedAt} format="relative" className="text-sm text-ink-3" />,
            } satisfies ColumnDef<PublicationRow>,
          ]
        : []),
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { width: '3.5rem', stopRowClick: true, hideable: false, align: 'right' },
        cell: ({ row: { original: p } }) => <RowMenu row={p} actions={actionsFor(p)} onDelete={() => setToDelete(p)} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ability, xl, xxl],
  );

  const clear = () => void setParams({ q: null, type: null, year: null, vis: null, page: null });
  const chips = [
    ...(params.q ? [{ key: 'q', label: `Search: ${params.q}`, onRemove: () => void setParams({ q: null, page: null }) }] : []),
    ...(params.type ? [{ key: 'type', label: `Type: ${PUBLICATION_TYPE_LABELS[params.type]}`, onRemove: () => void setParams({ type: null, page: null }) }] : []),
    ...(params.year ? [{ key: 'year', label: `Year: ${params.year}`, onRemove: () => void setParams({ year: null, page: null }) }] : []),
    ...(params.vis ? [{ key: 'vis', label: `Visibility: ${VIS_LABEL[params.vis]}`, onRemove: () => void setParams({ vis: null, page: null }) }] : []),
  ];

  // Someone who can't see a single publication (door crew who typed the URL) should not read "add the first one".
  const noAccess = !ability.isSuperadmin && !ability.canAny('publication', 'view') && !ability.has('publications.create');
  const empty = filtered ? (
    <EmptyState
      framed={!wide}
      title="Nothing on the shelf matches."
      description="Try fewer filters, or search by a word from the title."
      cast={[
        { shape: 'square', mood: 'look', size: 48, lookAt: { x: 0.7, y: -0.2 } },
        { shape: 'circle', mood: 'oops', size: 34 },
      ]}
      action={
        <Button variant="secondary" onClick={clear}>
          Clear filters
        </Button>
      }
    />
  ) : noAccess ? (
    <EmptyState
      framed={!wide}
      size="lg"
      title="No publications in your access."
      description="Your access covers other corners of the studio. Ask the superadmin if you need the shelf."
      cast={[{ shape: 'square', mood: 'look', size: 48, lookAt: { x: 0.7, y: -0.1 } }]}
    />
  ) : (
    <EmptyState
      framed={!wide}
      size="lg"
      title="No publications yet."
      description="Papers, theses, datasets, side projects. Paste a DOI and Crossref fills most of it in."
      cast={[
        { shape: 'square', mood: 'sleep', size: 56 },
        { shape: 'triangle', mood: 'look', size: 40, lookAt: { x: -0.9, y: 0.2 } },
      ]}
      action={
        <Can cap="publications.create">
          <Button variant="primary" icon={<Plus />} asChild>
            <Link href={adminRoutes.newPublication}>Add a publication</Link>
          </Button>
        </Can>
      }
    />
  );

  const filterBar = (
    <FilterBar
      className={wide ? 'w-full' : 'mb-5'}
      search={
        <SearchInput
          value={params.q}
          onValueChange={(q) => void setParams({ q: q || null, page: null })}
          placeholder="Search titles, authors, DOIs"
          loading={list.isFetching && !list.isPending}
          slashToFocus
        />
      }
      filters={
        <>
          <Select<PublicationType>
            className="w-[11rem]"
            aria-label="Type"
            placeholder="Any type"
            clearable="Any type"
            value={params.type}
            onValueChange={(v) => void setParams({ type: v, page: null })}
            options={PUBLICATION_TYPES.map((t) => ({ value: t, label: PUBLICATION_TYPE_LABELS[t] }))}
          />
          <Select
            className="w-[8rem]"
            aria-label="Year"
            placeholder="Any year"
            clearable="Any year"
            value={params.year ? String(params.year) : null}
            onValueChange={(v) => void setParams({ year: v ? Number(v) : null, page: null })}
            options={years}
          />
          <Select<Visibility>
            className="w-[10rem]"
            aria-label="Visibility"
            placeholder="Any visibility"
            clearable="Any visibility"
            value={params.vis}
            onValueChange={(v) => void setParams({ vis: v, page: null })}
            options={VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] }))}
          />
          <Select<PublicationSort>
            className="w-[10.5rem]"
            aria-label="Sort"
            value={params.sort as PublicationSort}
            onValueChange={(v) => v && void setParams({ sort: v === 'year' ? null : v, page: null })}
            options={SORT_OPTIONS}
          />
        </>
      }
      chips={chips}
      onClearAll={clear}
    />
  );

  return (
    <div>
      <PageHeader
        title="Publications"
        description="Everything the lab has written or built, with authors linked to the speaker directory. Events can point to these."
        meta={
          list.data && !noAccess ? (
            <Badge tone="outline">
              {total.toLocaleString('en-US')} {ability.canAll('publication', 'view') ? 'on the shelf' : 'in your access'}
            </Badge>
          ) : null
        }
        actions={
          <Can cap="publications.create">
            <Button variant="primary" icon={<Plus />} asChild>
              <Link href={adminRoutes.newPublication}>New publication</Link>
            </Button>
          </Can>
        }
      />

      {wide && !(list.isError && !rows) ? null : filterBar}

      {list.isError && !rows ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : wide ? (
        <DataTable
          toolbar={filterBar}
          aria-label="Publications"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          loading={list.isPending}
          fetching={list.isFetching}
          total={total}
          pagination={{ page: params.page, pageSize: PAGE_SIZE }}
          onPaginationChange={({ page }) => void setParams({ page: page === 1 ? null : page })}
          pageSizes={[PAGE_SIZE]}
          noun="publications"
          storageKey="publications"
          initialColumnVisibility={{ authors: false }}
          onRowClick={(r) => router.push(adminRoutes.publication(r.id))}
          empty={empty}
          maxHeight={null}
        />
      ) : (
        <>
          {list.isPending ? (
            <div className="space-y-2.5" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" rounded="lg" />
              ))}
            </div>
          ) : rows?.length ? (
            <ul className="space-y-2.5" aria-label="Publications">
              {rows.map((p, i) => (
                <MobileRow key={p.id} row={p} index={i} />
              ))}
            </ul>
          ) : (
            empty
          )}
          {total > PAGE_SIZE ? (
            <Pagination className="mt-6" page={params.page} pageSize={PAGE_SIZE} total={total} noun="publications" onPageChange={(p) => void setParams({ page: p === 1 ? null : p })} />
          ) : null}
        </>
      )}

      <DeletePublicationDialog
        pub={toDelete ? { id: toDelete.id, title: toDelete.title, slug: toDelete.slug, eventCount: toDelete.eventCount } : null}
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
      />
    </div>
  );
}

function MobileRow({ row: p, index }: { row: PublicationRow; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }}>
      <Card padding="none" interactive className="group">
        <Link href={adminRoutes.publication(p.id)} className="flex gap-3 rounded-[20px] p-3.5 focus-visible:outline-2 focus-visible:outline-focus">
          <Cover row={p} className="h-[4.5rem] w-[3.6rem]" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 font-semibold leading-snug text-ink">{p.title}</span>
            <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-3">{authorLine(p)}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge size="sm" tone="outline">
                {PUBLICATION_TYPE_LABELS[p.type] ?? p.type}
                {p.publishedYear ? ` · ${p.publishedYear}` : ''}
              </Badge>
              {p.visibility && p.visibility !== 'published' ? <StatusChip kind="visibility" value={p.visibility} size="sm" /> : null}
              {p.hasPdf ? (
                <Badge size="sm" tone="red">
                  PDF
                </Badge>
              ) : null}
            </span>
          </span>
        </Link>
      </Card>
    </motion.li>
  );
}

function RowMenu({ row, actions, onDelete }: { row: PublicationRow; actions: Set<string>; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`More for ${row.title.length > 60 ? `${row.title.slice(0, 60).trimEnd()}...` : row.title}`} size="sm">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem icon={<Pencil />} href={adminRoutes.publication(row.id)}>
          {actions.has('edit') ? 'Edit' : 'Open'}
        </DropdownMenuItem>
        {row.visibility !== 'draft' ? (
          <DropdownMenuItem icon={<ExternalLink />} href={publicPaths.publication(row.slug)} external>
            View on site
          </DropdownMenuItem>
        ) : null}
        {row.doi ? (
          <DropdownMenuItem icon={<ExternalLink />} href={`https://doi.org/${row.doi}`} external>
            Open DOI
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
