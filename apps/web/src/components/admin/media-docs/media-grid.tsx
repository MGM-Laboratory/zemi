'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EventMediaAdminItem } from '@zemi/shared';
import { ArrowLeftToLine, ChevronLeft, ChevronRight, Expand, GripVertical, MoreHorizontal, Play, Star, Trash2, TriangleAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useId, useRef, useState, type DOMAttributes, type ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { IconButton } from '@/components/admin/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/admin/ui/dropdown-menu';
import { AdminImage } from '@/components/admin/ui/media';
import { Spinner } from '@/components/admin/ui/spinner';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { cn } from '@/lib/admin/cn';
import { formatDuration } from '@/lib/admin/format';
import { useMediaQuery } from '@/lib/admin/hooks';
import { InlineEdit } from '../stream/inline-edit';

export interface MediaGridProps {
  items: EventMediaAdminItem[];
  canManage: boolean;
  onReorder: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onToggleFeatured: (item: EventMediaAdminItem) => void;
  onCaption: (item: EventMediaAdminItem, caption: string | null) => Promise<unknown>;
  onRemove: (item: EventMediaAdminItem) => void;
  /** Local preview (object URL) for files this tab just uploaded, shown while they process. */
  previewFor: (assetId: string) => string | null;
}

const SIZES = '(min-width: 2200px) 16vw, (min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw';

export function mediaLabel(item: EventMediaAdminItem, index: number) {
  const what = item.kind === 'video' ? 'Video' : 'Photo';
  return item.caption ? `${what} ${index + 1}, ${item.caption}` : `${what} ${index + 1}`;
}

/**
 * The documentation gallery. Drag a tile (mouse), long-press it (touch) or use its handle with
 * the keyboard (Space, arrows, Space) to reorder. Each tile has a star (featured), an inline
 * caption and a menu with move and remove.
 */
export function MediaGrid({ items, canManage, onReorder, onOpen, onToggleFeatured, onCaption, onRemove, previewFor }: MediaGridProps) {
  const dndId = useId();
  // A mouse drop is followed by a click on the tile: swallow that one click.
  const justDropped = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((i) => i.id);
  const pos = (id: string | number) => ids.indexOf(String(id)) + 1;
  const name = (id: string | number) => {
    const i = ids.indexOf(String(id));
    return i >= 0 ? mediaLabel(items[i]!, i) : 'item';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, position ${pos(active.id)} of ${ids.length}.`,
    onDragOver: ({ over }) => (over ? `Moved to position ${pos(over.id)} of ${ids.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${name(active.id)} dropped at position ${pos(over.id)} of ${ids.length}.` : 'Dropped.'),
    onDragCancel: () => 'Moving was cancelled. Nothing changed.',
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= items.length) return;
    onReorder(arrayMove(ids, from, to));
  };

  const markDropped = () => {
    justDropped.current = true;
    setTimeout(() => {
      justDropped.current = false;
    }, 0);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    markDropped();
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => {
        setActiveId(null);
        markDropped();
      }}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To move this, press Space. Use the arrow keys to pick a new spot, Space to drop it, or Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy} disabled={!canManage}>
        <ul
          aria-label="Documentation photos and videos, in the order the event page shows them"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5 min-[2200px]:grid-cols-6"
        >
          {items.map((item, index) => (
            <SortableTile
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              canManage={canManage}
              dragging={activeId === item.id}
              onOpen={() => {
                if (justDropped.current) return;
                onOpen(item.id);
              }}
              onToggleFeatured={() => onToggleFeatured(item)}
              onCaption={(c) => onCaption(item, c)}
              onRemove={() => onRemove(item)}
              onMove={(to) => move(index, to)}
              preview={previewFor(item.assetId)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableTile({
  item,
  index,
  total,
  canManage,
  dragging,
  onOpen,
  onToggleFeatured,
  onCaption,
  onRemove,
  onMove,
  preview,
}: {
  item: EventMediaAdminItem;
  index: number;
  total: number;
  canManage: boolean;
  dragging: boolean;
  onOpen: () => void;
  onToggleFeatured: () => void;
  onCaption: (caption: string | null) => Promise<unknown>;
  onRemove: () => void;
  onMove: (to: number) => void;
  preview: string | null;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !canManage });
  const reduce = useReducedMotion();
  const label = mediaLabel(item, index);
  // The media area is a mouse/touch drag surface; the keyboard uses the handle.
  const pointerListeners: Pick<DOMAttributes<HTMLButtonElement>, 'onMouseDown' | 'onTouchStart'> =
    canManage && listeners
      ? {
          onMouseDown: listeners.onMouseDown as DOMAttributes<HTMLButtonElement>['onMouseDown'],
          onTouchStart: listeners.onTouchStart as DOMAttributes<HTMLButtonElement>['onTouchStart'],
        }
      : {};
  const lifted = isDragging || dragging;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: lifted ? 20 : undefined }}
      className="relative min-w-0"
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: lifted ? 1.04 : 1, y: 0, rotate: lifted && !reduce ? 1.2 : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className={cn(
          'group/tile overflow-hidden rounded-[18px] border bg-white transition-[box-shadow,border-color] duration-200',
          item.featured ? 'border-yellow shadow-[0_0_0_2px_rgba(247,191,51,0.35)]' : 'border-line',
          lifted && 'shadow-[var(--shadow-3)] ring-2 ring-blue',
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-muted [-webkit-touch-callout:none] select-none">
          <button
            type="button"
            onClick={onOpen}
            {...pointerListeners}
            aria-label={`Open ${label}`}
            data-media-open={item.id}
            className={cn(
              'absolute inset-0 block size-full touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue',
              canManage ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
            )}
          >
            <TileMedia item={item} preview={preview} />
          </button>

          {/* Top row: handle + star */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
            {canManage ? (
              <Tooltip content="Drag to reorder">
                <button
                  type="button"
                  ref={setActivatorNodeRef}
                  {...attributes}
                  {...listeners}
                  aria-label={`Reorder ${label}`}
                  className="pointer-events-auto flex size-8 cursor-grab touch-none items-center justify-center rounded-full bg-white/90 text-ink-2 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-90 active:cursor-grabbing pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100 pointer-fine:focus-visible:opacity-100"
                >
                  <GripVertical className="size-4" aria-hidden="true" />
                </button>
              </Tooltip>
            ) : (
              <span />
            )}
            <StarButton featured={item.featured} canManage={canManage} disabled={item.status !== 'ready'} onClick={onToggleFeatured} label={label} />
          </div>

          {/* Bottom row: status / video badge */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
            {item.status === 'processing' ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/92 px-2 text-[0.6875rem] font-semibold text-blue-600 shadow-sm">
                <Spinner size={11} label={null} />
                {item.kind === 'video' ? 'Transcoding' : 'Processing'}
              </span>
            ) : item.status === 'failed' ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-red-600 px-2 text-[0.6875rem] font-semibold text-white shadow-sm">
                <TriangleAlert className="size-3" aria-hidden="true" />
                Didn&apos;t process
              </span>
            ) : (
              <span />
            )}
            {item.kind === 'video' ? (
              <span className="mono inline-flex h-6 items-center gap-1 rounded-full bg-black/65 px-2 text-[0.6875rem] text-white">
                <Play className="size-2.5 fill-current" aria-hidden="true" />
                {item.video?.durationSec ? formatDuration(item.video.durationSec) : 'Video'}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-11 items-center gap-1 px-2.5 py-1.5">
          <InlineEdit
            value={item.caption}
            placeholder={canManage ? 'Add a caption' : 'No caption'}
            label={`Caption for ${item.kind === 'video' ? 'video' : 'photo'} ${index + 1}`}
            readOnly={!canManage}
            maxLength={500}
            onSave={onCaption}
            className="min-w-0 flex-1 text-sm"
            textClassName="text-sm text-ink-2"
            inputClassName="h-8 text-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={`More for ${label}`} size="xs" variant="ghost">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[12rem]">
              <DropdownMenuItem icon={<Expand />} onSelect={onOpen}>
                Open big
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<ArrowLeftToLine />} disabled={index === 0} onSelect={() => onMove(0)}>
                    Move to the front
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={<ChevronLeft />} disabled={index === 0} onSelect={() => onMove(index - 1)}>
                    Move earlier
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={<ChevronRight />} disabled={index === total - 1} onSelect={() => onMove(index + 1)}>
                    Move later
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<Trash2 />} destructive onSelect={onRemove}>
                    Take out of the gallery
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>
    </li>
  );
}

function StarButton({ featured, canManage, disabled, onClick, label }: { featured: boolean; canManage: boolean; disabled: boolean; onClick: () => void; label: string }) {
  const reduce = useReducedMotion();
  const [pop, setPop] = useState(0);
  if (!canManage) {
    return featured ? (
      <span className="flex size-8 items-center justify-center rounded-full bg-yellow text-ink shadow-sm" title="Starred">
        <Star className="size-4 fill-current" aria-label="Starred" />
      </span>
    ) : (
      <span />
    );
  }
  return (
    <Tooltip content={featured ? 'Unstar' : disabled ? 'Star it once it finishes processing' : 'Star it: a big spot on the event page'}>
      <button
        type="button"
        onClick={() => {
          if (!featured) setPop((p) => p + 1);
          onClick();
        }}
        disabled={disabled && !featured}
        aria-pressed={featured}
        aria-label={featured ? `Unstar ${label}` : `Star ${label}`}
        className={cn(
          'pointer-events-auto relative flex size-8 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-90 disabled:opacity-50',
          featured ? 'bg-yellow text-ink' : 'bg-white/90 text-ink-3 hover:bg-white hover:text-ink pointer-fine:opacity-0 pointer-fine:group-hover/tile:opacity-100 pointer-fine:focus-visible:opacity-100',
        )}
      >
        <motion.span key={`star-${pop}`} initial={pop && !reduce ? { scale: 0.4, rotate: -72 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 14 }} className="flex">
          <Star className={cn('size-4', featured && 'fill-current')} aria-hidden="true" />
        </motion.span>
        {pop && featured && !reduce ? <StarBurst key={`burst-${pop}`} /> : null}
      </button>
    </Tooltip>
  );
}

function StarBurst() {
  const bits = [
    { c: 'bg-blue', x: -16, y: -10, r: 'rounded-full' },
    { c: 'bg-red', x: 14, y: -14, r: 'rounded-[2px] rotate-45' },
    { c: 'bg-green', x: -12, y: 14, r: 'rounded-t-full' },
    { c: 'bg-yellow', x: 16, y: 12, r: 'rounded-[3px]' },
  ];
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className={cn('absolute size-2', b.c, b.r)}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </span>
  );
}

/** Image, video poster (plays a muted loop on hover with a mouse), local preview while processing. */
function TileMedia({ item, preview }: { item: EventMediaAdminItem; preview: string | null }) {
  const reduce = useReducedMotion();
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [hover, setHover] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);

  if (item.status === 'ready' && item.kind === 'image' && item.image) {
    return (
      <AdminImage
        image={item.image}
        sizes={SIZES}
        alt=""
        className="size-full"
        imgClassName="transition-transform duration-700 ease-[var(--ease-out)] group-hover/tile:scale-[1.04]"
      />
    );
  }
  if (item.status === 'ready' && item.kind === 'video' && item.video) {
    const v = item.video;
    return (
      <span className="block size-full" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {v.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.poster} alt="" draggable={false} className="size-full object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover/tile:scale-[1.04]" loading="lazy" />
        ) : (
          <Placeholder>
            <Play className="size-7 text-ink-4" aria-hidden="true" />
          </Placeholder>
        )}
        {hover && fine && !reduce && v.mp4 ? (
          <video src={v.mp4} muted autoPlay loop playsInline className="absolute inset-0 size-full object-cover" aria-hidden="true" />
        ) : null}
      </span>
    );
  }
  if (item.status === 'failed') {
    return (
      <Placeholder className="bg-red-50">
        <Character shape="triangle" mood="oops" size={40} />
        <span className="mt-1 max-w-[12rem] truncate px-3 text-xs text-red-600">{item.originalFilename}</span>
      </Placeholder>
    );
  }
  // Processing: the local file if we have it, else a sleepy placeholder. Shimmer on top.
  return (
    <span className="zemi-tile-shimmer relative block size-full">
      {preview && !previewBroken ? (
        item.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" draggable={false} className="size-full object-cover opacity-80 saturate-[0.85]" onError={() => setPreviewBroken(true)} />
        ) : (
          <video src={`${preview}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover opacity-80" onError={() => setPreviewBroken(true)} aria-hidden="true" />
        )
      ) : item.image ? (
        <AdminImage image={item.image} sizes={SIZES} alt="" className="size-full opacity-80" />
      ) : (
        <Placeholder>
          <Character shape={item.kind === 'video' ? 'arch' : 'square'} mood="sleep" size={40} />
          <span className="mt-1 max-w-[12rem] truncate px-3 text-xs text-ink-3">{item.originalFilename}</span>
        </Placeholder>
      )}
    </span>
  );
}

function Placeholder({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('flex size-full flex-col items-center justify-center bg-surface-muted', className)}>{children}</span>;
}
