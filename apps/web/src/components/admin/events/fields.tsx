'use client';

import { useQuery } from '@tanstack/react-query';
import { fromJakartaInput, jakartaDateInput, jakartaTimeInput, type EventAdminRow, type Paginated } from '@zemi/shared';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useReadOnly } from '@/components/admin/fields/read-only';
import { useFieldControlProps } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { adminFetch } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import { adminKeys } from '@/lib/admin/query-keys';
import { jakartaDay } from './lib';

/* ------------------------------------------------------------------ taken dates */

/** Upcoming events (for "which Fridays are taken"). Cached and shared with the list. */
export function useUpcomingEvents(enabled = true) {
  const params = { when: 'upcoming', pageSize: 100 } as const;
  return useQuery({
    queryKey: adminKeys.events.list(params),
    queryFn: ({ signal }) => adminFetch<Paginated<EventAdminRow>>('/admin/events', { query: params, signal }),
    enabled,
    staleTime: 60_000,
  });
}

/** Jakarta dates that already have a (non-cancelled) upcoming event, minus `excludeId`. */
export function useTakenDates(excludeId?: string) {
  const q = useUpcomingEvents();
  const dates = useMemo(
    () => Array.from(new Set((q.data?.items ?? []).filter((e) => e.id !== excludeId && e.status !== 'cancelled').map((e) => jakartaDay(e.startsAt)))),
    [q.data, excludeId],
  );
  return { dates, query: q };
}

/* ------------------------------------------------------------------ JakartaDateTimeInput */

export interface JakartaDateTimeInputProps {
  /** ISO instant or null. */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  /** Quick picks shown as chips. */
  presets?: Array<{ label: string; value: string }>;
  readOnly?: boolean;
  id?: string;
  onBlur?: () => void;
  className?: string;
}

/**
 * One date + time, always typed and shown in Jakarta time (WIB), whatever the browser's zone.
 * Empty clears it (null).
 */
export function JakartaDateTimeInput({ value, onChange, presets = [], readOnly: ro, id, onBlur, className }: JakartaDateTimeInputProps) {
  const readOnly = useReadOnly(ro);
  const aria = useFieldControlProps({ id });
  const local = value ? `${jakartaDateInput(value)}T${jakartaTimeInput(value)}` : '';
  return (
    <div className={cn('space-y-2', className)}>
      <Input
        {...aria}
        type="datetime-local"
        mono
        step={300}
        value={local}
        readOnly={readOnly}
        onBlur={onBlur}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return onChange(null);
          const [d, t] = v.split('T');
          if (!d || !t) return;
          onChange(fromJakartaInput(d, t.slice(0, 5)).toISOString());
        }}
        trailing={
          value && !readOnly ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Clear"
              className="mr-1 flex size-8 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <X className="size-4" />
            </button>
          ) : (
            <span className="label mr-3 text-[0.625rem] text-ink-4">WIB</span>
          )
        }
      />
      {presets.length && !readOnly ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const on = value === p.value;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(p.value)}
                className={cn(
                  'inline-flex h-7 items-center rounded-full border px-2.5 text-[0.8125rem] font-medium transition focus-visible:outline-2 focus-visible:outline-focus active:scale-95',
                  on ? 'border-blue bg-blue-50 text-blue-600' : 'border-line-strong bg-white text-ink-2 hover:border-ink-4 hover:text-ink',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
