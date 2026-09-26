'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  computeEventStatus,
  type EventAction,
  type EventAdmin,
  type EventAdminRow,
  type EventStatus,
  type Visibility,
} from '@zemi/shared';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { notify } from '@/components/admin/ui/toast';
import { useRefetchMe } from '@/lib/admin/ability';
import { adminFetch, api, isApiError, type ApiError } from '@/lib/admin/api';
import { useAdminMutation, useNow } from '@/lib/admin/hooks';
import { adminRoutes } from '@/lib/admin/nav';
import { adminKeys } from '@/lib/admin/query-keys';
import { isEventAdmin } from './lib';

/* ------------------------------------------------------------------ queries */

/** The canonical React Query key for one event (the workspace, every tab and teammates' tabs share it). */
export const eventDetailKey = (id: string) => adminKeys.events.detail(id);

/** GET /admin/events/:id as EventAdmin. */
export function fetchEventAdmin(id: string, signal?: AbortSignal) {
  return adminFetch<EventAdmin>(`/admin/events/${id}`, { signal });
}

/** The event record. Tabs inside the workspace should prefer `useWorkspaceEvent()`. */
export function useEventAdmin(id: string | null | undefined, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: eventDetailKey(id ?? 'none'),
    queryFn: ({ signal }) => fetchEventAdmin(id!, signal),
    enabled: Boolean(id) && (opts.enabled ?? true),
  });
}

/** Status recomputed on a ticking clock, so "Coming up" flips to "Happening now" without a reload. */
export function useLiveStatus(
  e:
    | (Pick<EventAdmin, 'startsAt' | 'endsAt' | 'cancelledAt'> & {
        stream?: { state: EventAdmin['stream']['state'] };
      })
    | null
    | undefined,
  intervalMs = 15_000,
): EventStatus | null {
  const now = useNow(intervalMs);
  if (!e) return null;
  return computeEventStatus(e, e.stream?.state ?? null, now);
}

/** Same for list rows (EventAdminRow carries `streamState`). */
export function rowStatus(
  row: Pick<EventAdminRow, 'startsAt' | 'endsAt' | 'status' | 'streamState'>,
  now: Date,
): EventStatus {
  if (row.status === 'cancelled') return 'cancelled';
  return computeEventStatus({ startsAt: row.startsAt, endsAt: row.endsAt }, row.streamState, now);
}

/* ------------------------------------------------------------------ workspace context */

export interface EventWorkspaceValue {
  id: string;
  event: EventAdmin;
  status: EventStatus;
  /** Effective actions on this event, straight from the server (`event.permissions`). */
  perms: ReadonlySet<EventAction>;
  can: (action: EventAction) => boolean;
  refetch: () => Promise<unknown>;
  isFetching: boolean;
}

const WorkspaceContext = createContext<EventWorkspaceValue | null>(null);

export function EventWorkspaceProvider({
  value,
  children,
}: {
  value: EventWorkspaceValue;
  children: ReactNode;
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * The event of the current workspace (`/admin/events/[id]/...`). Available to every tab,
 * including the ones teammates own (registrations, attendance, stream, media, emails).
 *
 * @example const { event, can } = useWorkspaceEvent(); if (!can('stream.control')) ...
 */
export function useWorkspaceEvent(): EventWorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error(
      'useWorkspaceEvent must be used inside /admin/events/[id] (the event workspace layout).',
    );
  return ctx;
}

export function useOptionalWorkspaceEvent(): EventWorkspaceValue | null {
  return useContext(WorkspaceContext);
}

export function usePermSet(perms: readonly EventAction[] | undefined) {
  return useMemo(() => new Set<EventAction>(perms ?? []), [perms]);
}

/* ------------------------------------------------------------------ cache helpers */

/** Put a fresh EventAdmin into the cache (when a mutation returns one) and refresh the lists. */
export function acceptEvent(qc: QueryClient, id: string, res: unknown) {
  if (isEventAdmin(res) && res.id === id) qc.setQueryData(eventDetailKey(id), res);
}

/** Optimistically patch the cached event. Returns a rollback. */
export function patchEventCache(qc: QueryClient, id: string, patch: (e: EventAdmin) => EventAdmin) {
  const key = eventDetailKey(id);
  const prev = qc.getQueryData<EventAdmin>(key);
  if (prev) qc.setQueryData(key, patch(prev));
  return () => {
    if (prev) qc.setQueryData(key, prev);
  };
}

export const eventListKeys = () => [adminKeys.events.lists(), adminKeys.overview()] as const;

/* ------------------------------------------------------------------ create */

export interface EventCreatePayload {
  /** Omit to let the API name it "Zemi #<next number>". */
  title?: string;
  /** Omit to let the API derive a unique slug from the title. */
  slug?: string;
  startsAt?: string;
  endsAt?: string;
  venueId?: string | null;
  /** Omit to get the next number automatically (max + 1). */
  number?: number | null;
  mode?: 'hybrid' | 'offline' | 'online';
  visibility?: Visibility;
}

function isSlugConflict(err: unknown): err is ApiError {
  if (!isApiError(err) || !err.isConflict) return false;
  const d = err.details as { field?: string; constraint?: string } | undefined;
  return Boolean(
    err.fieldErrors.slug ||
    d?.field === 'slug' ||
    d?.constraint?.includes('slug') ||
    /slug/i.test(err.message),
  );
}

/**
 * POST /admin/events. The API fills in anything left out (next free Friday, next number,
 * a unique slug from the title). When an explicit slug is taken, retries with `-2`, `-3`.
 */
export async function createEvent(input: EventCreatePayload, attempts = 3): Promise<EventAdmin> {
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as EventCreatePayload;
  if (!body.slug) return api.post<EventAdmin>('/admin/events', body);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const slug = i === 0 ? body.slug : `${body.slug.slice(0, 90)}-${i + 1}`;
    try {
      return await api.post<EventAdmin>('/admin/events', { ...body, slug });
    } catch (err) {
      lastErr = err;
      if (!isSlugConflict(err)) throw err;
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ actions */

async function celebrate(from?: Element | null) {
  try {
    const { shapeConfetti } = await import('@/components/motion/shape-confetti');
    await shapeConfetti(from ? { from, count: 110 } : { origin: { x: 0.5, y: 0.35 }, count: 110 });
  } catch {
    /* confetti is a bonus */
  }
}

const PUBLISH_COPY: Record<Visibility, string> = {
  published: 'Published. It is on the site now.',
  unlisted: 'Unlisted. Only people with the link can find it.',
  draft: 'Back to draft. It is hidden from the site.',
};

/**
 * Publish, duplicate, cancel, restore and delete for one event, with toasts, cache updates
 * and the publish celebration.
 */
export function useEventActions(id: string) {
  const qc = useQueryClient();
  const router = useRouter();
  const refetchMe = useRefetchMe();

  const publish = useAdminMutation({
    mutationFn: (vars: { visibility: Visibility; from?: Element | null }) =>
      api.post<unknown>(`/admin/events/${id}/publish`, { visibility: vars.visibility }),
    invalidate: [eventDetailKey(id), ...eventListKeys()],
    onMutate: (vars) => patchEventCache(qc, id, (e) => ({ ...e, visibility: vars.visibility })),
    onError: (_err, _vars, rollback) => rollback?.(),
    onSuccess: (res, vars) => {
      acceptEvent(qc, id, res);
      notify.success(PUBLISH_COPY[vars.visibility], { celebrate: vars.visibility === 'published' });
      if (vars.visibility === 'published') void celebrate(vars.from);
    },
  });

  const duplicate = useAdminMutation({
    mutationFn: () => api.post<EventAdmin | { id: string }>(`/admin/events/${id}/duplicate`),
    invalidate: [...eventListKeys()],
    successMessage: 'Copied. Here is your new draft.',
    onSuccess: async (res) => {
      if (res && 'id' in res && res.id) {
        if (isEventAdmin(res)) qc.setQueryData(eventDetailKey(res.id), res);
        // The API grants the creator full access to the copy; refresh the ability before landing on it.
        await refetchMe().catch(() => undefined);
        router.push(adminRoutes.event(res.id, 'details'));
      }
    },
  });

  const cancel = useAdminMutation({
    mutationFn: (vars: { reason: string | null; notify: boolean }) =>
      api.post<unknown>(`/admin/events/${id}/cancel`, vars),
    invalidate: [eventDetailKey(id), ...eventListKeys()],
    successMessage: (_d, v) =>
      v.notify ? 'Cancelled. Registrants are getting an email.' : 'Cancelled. Nobody was emailed.',
    onSuccess: (res) => acceptEvent(qc, id, res),
  });

  const restore = useAdminMutation({
    mutationFn: () => api.post<unknown>(`/admin/events/${id}/restore`),
    invalidate: [eventDetailKey(id), ...eventListKeys()],
    successMessage: 'Back on. The Friday is happening again.',
    celebrate: true,
    onSuccess: (res) => acceptEvent(qc, id, res),
  });

  const remove = useAdminMutation({
    mutationFn: () => api.delete(`/admin/events/${id}`),
    successMessage: 'Deleted. It is gone for good.',
    onSuccess: async () => {
      await qc.cancelQueries({ queryKey: eventDetailKey(id) });
      router.push(adminRoutes.events);
      void qc.invalidateQueries({ queryKey: adminKeys.events.lists() });
      void qc.invalidateQueries({ queryKey: adminKeys.overview() });
      // Drop the record once the workspace is gone, so nothing refetches a 404 on the way out.
      setTimeout(() => qc.removeQueries({ queryKey: eventDetailKey(id) }), 2000);
    },
  });

  return { publish, duplicate, cancel, restore, remove };
}

/** Toast helper for list rows (no workspace). */
export function notifyPublished(visibility: Visibility, from?: Element | null) {
  notify.success(PUBLISH_COPY[visibility], { celebrate: visibility === 'published' });
  if (visibility === 'published') void celebrate(from);
}
