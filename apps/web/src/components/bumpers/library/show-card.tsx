'use client';

import { canCreateBumpers, type BumperData, type BumperShowRow } from '@zemi/shared';
import {
  ArchiveRestore,
  Archive,
  CopyPlus,
  Gamepad2,
  Layers,
  MonitorPlay,
  MoreHorizontal,
  PanelTop,
  Play,
  Timer,
  Trash2,
  Tv,
} from 'lucide-react';
import Link from 'next/link';
import { memo, useState, type FocusEvent } from 'react';
import { Badge, ShapeGlyph } from '@/components/admin/ui/badge';
import { Button, IconButton } from '@/components/admin/ui/button';
import { DateText } from '@/components/admin/ui/display';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { Skeleton } from '@/components/admin/ui/feedback';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { useAbility } from '@/lib/admin/ability';
import { cn } from '@/lib/admin/cn';
import { useMediaQuery, usePrefersReducedMotion } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { ACCENT_SHAPE } from '../engine/palette';
import { countLabel, eventChipLabel, runtimeLabel } from './labels';
import { SlideThumb } from './slide-thumb';
import type { ShowActions } from './use-show-actions';

const ACCENT_TEXT = { blue: 'text-blue', red: 'text-red', yellow: 'text-yellow-600', green: 'text-green' } as const;

/** "Zemi #98 · 2 Oct" with the event's shape, or "Standalone". */
export function EventChip({ event, className }: { event: BumperShowRow['event']; className?: string }) {
  if (!event) {
    return (
      <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-0.5 text-[0.75rem] font-medium text-ink-2', className)}>
        <ShapeGlyph shape="dot" className="text-ink-4" />
        Standalone
      </span>
    );
  }
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-0.5 text-[0.75rem] font-medium text-ink-2', className)} title={event.title}>
      <ShapeGlyph shape={ACCENT_SHAPE[event.accent]} className={ACCENT_TEXT[event.accent]} />
      <span className="truncate">{eventChipLabel(event)}</span>
    </span>
  );
}

/** Red pill with a pulsing dot: an OBS output is connected right now. */
export function OnAirBadge({ outputs, className }: { outputs: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full bg-red px-2.5 py-1 text-[0.75rem] leading-none font-semibold text-white shadow-[0_2px_10px_rgba(249,65,65,0.35)]', className)}
      title={outputs === 1 ? 'One OBS output is connected' : `${outputs} OBS outputs are connected`}
    >
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full rounded-full bg-white/80 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-white" />
      </span>
      On air
    </span>
  );
}

export interface ShowCardProps {
  row: BumperShowRow;
  data: BumperData;
  actions: ShowActions;
  /** A write on this show is in flight. */
  busy?: boolean;
  onObs: (row: BumperShowRow) => void;
  /** Hide the event chip (inside an event's own tab). */
  hideEvent?: boolean;
}

/**
 * One show in the library: its first bumper as a live mini stage (the entrance plays on hover or
 * focus with a fine pointer), title, event, size, runtime, who touched it last, and the actions
 * the principal has on it.
 */
export const ShowCard = memo(function ShowCard({ row, data, actions, busy, onObs, hideEvent }: ShowCardProps) {
  const ability = useAbility();
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reduce = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const canRun = row.permissions.includes('run');
  const canEdit = row.permissions.includes('edit');
  const canDuplicate = canRun && canCreateBumpers(ability, row.eventId);
  const archived = row.status === 'archived';
  const runtime = runtimeLabel(row.autoRuntimeSec);

  const start = () => {
    if (!fine || reduce || !row.cover) return;
    setPlaying(true);
    setReplay((n) => n + 1);
  };
  const stop = () => setPlaying(false);
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stop();
  };

  return (
    <article
      className={cn(
        'group/card relative flex h-full flex-col overflow-hidden rounded-[22px] border border-line bg-white transition-[border-color,box-shadow,transform,opacity] duration-200',
        'focus-within:border-line-strong hover:border-line-strong hover:shadow-[var(--shadow-2)] motion-safe:hover:-translate-y-0.5',
        busy && 'pointer-events-none opacity-60',
      )}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') start();
      }}
      onPointerLeave={stop}
      onFocus={start}
      onBlur={onBlur}
      aria-busy={busy || undefined}
    >
      <div className="relative" aria-hidden="true">
        <SlideThumb
          slide={row.cover}
          theme={row.theme}
          data={data}
          showEventId={row.eventId}
          live={playing}
          replayKey={replay}
          className={cn('aspect-video w-full', archived && 'opacity-70 grayscale-[0.35]')}
          empty={<EmptyCover />}
        />
        {/* Top right: slides keep their corner bug top left. */}
        <div className="pointer-events-none absolute top-0 right-0 flex items-start gap-2 p-2.5">
          {row.live.onAir && !archived ? <OnAirBadge outputs={row.live.outputs} /> : archived ? <Badge tone="outline" size="sm" className="bg-white/95">Archived</Badge> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        {hideEvent ? null : <EventChip event={row.event} className="self-start" />}
        <h3 className="line-clamp-2 font-display text-[1.125rem] leading-tight font-extrabold tracking-[-0.02em] text-ink [font-variation-settings:'CASL'_0.3]">
          <Link
            href={adminRoutes.bumper(row.id)}
            className="after:absolute after:inset-0 after:rounded-[22px] after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus focus-visible:after:ring-inset"
          >
            {row.title}
          </Link>
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="size-3.5 text-ink-4" aria-hidden="true" />
            {countLabel(row.slideCount)}
          </span>
          <Tooltip content={runtime ? 'Bumpers that move on by themselves add up to this. The ones you click through add to it.' : 'Every bumper waits for a click, so the show runs at your pace.'}>
            <span className="relative z-10 inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-focus" tabIndex={0}>
              <Timer className="size-3.5 text-ink-4" aria-hidden="true" />
              {runtime ?? 'At your pace'}
            </span>
          </Tooltip>
        </p>
        <p className="truncate text-[0.8125rem] text-ink-3">
          Updated <DateText value={row.updatedAt} format="relative" />
          {row.updatedByName ? ` by ${row.updatedByName}` : ''}
        </p>

        <div className="relative z-10 mt-auto flex items-center gap-2 pt-2">
          {archived ? (
            canEdit ? (
              <Button size="sm" variant="secondary" icon={<ArchiveRestore />} onClick={() => actions.restore(row)}>
                Restore
              </Button>
            ) : null
          ) : !row.cover ? (
            // Nothing playable yet (empty, or every bumper hidden): the next step is the builder.
            <Button size="sm" variant={canEdit ? 'primary' : 'secondary'} asChild>
              <Link href={adminRoutes.bumper(row.id)}>
                <PanelTop />
                {canEdit ? 'Add bumpers' : 'Open'}
              </Link>
            </Button>
          ) : canRun ? (
            <>
              <Button size="sm" variant="primary" asChild>
                <Link href={adminRoutes.bumperPlay(row.id)}>
                  <Play />
                  Play
                </Link>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <Link href={adminRoutes.bumperControl(row.id)}>
                  <Gamepad2 />
                  Controller
                </Link>
              </Button>
            </>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={`More for ${row.title}`} size="sm" tooltip={false} className="ml-auto">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[13rem]">
              <DropdownMenuItem icon={<PanelTop />} href={adminRoutes.bumper(row.id)}>
                {canEdit ? 'Open the builder' : 'Open'}
              </DropdownMenuItem>
              {canRun && !archived ? (
                <>
                  {row.cover ? (
                    <>
                      <DropdownMenuItem icon={<MonitorPlay />} href={adminRoutes.bumperPlay(row.id)}>
                        Play full window
                      </DropdownMenuItem>
                      <DropdownMenuItem icon={<Gamepad2 />} href={adminRoutes.bumperControl(row.id)}>
                        Controller
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  <DropdownMenuItem icon={<Tv />} onSelect={() => onObs(row)}>
                    OBS setup
                  </DropdownMenuItem>
                </>
              ) : null}
              {canDuplicate || canEdit ? <DropdownMenuSeparator /> : null}
              {canDuplicate ? (
                <DropdownMenuItem icon={<CopyPlus />} onSelect={() => actions.duplicate(row)}>
                  Duplicate
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                archived ? (
                  <DropdownMenuItem icon={<ArchiveRestore />} onSelect={() => actions.restore(row)}>
                    Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem icon={<Archive />} onSelect={() => void actions.archive(row)}>
                    Archive
                  </DropdownMenuItem>
                )
              ) : null}
              {canEdit ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => void actions.remove(row)}>
                    Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
});

/** A show with no bumpers yet. */
function EmptyCover() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-surface-muted text-center">
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <ShapeGlyph shape="circle" className="size-3 text-blue" />
        <ShapeGlyph shape="triangle" className="size-3 text-red" />
        <ShapeGlyph shape="square" className="size-3 text-yellow" />
        <ShapeGlyph shape="arch" className="size-3 text-green" />
      </span>
      <span className="label text-ink-3">No bumpers yet</span>
      <span className="text-[0.8125rem] text-ink-3">Open it to add the first one.</span>
    </div>
  );
}

export function ShowCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-white" aria-hidden="true">
      <Skeleton className="aspect-video w-full" rounded="sm" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-5 w-28" rounded="full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 w-20" rounded="full" />
          <Skeleton className="h-8 w-28" rounded="full" />
        </div>
      </div>
    </div>
  );
}
