'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BUMPER_MAX_SLIDES,
  BUMPER_TRANSITION_META,
  BUMPER_TRANSITIONS,
  planBumperTransitions,
  type BumperSlide,
  type BumperTransitionKey,
} from '@zemi/shared';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  CornerUpLeft,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Repeat,
  Sparkles,
  StickyNote,
  Timer,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { notify } from '@/components/admin/ui/toast';
import { Tooltip } from '@/components/admin/ui/tooltip';
import { cn } from '@/lib/admin/cn';
import { isMac, usePrefersReducedMotion } from '@/lib/admin/hooks';
import { formatDuration } from '@/lib/admin/format';
import { slideTitle } from '../library/labels';
import { BumperThumb } from './thumb';
import { TRANSITION_ICON, TransitionChip } from './transition-chip';
import { useBuilder, useBuilderUi } from './store';

type Orientation = 'vertical' | 'horizontal';

const lockX: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const lockY: Modifier = ({ transform }) => ({ ...transform, y: 0 });

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Delete slides with an undo toast (the rail's Delete key and the menu). */
export function useRemoveSlides() {
  const { removeSlides, undo, state } = useBuilder();
  return (ids: string[]) => {
    if (!ids.length) return;
    const first = state.doc.slides.find((s) => s.id === ids[0]);
    const name = ids.length === 1 && first ? `"${slideTitle(first, state.doc.theme, state.data, state.doc.eventId)}"` : plural(ids.length, 'bumper');
    removeSlides(ids);
    notify.success(`Removed ${name}.`, { action: { label: 'Undo', onClick: undo }, duration: 6000 });
  };
}

/**
 * The show's running order: live thumbnails you can drag, multi-select (shift, cmd or ctrl),
 * a menu per bumper (right click too), the transition between each pair, and "+" between
 * bumpers that opens the gallery right there. Vertical on wide screens, a filmstrip below that.
 *
 * Keyboard: arrows move between bumpers (shift extends the selection), Space lifts a bumper,
 * arrows move it, Space drops it, Escape cancels; Delete removes the selection; Shift+F10 or the
 * menu key opens the bumper's menu.
 */
export function BuilderRail({ orientation, className }: { orientation: Orientation; className?: string }) {
  const b = useBuilder();
  const { state, canEdit, select, reorder, moveSlides } = b;
  const { openGallery } = useBuilderUi();
  const remove = useRemoveSlides();
  const reduce = usePrefersReducedMotion();
  const { slides, theme, eventId } = state.doc;
  const { data, selected, current } = state;
  const vertical = orientation === 'vertical';

  const titles = useMemo(() => new Map(slides.map((s) => [s.id, slideTitle(s, theme, data, eventId)])), [slides, theme, data, eventId]);
  const plan = useMemo(() => planBumperTransitions(slides, theme.motion), [slides, theme.motion]);
  const indexOf = useMemo(() => new Map(slides.map((s, i) => [s.id, i])), [slides]);
  // The playable bumper before each one (hidden ones are skipped by playback).
  const prevPlayable = useMemo(() => {
    const map = new Map<string, BumperSlide>();
    let last: BumperSlide | null = null;
    for (const s of slides) {
      if (last && !s.hidden) map.set(s.id, last);
      if (!s.hidden) last = s;
    }
    return map;
  }, [slides]);
  const autoSec = useMemo(() => slides.reduce((n, s) => n + (!s.hidden && s.timing.autoAdvanceSec ? s.timing.autoAdvanceSec : 0), 0), [slides]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const inOrder = (ids: Iterable<string>) => {
    const set = new Set(ids);
    return slides.filter((s) => set.has(s.id)).map((s) => s.id);
  };

  /* ---------------------------------------------------------------- selection */

  const anchor = useRef<string | null>(current);
  const rows = useRef(new Map<string, HTMLElement>());
  const listRef = useRef<HTMLOListElement>(null);

  const focusRow = (id: string) => rows.current.get(id)?.focus({ preventScroll: true });

  const pick = (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && anchor.current && indexOf.has(anchor.current)) {
      const a = indexOf.get(anchor.current)!;
      const z = indexOf.get(id)!;
      const range = slides.slice(Math.min(a, z), Math.max(a, z) + 1).map((s) => s.id);
      select(range, id);
      return;
    }
    anchor.current = id;
    if (mod) {
      if (selectedSet.has(id) && selected.length > 1) {
        const rest = selected.filter((x) => x !== id);
        select(rest, current === id ? rest[rest.length - 1] : current);
      } else select(inOrder([...selected, id]), id);
      return;
    }
    select([id], id);
  };

  // Keep the bumper on the canvas in view as it changes ([ and ], the gallery, undo).
  useEffect(() => {
    if (!current) return;
    rows.current.get(current)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [current, reduce]);

  /* ---------------------------------------------------------------- menu */

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const targetsFor = (id: string) => (selectedSet.has(id) ? inOrder(selected) : [id]);

  /* ---------------------------------------------------------------- drag and drop */

  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 240, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );
  const [dragging, setDragging] = useState<{ id: string; ids: string[] } | null>(null);
  const ids = useMemo(() => slides.map((s) => s.id), [slides]);

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    const group = selectedSet.has(id) && selected.length > 1 ? inOrder(selected) : [id];
    if (!selectedSet.has(id)) select([id], id);
    setDragging({ id, ids: group });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const group = dragging?.ids ?? [String(e.active.id)];
    setDragging(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    if (group.length > 1) {
      if (group.includes(String(over.id))) return;
      const rest = ids.filter((x) => !group.includes(x));
      const at = rest.indexOf(String(over.id));
      moveSlides(group, to > from ? at + 1 : at);
    } else reorder(arrayMove(ids, from, to));
    requestAnimationFrame(() => focusRow(String(active.id)));
  };

  const labelOf = (id: string | number) => {
    const n = (indexOf.get(String(id)) ?? 0) + 1;
    return `${n}, ${titles.get(String(id)) ?? 'bumper'}`;
  };
  const posOf = (id: string | number) => (indexOf.get(String(id)) ?? 0) + 1;
  const count = dragging && dragging.ids.length > 1 ? `${dragging.ids.length} bumpers` : null;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${count ?? `bumper ${labelOf(active.id)}`}. Use the arrow keys to move, Space to drop, Escape to cancel.`,
    onDragOver: ({ over }) => (over ? `Over position ${posOf(over.id)} of ${slides.length}.` : 'Not over a spot in the list.'),
    onDragEnd: ({ over }) => (over ? `Dropped at position ${posOf(over.id)} of ${slides.length}.` : 'Dropped. Nothing moved.'),
    onDragCancel: () => 'Moving was cancelled. Nothing moved.',
  };

  /* ---------------------------------------------------------------- keyboard */

  const onRowKey = (id: string, e: KeyboardEvent<HTMLElement>) => {
    if (dragging) return;
    const i = indexOf.get(id) ?? 0;
    const back = vertical ? 'ArrowUp' : 'ArrowLeft';
    const fwd = vertical ? 'ArrowDown' : 'ArrowRight';
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    let to: number | null = null;
    if (e.key === back) to = Math.max(0, i - 1);
    else if (e.key === fwd) to = Math.min(slides.length - 1, i + 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = slides.length - 1;
    if (to !== null) {
      e.preventDefault();
      const next = slides[to]!.id;
      if (e.shiftKey) {
        const a = indexOf.get(anchor.current ?? id) ?? i;
        select(slides.slice(Math.min(a, to), Math.max(a, to) + 1).map((s) => s.id), next);
      } else {
        anchor.current = next;
        select([next], next);
      }
      focusRow(next);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit) {
      e.preventDefault();
      const gone = targetsFor(id);
      const after = slides.find((s, k) => k > i && !gone.includes(s.id)) ?? [...slides].reverse().find((s) => !gone.includes(s.id));
      remove(gone);
      if (after) {
        select([after.id], after.id);
        requestAnimationFrame(() => focusRow(after.id));
      }
      return;
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      anchor.current = id;
      select([id], id);
      return;
    }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      if (!selectedSet.has(id)) select([id], id);
      setMenuFor(id);
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      select(ids, current);
      return;
    }
    if (e.key === 'Escape' && selected.length > 1) {
      e.preventDefault();
      select([id], id);
    }
  };

  const full = slides.length >= BUMPER_MAX_SLIDES;
  const add = (at: number) => {
    if (full) notify.warning(`A show holds up to ${BUMPER_MAX_SLIDES} bumpers. Remove one to add another.`);
    else openGallery(at);
  };

  const listLabel = `Bumpers in this show, ${slides.length}`;

  return (
    <section className={cn('flex min-h-0 min-w-0 flex-col bg-white', className)} aria-label="Running order">
      {vertical ? (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
          <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-ink [font-variation-settings:'CASL'_0.2]">Running order</h2>
          <span className="mono text-[0.75rem] text-ink-3 tabular-nums">
            {slides.length}
            {autoSec ? ` · ${formatDuration(autoSec)} auto` : ''}
          </span>
          {canEdit ? (
            <Tooltip content="Add a bumper" shortcut="N">
              <button
                type="button"
                onClick={() => add(slides.length ? (indexOf.get(current ?? '') ?? slides.length - 1) + 1 : 0)}
                aria-label="Add a bumper"
                className="ml-auto flex size-8 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Plus className="size-4.5" aria-hidden="true" />
              </button>
            </Tooltip>
          ) : null}
        </header>
      ) : null}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[vertical ? lockX : lockY]}
        onDragStart={onDragStart}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: 'Press Space to pick up this bumper, the arrow keys to move it, and Space to drop it. Escape cancels.' },
        }}
      >
        <SortableContext items={ids} strategy={vertical ? verticalListSortingStrategy : horizontalListSortingStrategy} disabled={!canEdit}>
          <ol
            ref={listRef}
            aria-label={listLabel}
            className={cn(
              'min-h-0 min-w-0 flex-1 overscroll-contain [scrollbar-width:thin]',
              vertical ? 'overflow-y-auto pt-3 pb-4' : 'flex items-stretch overflow-x-auto px-2 py-2.5',
            )}
          >
            {slides.map((s, i) => (
              <RailItem
                key={s.id}
                slide={s}
                index={i}
                title={titles.get(s.id) ?? ''}
                orientation={orientation}
                selected={selectedSet.has(s.id)}
                current={s.id === current}
                ghost={!!dragging && dragging.ids.includes(s.id) && dragging.id !== s.id}
                dragging={!!dragging}
                loopIndex={s.timing.loopToId ? indexOf.get(s.timing.loopToId) : undefined}
                prev={prevPlayable.get(s.id) ?? null}
                prevIndex={(indexOf.get(prevPlayable.get(s.id)?.id ?? '') ?? 0) + 1}
                planned={plan[s.id] ?? null}
                canEdit={canEdit}
                menuOpen={menuFor === s.id}
                onMenuOpen={(o) => setMenuFor(o ? s.id : null)}
                onPick={pick}
                onKey={onRowKey}
                onAdd={add}
                rowRef={(el) => {
                  if (el) rows.current.set(s.id, el);
                  else rows.current.delete(s.id);
                }}
                menu={menuFor === s.id ? <RailMenu id={s.id} targets={targetsFor(s.id)} onAdd={add} onRemove={remove} /> : null}
              />
            ))}
            {canEdit ? (
              <li className={cn('list-none', vertical ? 'px-3 pt-3 pl-10' : 'flex shrink-0 items-start py-0 pr-1 pl-2')}>
                <button
                  type="button"
                  onClick={() => add(slides.length)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[0.8125rem] font-medium text-ink-3 transition',
                    'hover:border-ink-4 hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus',
                    vertical ? 'h-12 w-full' : 'aspect-video w-24 flex-col gap-1 text-[0.75rem] sm:w-28',
                  )}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {slides.length ? 'Add a bumper' : 'Add the first one'}
                </button>
              </li>
            ) : null}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={reduce ? null : undefined}>
          {dragging ? <DragGhost slide={slides.find((s) => s.id === dragging.id) ?? null} count={dragging.ids.length} orientation={orientation} seam={(indexOf.get(dragging.id) ?? 0) > 0} /> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

/* ---------------------------------------------------------------- one bumper */

interface RailItemProps {
  slide: BumperSlide;
  index: number;
  title: string;
  orientation: Orientation;
  selected: boolean;
  current: boolean;
  /** Part of a group being dragged (not the one under the pointer). */
  ghost: boolean;
  dragging: boolean;
  loopIndex: number | undefined;
  prev: BumperSlide | null;
  prevIndex: number;
  planned: BumperTransitionKey | null;
  canEdit: boolean;
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
  onPick: (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onKey: (id: string, e: KeyboardEvent<HTMLElement>) => void;
  onAdd: (at: number) => void;
  rowRef: (el: HTMLElement | null) => void;
  menu: ReactNode;
}

function RailItem(p: RailItemProps) {
  const { slide, index, title, orientation, selected, current, ghost, dragging, loopIndex, prev, prevIndex, planned, canEdit, menuOpen, onMenuOpen, onPick, onKey, onAdd, rowRef, menu } = p;
  const { state } = useBuilder();
  const vertical = orientation === 'vertical';
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
    disabled: !canEdit,
    attributes: { roleDescription: 'sortable bumper' },
  });
  const n = index + 1;
  const auto = slide.timing.autoAdvanceSec;
  const status = [
    slide.hidden ? 'hidden from playback' : null,
    auto ? `moves on after ${auto} seconds` : null,
    loopIndex !== undefined ? `then loops back to ${loopIndex + 1}` : null,
    slide.notes ? 'has notes' : null,
  ].filter(Boolean);
  const label = `${n}. ${title}${status.length ? `, ${status.join(', ')}` : ''}`;

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Right click on a selected bumper acts on the whole selection; elsewhere it picks that one.
    if (!selected) onPick(slide.id, { shiftKey: false, metaKey: false, ctrlKey: false });
    onMenuOpen(true);
  };

  const seam = index > 0 ? (
    <div
      className={cn(
        'group/seam flex shrink-0 items-center transition-opacity',
        vertical ? 'h-9 gap-2 pr-3 pl-10' : 'w-8 flex-col justify-center gap-1.5 self-stretch pb-5',
        dragging && 'pointer-events-none opacity-0',
      )}
    >
      {planned && prev && !slide.hidden ? (
        <TransitionChip from={prev} to={slide} planned={planned} fromIndex={prevIndex} toIndex={n} orientation={orientation} className={vertical ? 'min-w-0' : undefined} />
      ) : (
        <span className={cn('text-[0.6875rem] text-ink-4', !vertical && 'sr-only')}>{slide.hidden ? 'Skipped' : ''}</span>
      )}
      {canEdit ? (
        <Tooltip content={`Add a bumper here, before ${n}`}>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onAdd(index)}
            aria-label={`Add a bumper before ${n}`}
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-white text-ink-3 transition',
              'hover:border-ink hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-focus',
              vertical && 'ml-auto',
              '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/seam:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
            )}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  ) : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}
      className={cn('relative list-none', vertical ? 'block' : 'flex shrink-0 items-stretch')}
    >
      {seam}
      <div className={cn('group/row relative', vertical ? 'flex gap-2 pr-3 pl-2' : 'w-[7.5rem] sm:w-[8.5rem]')}>
        {vertical ? (
          <span className={cn('mono w-6 shrink-0 pt-1 text-right text-[0.75rem] tabular-nums', current ? 'font-bold text-ink' : 'text-ink-4')} aria-hidden="true">
            {n}
          </span>
        ) : null}
        <div
          ref={(el) => {
            setActivatorNodeRef(el);
            rowRef(el);
          }}
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={current ? 0 : -1}
          aria-pressed={selected}
          aria-current={current ? 'true' : undefined}
          aria-label={label}
          onClick={(e) => onPick(slide.id, e)}
          onKeyDown={(e) => {
            listeners?.onKeyDown?.(e);
            if (!e.defaultPrevented) onKey(slide.id, e);
          }}
          onContextMenu={onContextMenu}
          className={cn(
            'relative min-w-0 flex-1 cursor-pointer rounded-xl outline-none select-none [-webkit-touch-callout:none]',
            'focus-visible:[&>div:first-child]:outline-2 focus-visible:[&>div:first-child]:outline-offset-2 focus-visible:[&>div:first-child]:outline-focus',
            (isDragging || ghost) && 'opacity-35',
            canEdit && 'active:cursor-grabbing',
          )}
        >
          <BumperThumb
            slide={slide}
            theme={state.doc.theme}
            data={state.data}
            showEventId={state.doc.eventId}
            lazy
            className={cn(
              'aspect-video w-full rounded-lg ring-1 transition-shadow duration-150',
              current ? 'ring-2 ring-ink ring-offset-2 ring-offset-white' : selected ? 'ring-2 ring-blue ring-offset-2 ring-offset-white' : 'ring-line group-hover/row:ring-ink-4',
            )}
          >
            {slide.hidden ? <span className="absolute inset-0 bg-white/60" aria-hidden="true" /> : null}
            <Badges slide={slide} loopIndex={loopIndex} compact={!vertical} />
            {!vertical ? (
              <span className={cn('mono absolute top-1 left-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-md px-1 text-[0.625rem] tabular-nums', current ? 'bg-ink text-white' : 'bg-white/90 text-ink-2')}>{n}</span>
            ) : null}
          </BumperThumb>
          <p className={cn('truncate', vertical ? 'mt-1.5 px-0.5 text-[0.8125rem]' : 'mt-1 px-0.5 text-[0.6875rem]', current ? 'font-semibold text-ink' : 'text-ink-2', slide.hidden && 'text-ink-4 line-through decoration-ink-4/60')}>
            {title}
          </p>
        </div>
        <DropdownMenu open={menuOpen} onOpenChange={onMenuOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`More for bumper ${n}`}
              className={cn(
                'absolute flex size-6 items-center justify-center rounded-full bg-white/95 text-ink-2 shadow-[0_1px_3px_rgba(14,17,22,0.18)] transition',
                'hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-[state=open]:opacity-100',
                vertical ? 'top-1.5 right-4.5' : 'top-1 right-1',
                '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100',
                current && 'opacity-100 [@media(hover:hover)]:opacity-100',
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>
    </li>
  );
}

/** Timer, loop, hidden and notes badges over the thumbnail's bottom right corner. */
function Badges({ slide, loopIndex, compact }: { slide: BumperSlide; loopIndex: number | undefined; compact: boolean }) {
  const auto = slide.timing.autoAdvanceSec;
  const chip = cn('inline-flex items-center gap-0.5 rounded-full bg-ink/80 text-white backdrop-blur-[2px]', compact ? 'h-4 px-1 text-[0.5625rem]' : 'h-5 px-1.5 text-[0.625rem]');
  const icon = compact ? 'size-2.5' : 'size-3';
  if (!auto && loopIndex === undefined && !slide.hidden && !slide.notes) return null;
  return (
    <span className="mono pointer-events-none absolute right-1 bottom-1 flex gap-0.5 tabular-nums">
      {slide.hidden ? (
        <span className={chip}>
          <EyeOff className={icon} aria-hidden="true" />
        </span>
      ) : null}
      {slide.notes ? (
        <span className={chip}>
          <StickyNote className={icon} aria-hidden="true" />
        </span>
      ) : null}
      {auto ? (
        <span className={chip}>
          <Timer className={icon} aria-hidden="true" />
          {auto}s
        </span>
      ) : null}
      {loopIndex !== undefined ? (
        <span className={cn(chip, 'bg-blue/90')}>
          <Repeat className={icon} aria-hidden="true" />
          {loopIndex + 1}
        </span>
      ) : null}
    </span>
  );
}

function DragGhost({ slide, count, orientation, seam }: { slide: BumperSlide | null; count: number; orientation: Orientation; seam: boolean }) {
  const { state } = useBuilder();
  if (!slide) return null;
  return (
    <div className={cn('relative rotate-[-2deg] cursor-grabbing', orientation === 'vertical' ? cn('ml-10 w-[13.5rem]', seam && 'mt-9') : cn('w-[7.5rem] sm:w-[8.5rem]', seam && 'ml-8'))}>
      {count > 1 ? <span className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg bg-white ring-1 ring-line-strong" aria-hidden="true" /> : null}
      <BumperThumb slide={slide} theme={state.doc.theme} data={state.data} showEventId={state.doc.eventId} className="aspect-video w-full rounded-lg shadow-[0_18px_40px_rgba(14,17,22,0.28)] ring-2 ring-ink" />
      {count > 1 ? <span className="mono absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink text-[0.6875rem] font-bold text-white">{count}</span> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- the menu */

function RailMenu({ id, targets, onAdd, onRemove }: { id: string; targets: string[]; onAdd: (at: number) => void; onRemove: (ids: string[]) => void }) {
  const { state, canEdit, duplicateSlides, setHidden, moveSlides, setTiming, edit } = useBuilder();
  const { slides, theme, eventId } = state.doc;
  const i = slides.findIndex((s) => s.id === id);
  const slide = slides[i];
  if (!slide) return null;
  const many = targets.length > 1;
  const what = many ? `${targets.length} bumpers` : 'this bumper';
  const allHidden = targets.every((t) => slides.find((s) => s.id === t)?.hidden);
  const earlier = slides.slice(0, i + 1);
  const title = (s: BumperSlide) => slideTitle(s, theme, state.data, eventId);
  const transitions = new Set(targets.map((t) => slides.find((s) => s.id === t)?.transitionIn ?? 'auto'));
  const transitionValue = transitions.size === 1 ? [...transitions][0]! : '';
  const setTransition = (key: string) =>
    edit((d) => ({ ...d, slides: d.slides.map((s) => (targets.includes(s.id) && s.transitionIn !== key ? { ...s, transitionIn: key as BumperSlide['transitionIn'] } : s)) }));
  const loopTo = (target: string | null) => {
    const sec = slide.timing.autoAdvanceSec;
    setTiming(slide.id, target ? { loopToId: target, autoAdvanceSec: sec ?? 15 } : { loopToId: null });
    if (target && !sec) notify.info('It now moves on after 15 seconds and loops back. Change the timing in the inspector.');
  };

  if (!canEdit) {
    return (
      <DropdownMenuContent align="start" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
        <p className="px-2.5 py-2 text-sm text-ink-3">{state.status === 'archived' ? 'Archived. Restore it to make changes.' : 'This show is view only for you.'}</p>
      </DropdownMenuContent>
    );
  }
  return (
    <DropdownMenuContent align="start" className="w-64">
      <DropdownMenuItem icon={<Copy />} shortcut={isMac() ? '⌘D' : 'Ctrl+D'} onSelect={() => duplicateSlides(targets)}>
        {many ? `Duplicate ${targets.length} bumpers` : 'Duplicate'}
      </DropdownMenuItem>
      <DropdownMenuItem icon={allHidden ? <Eye /> : <EyeOff />} onSelect={() => setHidden(targets, !allHidden)}>
        {allHidden ? 'Show in playback' : 'Skip in playback'}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<Plus />} onSelect={() => onAdd(i + 1)}>
        Add a bumper after
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<ArrowUpToLine />} disabled={i === 0 && !many} onSelect={() => moveSlides(targets, 0)}>
        Move to the top
      </DropdownMenuItem>
      <DropdownMenuItem icon={<ArrowDownToLine />} disabled={i === slides.length - 1 && !many} onSelect={() => moveSlides(targets, slides.length)}>
        Move to the bottom
      </DropdownMenuItem>
      {!many ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={<CornerUpLeft />}>Loop back to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
            <DropdownMenuRadioGroup value={slide.timing.loopToId ?? ''} onValueChange={(v) => loopTo(v || null)}>
              <DropdownMenuRadioItem value="">No loop, carry on</DropdownMenuRadioItem>
              {earlier.map((s, k) => (
                <DropdownMenuRadioItem key={s.id} value={s.id}>
                  <span className="mono mr-1.5 text-ink-4 tabular-nums">{k + 1}</span>
                  <span className="truncate">{title(s)}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger icon={<Wand2 />}>Transition in</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto">
          <DropdownMenuRadioGroup value={transitionValue} onValueChange={setTransition}>
            <DropdownMenuRadioItem value="auto">
              <Sparkles className="mr-1.5 size-3.5 text-ink-3" aria-hidden="true" />
              Auto
            </DropdownMenuRadioItem>
            {BUMPER_TRANSITIONS.map((k) => {
              const Icon = TRANSITION_ICON[k];
              return (
                <DropdownMenuRadioItem key={k} value={k}>
                  <Icon className="mr-1.5 size-3.5 text-ink-3" aria-hidden="true" />
                  {BUMPER_TRANSITION_META[k].label}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<Trash2 />} destructive shortcut="Del" onSelect={() => onRemove(targets)}>
        Delete {what}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
