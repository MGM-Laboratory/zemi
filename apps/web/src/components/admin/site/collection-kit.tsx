'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';
import { Sheet, Switch, notify, useConfirm } from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';

/**
 * Shared plumbing for the FAQ and team pages: an ordered list with optimistic drag-to-reorder,
 * an inline visibility switch, delete, and a side sheet editor that asks before throwing away
 * unsaved changes.
 */

export type Visibility = 'published' | 'draft';
export interface OrderedRow {
  id: string;
  sortOrder: number;
  visibility: Visibility;
}

export function useOrderedCollection<T extends OrderedRow>({ path, queryKey }: { path: string; queryKey: readonly unknown[] }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.get<T[]>(path, undefined, signal),
    staleTime: 30_000,
  });
  const items = useMemo(() => [...(query.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [query.data]);
  // Only the latest reorder may write the server's answer back, so a slow early reply can't undo a later drag.
  const seq = useRef(0);

  const setLocal = useCallback((fn: (rows: T[]) => T[]) => qc.setQueryData<T[]>(queryKey, (old) => (old ? fn(old) : old)), [qc, queryKey]);

  const reorder = useCallback(
    async (next: T[]) => {
      const prev = qc.getQueryData<T[]>(queryKey);
      const mine = ++seq.current;
      qc.setQueryData<T[]>(queryKey, next.map((r, i) => ({ ...r, sortOrder: i })));
      try {
        const saved = await api.put<T[]>(`${path}/order`, { ids: next.map((r) => r.id) });
        if (mine === seq.current && Array.isArray(saved)) qc.setQueryData<T[]>(queryKey, saved);
      } catch (err) {
        if (mine === seq.current) qc.setQueryData<T[]>(queryKey, prev);
        notify.error(`The new order did not stick. ${errorMessage(err)}`);
      }
    },
    [qc, queryKey, path],
  );

  const setVisibility = useCallback(
    async (row: T, visibility: Visibility, message: string) => {
      const before = row.visibility;
      setLocal((rows) => rows.map((r) => (r.id === row.id ? { ...r, visibility } : r)));
      try {
        const saved = await api.patch<T>(`${path}/${row.id}`, { visibility });
        setLocal((rows) => rows.map((r) => (r.id === row.id ? saved : r)));
        notify.success(message);
      } catch (err) {
        setLocal((rows) => rows.map((r) => (r.id === row.id ? { ...r, visibility: before } : r)));
        notify.error(errorMessage(err));
      }
    },
    [path, setLocal],
  );

  const remove = useCallback(
    async (row: T) => {
      const prev = qc.getQueryData<T[]>(queryKey);
      setLocal((rows) => rows.filter((r) => r.id !== row.id));
      try {
        await api.delete(`${path}/${row.id}`);
        return true;
      } catch (err) {
        qc.setQueryData<T[]>(queryKey, prev);
        notify.error(errorMessage(err));
        return false;
      } finally {
        void qc.invalidateQueries({ queryKey });
      }
    },
    [qc, queryKey, path, setLocal],
  );

  /** Put a freshly saved row into the cached list (new rows go to the end). */
  const upsert = useCallback(
    (saved: T) => {
      qc.setQueryData<T[]>(queryKey, (old) => {
        const rows = old ?? [];
        return rows.some((r) => r.id === saved.id) ? rows.map((r) => (r.id === saved.id ? saved : r)) : [...rows, saved];
      });
      void qc.invalidateQueries({ queryKey });
    },
    [qc, queryKey],
  );

  return { query, items, reorder, setVisibility, remove, upsert };
}

/* ------------------------------------------------------------------ editor sheet */

/**
 * A side sheet for one record. Escape, the X, a click outside and the footer's Cancel (when
 * `footer` is a function, it gets the guarded close) all go through the same "discard your
 * changes?" question when the form is dirty.
 */
export function EditorSheet({
  open,
  dirty,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  dirty: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode | ((requestClose: () => void) => ReactNode);
  children: ReactNode;
}) {
  const confirm = useConfirm();
  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Throw away your changes?',
        description: 'You changed things in this panel and did not save them.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : void requestClose())} title={title} description={description} footer={typeof footer === 'function' ? footer(() => void requestClose()) : footer} width="md">
      {children}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ bits */

/** "On the site" / "Draft" switch for a row. */
export function VisibilitySwitch({ value, onChange, subject, className }: { value: Visibility; onChange: (v: Visibility) => void; subject: string; className?: string }) {
  const on = value === 'published';
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Switch size="sm" checked={on} onCheckedChange={(c) => onChange(c ? 'published' : 'draft')} aria-label={`Show ${subject} on the site`} />
      <span className={cn('w-[5.25rem] text-[0.8125rem] whitespace-nowrap', on ? 'font-medium text-green-600' : 'text-ink-3')} aria-hidden="true">
        {on ? 'On the site' : 'Draft'}
      </span>
    </span>
  );
}

/** react-hook-form array errors to LinksEditor's `{ index: { url, label } }`. */
export function linkRowErrors(error: FieldError | undefined): Record<number, { url?: string; label?: string }> | undefined {
  if (!error) return undefined;
  const rows = error as unknown as Record<string, { url?: { message?: string }; label?: { message?: string } } | undefined>;
  const out = Object.fromEntries(
    Object.entries(rows)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, v]) => [Number(k), { url: v?.url?.message, label: v?.label?.message }]),
  );
  return Object.keys(out).length ? out : undefined;
}

/** "10 questions · 8 on the site · 2 drafts" */
export function CollectionCounts({ total, published, one, many }: { total: number; published: number; one: string; many: string }) {
  const drafts = total - published;
  return (
    <p className="text-sm text-ink-3" aria-live="polite">
      <span className="font-semibold text-ink-2 tabular-nums">{total}</span> {total === 1 ? one : many}
      <span aria-hidden="true"> · </span>
      <span className="tabular-nums">{published}</span> on the site
      {drafts ? (
        <>
          <span aria-hidden="true"> · </span>
          <span className="tabular-nums">{drafts}</span> {drafts === 1 ? 'draft' : 'drafts'}
        </>
      ) : null}
    </p>
  );
}
