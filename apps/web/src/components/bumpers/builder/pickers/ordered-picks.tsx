'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { DragHandle, SortableList } from '@/components/admin/fields/sortable-list';
import { IconButton } from '@/components/admin/ui/button';
import { Combobox, type ComboOption } from '@/components/admin/ui/combobox';

export interface PickRow {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Right side (votes, a role chip). */
  meta?: ReactNode;
}

export interface OrderedPicksProps<T> {
  label: string;
  ids: string[];
  max: number;
  row: (id: string) => PickRow;
  onChange: (ids: string[]) => void;
  /** Called with the picked record so its data can be merged into the bundle. */
  onAdd: (id: string, record: T | undefined) => void;
  loadOptions: (q: string, signal: AbortSignal) => Promise<ComboOption<T>[]>;
  addPlaceholder: string;
  searchPlaceholder: string;
  emptyText: string;
  readOnly?: boolean;
  focusKey?: string;
}

/** An ordered list of picked records (drag to reorder, remove) with a search box to add more. */
export function OrderedPicks<T>({ label, ids, max, row, onChange, onAdd, loadOptions, addPlaceholder, searchPlaceholder, emptyText, readOnly, focusKey }: OrderedPicksProps<T>) {
  const full = ids.length >= max;
  return (
    <div className="space-y-2" data-focus={focusKey}>
      {ids.length ? (
        <SortableList
          items={ids}
          getId={(id) => id}
          onReorder={onChange}
          readOnly={readOnly}
          aria-label={label}
          itemLabel={(id) => row(id).label}
          renderItem={(id, { handle, index }) => {
            const r = row(id);
            return (
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-white py-1.5 pr-1.5 pl-1">
                <DragHandle {...handle} disabled={readOnly} label={`Move ${r.label}`} />
                <span className="mono w-4 shrink-0 text-center text-xs text-ink-4 tabular-nums">{index + 1}</span>
                {r.icon ? <span className="flex shrink-0 items-center">{r.icon}</span> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                  {r.description ? <span className="block truncate text-xs text-ink-3">{r.description}</span> : null}
                </span>
                {r.meta ? <span className="shrink-0">{r.meta}</span> : null}
                {readOnly ? null : (
                  <IconButton size="sm" label={`Remove ${r.label}`} onClick={() => onChange(ids.filter((x) => x !== id))}>
                    <X />
                  </IconButton>
                )}
              </div>
            );
          }}
        />
      ) : null}
      {readOnly ? null : (
        <Combobox<T>
          aria-label={`Add to ${label.toLowerCase()}`}
          value={null}
          onValueChange={(id, o) => {
            if (id && !ids.includes(id)) onAdd(id, o?.data);
          }}
          loadOptions={async (q, signal) => (await loadOptions(q, signal)).map((o) => ({ ...o, disabled: o.disabled || ids.includes(o.value) }))}
          placeholder={full ? `That's the most (${max})` : addPlaceholder}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          disabled={full}
          size="sm"
        />
      )}
    </div>
  );
}
