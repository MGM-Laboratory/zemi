'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from './dnd-modifiers';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { forwardRef, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { useReadOnly } from './read-only';

export interface SortableHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
}

export interface SortableRenderState {
  index: number;
  isDragging: boolean;
  /** Spread on your own handle, or render `<DragHandle {...handle} />`. */
  handle: SortableHandleProps;
  readOnly: boolean;
}

export interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, state: SortableRenderState) => ReactNode;
  /** Label for screen reader announcements, like "speaker". */
  itemLabel?: (item: T) => string;
  readOnly?: boolean;
  className?: string;
  /** Gap between rows. Default 'sm'. */
  gap?: 'none' | 'sm' | 'md';
  'aria-label'?: string;
}

/**
 * Vertical drag-and-drop list (dnd-kit). Pointer, touch and keyboard: focus a handle, press
 * Space to lift, arrows to move, Space to drop, Escape to cancel.
 *
 * @example
 * <SortableList items={rows} getId={(r) => r.key} onReorder={setRows}
 *   renderItem={(row, { handle }) => <div className="flex gap-2"><DragHandle {...handle} />{row.label}</div>} />
 */
export function SortableList<T>({ items, getId, onReorder, renderItem, itemLabel, readOnly: ro, className, gap = 'sm', 'aria-label': ariaLabel }: SortableListProps<T>) {
  const readOnly = useReadOnly(ro);
  // A stable id keeps dnd-kit's aria-describedby ids identical on server and client.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const ids = items.map(getId);
  const labelOf = (id: string | number) => {
    const it = items.find((i) => getId(i) === String(id));
    return it && itemLabel ? itemLabel(it) : 'item';
  };
  const pos = (id: string | number) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}, position ${pos(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} moved to position ${pos(over.id)} of ${ids.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} dropped at position ${pos(over.id)} of ${ids.length}.` : `${labelOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To reorder, press Space to pick up. Use the arrow keys to move, Space to drop, or Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={readOnly}>
        <ul aria-label={ariaLabel} className={cn('flex flex-col', gap === 'sm' ? 'gap-2' : gap === 'md' ? 'gap-3' : 'gap-0', className)}>
          {items.map((item, index) => (
            <SortableRow key={getId(item)} id={getId(item)} dragging={activeId === getId(item)}>
              {(handle, isDragging) => renderItem(item, { index, isDragging, handle, readOnly })}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children, dragging }: { id: string; dragging: boolean; children: (h: SortableHandleProps, isDragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative',
  };
  return (
    <li ref={setNodeRef} style={style} className={cn('list-none', (isDragging || dragging) && 'drop-shadow-[0_12px_24px_rgba(14,17,22,0.14)]')}>
      {children({ attributes, listeners, setActivatorNodeRef }, isDragging)}
    </li>
  );
}

/** The grip handle. Spread the `handle` from renderItem onto it. */
export const DragHandle = forwardRef<HTMLButtonElement, SortableHandleProps & { label?: string; className?: string; disabled?: boolean }>(function DragHandle(
  { attributes, listeners, setActivatorNodeRef, label = 'Drag to reorder', className, disabled },
  _ref,
) {
  if (disabled) return <span className={cn('w-2', className)} aria-hidden="true" />;
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className={cn(
        'flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-muted hover:text-ink active:cursor-grabbing',
        'focus-visible:outline-2 focus-visible:outline-focus',
        className,
      )}
    >
      <GripVertical className="size-4" />
    </button>
  );
});
