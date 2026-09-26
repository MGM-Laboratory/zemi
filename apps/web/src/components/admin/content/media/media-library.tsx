'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { ASSET_PURPOSES, pluralize, type Asset, type AssetKind, type AssetPurpose, type AssetStatus, type Paginated } from '@zemi/shared';
import { FileText, ImageIcon, ImageOff, Music, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdminImage,
  Badge,
  Button,
  Callout,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  StatusChip,
} from '@/components/admin/ui';
import { useAbility } from '@/lib/admin/ability';
import { adminFetch } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { formatBytes, formatDuration } from '@/lib/admin/format';
import { adminKeys } from '@/lib/admin/query-keys';
import { toPaginated } from '../shared/types';
import { AssetSheet } from './asset-sheet';
import { extLabel, KIND_LABELS, PURPOSE_LABELS } from './media-meta';

const PAGE_SIZE = 36;
const KINDS = ['image', 'video', 'document', 'audio'] as const;
const STATUSES = ['processing', 'ready', 'failed'] as const;

/** /admin/media: every upload across the site, with filters and a detail sheet. */
export function MediaLibrary() {
  const ability = useAbility();
  const full = ability.isSuperadmin || ability.has('media.library');
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      purpose: parseAsStringLiteral(ASSET_PURPOSES),
      kind: parseAsStringLiteral(KINDS),
      status: parseAsStringLiteral(STATUSES),
      asset: parseAsString,
    },
    { history: 'replace' },
  );
  const filters = {
    search: params.q || undefined,
    purpose: params.purpose ?? undefined,
    kind: params.kind ?? undefined,
    status: params.status ?? undefined,
    mine: full ? undefined : true,
  };

  const list = useInfiniteQuery({
    queryKey: adminKeys.assets.list({ ...filters, view: 'library' }),
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) =>
      toPaginated(await adminFetch<Paginated<Asset>>('/admin/assets', { query: { ...filters, page: pageParam, pageSize: PAGE_SIZE }, signal }), pageParam, PAGE_SIZE),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    // Keep processing tiles fresh without hammering the API.
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((a) => a.status === 'processing')) ? 5000 : false),
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: Asset[] = [];
    for (const p of list.data?.pages ?? []) {
      for (const a of p.items) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push(a);
      }
    }
    return out;
  }, [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(params.q || params.purpose || params.kind || params.status);

  // Infinite scroll: load the next page when the sentinel comes near.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list]);

  const [selected, setSelected] = useState<Asset | null>(null);
  const openId = params.asset;
  const current = openId ? (items.find((a) => a.id === openId) ?? (selected?.id === openId ? selected : null)) : null;

  const chips = [
    ...(params.q ? [{ key: 'q', label: `Search: ${params.q}`, onRemove: () => void setParams({ q: null }) }] : []),
    ...(params.purpose ? [{ key: 'purpose', label: `Used for: ${PURPOSE_LABELS[params.purpose]}`, onRemove: () => void setParams({ purpose: null }) }] : []),
    ...(params.status ? [{ key: 'status', label: `Status: ${params.status}`, onRemove: () => void setParams({ status: null }) }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Media library"
        description="Every photo, video and PDF uploaded anywhere on Zemi. Fix alt text, credits and crops in one place."
        meta={list.data ? <Badge tone="outline">{pluralize(total, 'file')}</Badge> : null}
      />

      {!full ? (
        <Callout tone="neutral" className="mb-5" title="Showing your uploads">
          The full library needs the &quot;Browse media library&quot; permission. You can still tidy up the files you added.
        </Callout>
      ) : null}

      <FilterBar
        className="mb-5"
        search={<SearchInput value={params.q} onValueChange={(q) => void setParams({ q: q || null })} placeholder="Search file names, alt text, credits" loading={list.isFetching && !list.isPending && !list.isFetchingNextPage} slashToFocus />}
        filters={
          <>
            <SegmentedControl<'all' | AssetKind>
              aria-label="File type"
              value={params.kind ?? 'all'}
              onValueChange={(v) => void setParams({ kind: v === 'all' ? null : v })}
              options={[{ value: 'all', label: 'All' }, ...KINDS.map((k) => ({ value: k, label: KIND_LABELS[k].many }))]}
            />
            <Select<AssetPurpose>
              className="w-[12rem]"
              aria-label="Used for"
              placeholder="Used for anything"
              clearable="Used for anything"
              value={params.purpose}
              onValueChange={(v) => void setParams({ purpose: v })}
              options={ASSET_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
            />
            <Select<AssetStatus>
              className="w-[9.5rem]"
              aria-label="Status"
              placeholder="Any status"
              clearable="Any status"
              value={params.status}
              onValueChange={(v) => void setParams({ status: v })}
              options={[
                { value: 'ready', label: 'Ready' },
                { value: 'processing', label: 'Processing' },
                { value: 'failed', label: 'Failed' },
              ]}
            />
          </>
        }
        chips={chips}
        onClearAll={() => void setParams({ q: null, purpose: null, kind: null, status: null })}
      />

      {list.isError && !items.length ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : list.isPending ? (
        <GridSkeleton />
      ) : items.length ? (
        <>
          <ul className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7', list.isFetching && !list.isFetchingNextPage && 'opacity-70 transition-opacity')} aria-label="Files">
            {items.map((a, i) => (
              <AssetTile
                key={a.id}
                asset={a}
                index={i}
                active={openId === a.id}
                onOpen={() => {
                  setSelected(a);
                  void setParams({ asset: a.id });
                }}
              />
            ))}
          </ul>
          <div ref={sentinel} className="mt-6 flex flex-col items-center gap-2" aria-live="polite">
            {list.isFetchingNextPage ? (
              <Spinner size={28} label="Loading more files" />
            ) : list.hasNextPage ? (
              <Button variant="secondary" onClick={() => void list.fetchNextPage()}>
                Load more
              </Button>
            ) : total > PAGE_SIZE ? (
              <p className="text-sm text-ink-3">That is all {pluralize(total, 'file')}.</p>
            ) : null}
          </div>
        </>
      ) : filtered ? (
        <EmptyState
          title="Nothing matches that."
          description="Try fewer filters or a different word."
          cast={[
            { shape: 'square', mood: 'look', size: 50, lookAt: { x: 0.7, y: -0.3 } },
            { shape: 'triangle', mood: 'oops', size: 36 },
          ]}
          action={
            <Button variant="secondary" onClick={() => void setParams({ q: null, purpose: null, kind: null, status: null })}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          size="lg"
          title={full ? 'The library is empty.' : 'Nothing uploaded by you yet.'}
          description={
            full
              ? 'Covers, speaker photos, PDFs and documentation land here as people upload them.'
              : 'When you add a cover, a photo or a PDF anywhere in the studio, it shows up here so you can tidy it.'
          }
          cast={[
            { shape: 'square', mood: 'sleep', size: 56 },
            { shape: 'circle', mood: 'sleep', size: 42 },
          ]}
        />
      )}

      <AssetSheet
        asset={current}
        assetId={openId}
        onClose={() => {
          void setParams({ asset: null });
          setSelected(null);
        }}
      />
    </div>
  );
}

function AssetTile({ asset: a, index, active, onOpen }: { asset: Asset; index: number; active: boolean; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const label = a.alt || a.caption || a.originalFilename;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index % PAGE_SIZE, 18) * 0.018, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${KIND_LABELS[a.kind]?.one ?? 'File'}: ${label}`}
        aria-haspopup="dialog"
        className={cn(
          'group relative block aspect-square w-full overflow-hidden rounded-2xl border bg-surface-muted text-left transition-[border-color,box-shadow,transform] duration-200',
          'hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97]',
          active ? 'border-blue shadow-[0_0_0_3px_rgba(58,109,197,0.2)]' : 'border-line hover:border-line-strong',
        )}
      >
        <TileVisual asset={a} />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2.5 pt-8 pb-2 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <span className="block truncate text-[0.8125rem] font-semibold text-white">{a.originalFilename}</span>
          <span className="block truncate text-xs text-white/80">
            {PURPOSE_LABELS[a.purpose] ?? a.purpose} · {formatBytes(a.sizeBytes)}
          </span>
        </span>
        <span className="absolute top-2 left-2 flex flex-wrap gap-1">
          {a.status !== 'ready' ? <StatusChip kind="asset" value={a.status} size="sm" className="shadow-[var(--shadow-1)]" /> : null}
          {a.kind === 'image' && !a.alt && a.status === 'ready' ? (
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-2 shadow-[var(--shadow-1)]">No alt</span>
          ) : null}
        </span>
      </button>
    </motion.li>
  );
}

function TileVisual({ asset: a }: { asset: Asset }) {
  if (a.kind === 'image' && a.image) {
    return <AdminImage image={a.image} sizes="(min-width: 1536px) 14vw, (min-width: 1024px) 18vw, (min-width: 640px) 30vw, 48vw" className="absolute inset-0 size-full" imgClassName="transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.05]" />;
  }
  if (a.kind === 'image') {
    // No variants yet: the server is still rendering sizes (or gave up). Keep it a photo-shaped tile, not a paper.
    const failed = a.status === 'failed';
    const Glyph = failed ? ImageOff : ImageIcon;
    return (
      <span className={cn('absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center', failed ? 'bg-red-50' : 'zemi-skeleton')}>
        <span className={cn('flex size-12 items-center justify-center rounded-2xl bg-white/90 shadow-[var(--shadow-1)] transition-transform duration-300 group-hover:scale-105', failed ? 'text-red' : 'text-ink-3')}>
          <Glyph className="size-5" aria-hidden="true" />
        </span>
        <span className="line-clamp-2 text-xs font-medium text-ink-2">{a.originalFilename}</span>
      </span>
    );
  }
  if (a.kind === 'video') {
    return (
      <>
        <span className="absolute inset-0 bg-ink/90" />
        {a.video?.poster ? <SafePoster src={a.video.poster} /> : null}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-[var(--shadow-2)] transition-transform duration-300 group-hover:scale-110">
            <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" />
          </span>
        </span>
        {a.durationSec ?? a.video?.durationSec ? (
          <span className="mono absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] text-white group-hover:opacity-0">{formatDuration(a.durationSec ?? a.video?.durationSec ?? 0)}</span>
        ) : null}
      </>
    );
  }
  const Icon = a.kind === 'audio' ? Music : FileText;
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(0deg,transparent,transparent_23px,var(--color-graph)_23px,var(--color-graph)_24px),repeating-linear-gradient(90deg,transparent,transparent_23px,var(--color-graph)_23px,var(--color-graph)_24px)] bg-white p-3 text-center">
      <span className="relative flex h-16 w-12 items-center justify-center rounded-lg border border-line-strong bg-white shadow-[var(--shadow-1)] transition-transform duration-300 group-hover:-rotate-3">
        <Icon className="size-5 text-ink-3" aria-hidden="true" />
        <span className="mono absolute -bottom-2 rounded bg-red-600 px-1 text-[0.625rem] font-bold text-white">{extLabel(a)}</span>
      </span>
      <span className="line-clamp-2 text-xs font-medium text-ink-2">{a.originalFilename}</span>
    </span>
  );
}

/** Poster that quietly disappears when the file is missing, leaving the dark tile. */
function SafePoster({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
  );
}

function GridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7" aria-busy="true" aria-label="Loading files">
      {Array.from({ length: 18 }, (_, i) => (
        <li key={i}>
          <Skeleton className="aspect-square w-full" rounded="lg" />
        </li>
      ))}
    </ul>
  );
}
