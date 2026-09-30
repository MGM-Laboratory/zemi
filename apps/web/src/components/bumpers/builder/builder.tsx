'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Keyboard, Paintbrush, Plus, StickyNote, Timer, Type } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useAdminShell } from '@/components/admin/shell/admin-shell';
import { Button, IconButton } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/ui/feedback';
import { Kbd } from '@/components/admin/ui/media';
import { useBreadcrumbs } from '@/lib/admin/breadcrumbs';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { bumperKeys, bumpersApi } from '../api';
import { FOUR_CAST } from '../library/labels';
import { ObsGuideDialog } from '../live/obs-guide';
import { BuilderCanvas } from './canvas';
import { BuilderGallery } from './gallery';
import { HistorySheet } from './history';
import { BuilderInspector } from './inspector';
import { BuilderRail } from './rail';
import { BUILDER_SHORTCUTS, useBuilderShortcuts } from './shortcuts';
import { BuilderProvider, BuilderUiProvider, useBuilder, useBuilderUi, type InspectorTab } from './store';
import { ThemeSheet } from './theme-sheet';
import { BuilderNotices, BuilderTopbar } from './topbar';

/**
 * /admin/bumpers/[id]: the bumper builder. Loads the show (React Query, `bumperKeys.detail`),
 * then hands it to the builder store, which owns it from there (undo, autosave, conflicts).
 */
export function Builder({ id }: { id: string }) {
  const show = useQuery({
    queryKey: bumperKeys.detail(id),
    queryFn: ({ signal }) => bumpersApi.get(id, signal),
    // The store owns the document once loaded: a background refetch must never swap it out.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (show.data) {
    return (
      <BuilderFrame>
        <BuilderProvider key={id} detail={show.data}>
          <BuilderUiProvider>
            <BuilderLayout />
          </BuilderUiProvider>
        </BuilderProvider>
      </BuilderFrame>
    );
  }
  return (
    <BuilderFrame>
      <Crumbs label={show.isError ? 'Show' : 'Loading'} />
      {show.isError ? (
        <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-4 sm:p-8">
          <ErrorState
            className="w-full max-w-xl"
            error={show.error}
            onRetry={() => void show.refetch()}
            retrying={show.isFetching}
            action={
              <Button asChild variant="ghost">
                <Link href={adminRoutes.bumpers}>All shows</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <BuilderSkeleton />
      )}
    </BuilderFrame>
  );
}

function Crumbs({ label }: { label: string }) {
  useBreadcrumbs([{ label: 'Bumpers', href: adminRoutes.bumpers }, { label }]);
  return null;
}

/* ---------------------------------------------------------------- frame */

/**
 * The builder fills the window under the admin topbar, right of the sidebar (it follows the
 * sidebar collapsing), instead of sitting in the page's padded, max-width column.
 */
function BuilderFrame({ children }: { children: ReactNode }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const column = document.getElementById('admin-main')?.parentElement;
    if (!column) return;
    const ro = new ResizeObserver(() => {
      const pad = parseFloat(getComputedStyle(column).paddingLeft) || 0;
      setLeft(Math.round(column.getBoundingClientRect().left + pad));
    });
    ro.observe(column);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      data-bumper-builder=""
      className={cn('fixed top-[var(--admin-topbar-h)] right-0 bottom-0 z-20 flex flex-col overflow-hidden bg-white', left === null && 'left-0 lg:left-[var(--admin-sidebar-w)]')}
      style={left === null ? undefined : { left }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- layout */

function BuilderLayout() {
  useBuilderShortcuts();
  const wide = useMediaQuery('(min-width: 1280px)');
  const { state } = useBuilder();
  const { panel, openPanel } = useBuilderUi();
  const empty = !state.doc.slides.length;
  const stage = <section aria-label="Canvas" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-muted">{empty ? <EmptyStage /> : <BuilderCanvas />}</section>;

  return (
    <>
      <BuilderTopbar />
      <BuilderNotices />
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_360px]">
          <BuilderRail orientation="vertical" className="border-r border-line" />
          {stage}
          <aside aria-label="Inspector" className="flex min-h-0 min-w-0 flex-col border-l border-line bg-white">
            <BuilderInspector />
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <BuilderRail orientation="horizontal" className="shrink-0 border-b border-line" />
          {stage}
          {empty ? null : <InspectorDrawer />}
        </div>
      )}
      <BuilderGallery />
      <HistorySheet />
      <ThemeSheet />
      <ObsGuideDialog showId={state.showId} open={panel === 'obs'} onOpenChange={(o) => openPanel(o ? 'obs' : null)} />
      <ShortcutsDialog />
    </>
  );
}

function EmptyStage() {
  const { canEdit } = useBuilder();
  const { openGallery } = useBuilderUi();
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-4 sm:p-8">
      <EmptyState
        size="lg"
        className="w-full max-w-2xl"
        cast={FOUR_CAST}
        title="A blank stage."
        description={canEdit ? 'Pick a template or a block of bumpers from the gallery. Press N any time to add another.' : 'Nothing in this show yet.'}
        action={
          canEdit ? (
            <Button variant="primary" icon={<Plus />} onClick={() => openGallery(0)}>
              Add the first bumper
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------- inspector drawer (below 1280 px) */

const DRAWER_TABS: Array<{ key: InspectorTab; label: string; icon: typeof Type }> = [
  { key: 'content', label: 'Content', icon: Type },
  { key: 'style', label: 'Style', icon: Paintbrush },
  { key: 'timing', label: 'Timing', icon: Timer },
  { key: 'notes', label: 'Notes', icon: StickyNote },
];

/**
 * Tablets and phones: the inspector docks at the bottom. The tab bar opens it on Content, Style,
 * Timing or Notes; tapping the open tab (or the chevron) folds it away. The canvas stays usable.
 */
function InspectorDrawer() {
  const { state, setInspectorTab, setInspectorOpen } = useBuilder();
  const open = state.inspectorOpen;
  const tab = state.inspectorTab;
  return (
    <div className="relative z-[1] shrink-0 border-t border-line bg-white shadow-[0_-10px_30px_rgba(14,17,22,0.06)]">
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div id="builder-inspector-drawer" className="flex h-[min(44dvh,26rem)] flex-col sm:h-[min(46dvh,34rem)]" inert={!open}>
            <BuilderInspector />
          </div>
        </div>
      </div>
      <nav aria-label="Edit this bumper" className={cn('flex items-center gap-1 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]', open && 'border-t border-line')}>
        {DRAWER_TABS.map((t) => {
          const on = open && tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              aria-controls="builder-inspector-drawer"
              onClick={() => (on ? setInspectorOpen(false) : setInspectorTab(t.key, true))}
              className={cn(
                'flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-medium transition-colors sm:flex-row sm:gap-2 sm:text-sm',
                'focus-visible:outline-2 focus-visible:outline-focus',
                on ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-muted hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
        <IconButton label={open ? 'Fold the inspector away' : 'Open the inspector'} size="md" onClick={() => setInspectorOpen(!open)} aria-expanded={open} aria-controls="builder-inspector-drawer">
          {open ? <ChevronDown /> : <ChevronUp />}
        </IconButton>
      </nav>
    </div>
  );
}

/* ---------------------------------------------------------------- shortcuts dialog */

function ShortcutsDialog() {
  const { panel, openPanel } = useBuilderUi();
  const shell = useAdminShell();
  return (
    <Dialog
      open={panel === 'shortcuts'}
      onOpenChange={(o) => openPanel(o ? 'shortcuts' : null)}
      title="Builder shortcuts"
      description="Fewer clicks, more coffee. None of these fire while you type in a field."
      size="sm"
      footer={
        <Button
          variant="ghost"
          icon={<Keyboard />}
          onClick={() => {
            openPanel(null);
            shell.openShortcuts();
          }}
        >
          All admin shortcuts
        </Button>
      }
    >
      <ul className="space-y-2.5">
        {BUILDER_SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 text-[0.9375rem]">
            <span className="text-ink-2">{s.label}</span>
            <Kbd keys={s.keys} />
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 text-[0.9375rem]">
          <span className="text-ink-2">Pick up and move a bumper (in the running order)</span>
          <span className="flex shrink-0 items-center gap-1">
            <Kbd>Space</Kbd>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </span>
        </li>
      </ul>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- loading */

function BuilderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading the show">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3">
        <Skeleton className="size-9" rounded="full" />
        <Skeleton className="h-6 w-40 sm:w-64" />
        <Skeleton className="hidden h-8 w-44 md:block" rounded="full" />
        <span className="ml-auto flex gap-2">
          <Skeleton className="size-8" rounded="full" />
          <Skeleton className="hidden h-8 w-24 md:block" rounded="full" />
          <Skeleton className="h-8 w-20" rounded="full" />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col xl:grid xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div className="flex shrink-0 gap-3 overflow-hidden border-b border-line p-2.5 xl:flex-col xl:border-r xl:border-b-0 xl:p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="w-[7.5rem] shrink-0 xl:w-auto xl:pl-7">
              <Skeleton className="aspect-video w-full" rounded="lg" />
              <Skeleton className="mt-1.5 h-3 w-3/4" />
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 place-items-center bg-surface-muted p-6">
          <Skeleton className="aspect-video w-full max-w-4xl" rounded="lg" />
        </div>
        <div className="hidden flex-col gap-3 border-l border-line p-5 xl:flex">
          <Skeleton className="h-9 w-full" rounded="full" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex h-14 shrink-0 items-center gap-2 border-t border-line px-2 xl:hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 flex-1" rounded="lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
