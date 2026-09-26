'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventMediaAdminItem } from '@zemi/shared';
import { adminFetch, api } from '@/lib/admin/api';
import { useAdminMutation } from '@/lib/admin/hooks';
import { adminKeys } from '@/lib/admin/query-keys';
import { eventDetailKey } from '../events/use-event';

/** Lives under the event detail key, so invalidating the event refreshes the gallery too. */
export const mediaKey = (eventId: string) => adminKeys.events.part(eventId, 'media');

const bySort = (a: EventMediaAdminItem, b: EventMediaAdminItem) => a.sortOrder - b.sortOrder;

/** GET /admin/events/:id/media, polled every 3 s while anything is still processing. */
export function useEventMedia(eventId: string) {
  return useQuery({
    queryKey: mediaKey(eventId),
    queryFn: async ({ signal }) => (await adminFetch<EventMediaAdminItem[]>(`/admin/events/${eventId}/media`, { signal })).sort(bySort),
    refetchInterval: (q) => (q.state.data?.some((m) => m.status === 'processing') ? 3000 : false),
  });
}

/** Add, caption, feature, reorder, remove. Everything is optimistic with a rollback. */
export function useMediaActions(eventId: string) {
  const qc = useQueryClient();
  const key = mediaKey(eventId);
  const get = () => qc.getQueryData<EventMediaAdminItem[]>(key);
  const set = (fn: (list: EventMediaAdminItem[]) => EventMediaAdminItem[]) =>
    qc.setQueryData<EventMediaAdminItem[]>(key, (list) => (list ? fn(list) : list));
  const put = (item: EventMediaAdminItem) =>
    set((list) => {
      const i = list.findIndex((m) => m.id === item.id);
      if (i < 0) return [...list, item].sort(bySort);
      const next = list.slice();
      next[i] = item;
      return next;
    });

  /** POST /admin/events/:id/media. Callers run these one at a time (sortOrder is max + 1 on the server). */
  const add = useAdminMutation({
    mutationFn: (v: { assetId: string; caption?: string | null }) =>
      api.post<EventMediaAdminItem>(`/admin/events/${eventId}/media`, { assetId: v.assetId, caption: v.caption ?? null, featured: false }),
    onSuccess: (item) => {
      if (get()) put(item);
      else void qc.invalidateQueries({ queryKey: key });
    },
    // The upload queue reports errors per file.
    errorToast: false,
  });

  const update = useAdminMutation({
    mutationFn: (v: { id: string; patch: { caption?: string | null; featured?: boolean } }) =>
      api.patch<EventMediaAdminItem>(`/admin/events/${eventId}/media/${v.id}`, v.patch),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = get();
      set((list) => list.map((m) => (m.id === v.id ? { ...m, ...v.patch, caption: v.patch.caption !== undefined ? v.patch.caption : m.caption } : m)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (item) => put(item),
    successMessage: (_d, v) =>
      v.patch.featured === true ? 'Starred. It gets a big spot on the event page.' : v.patch.featured === false ? 'Unstarred.' : 'Caption saved.',
  });

  const remove = useAdminMutation({
    mutationFn: (id: string) => api.delete(`/admin/events/${eventId}/media/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = get();
      set((list) => list.filter((m) => m.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    invalidate: [eventDetailKey(eventId)],
    successMessage: 'Taken out of the gallery. The file is still in the media library.',
  });

  /** Quiet remove, for the upload queue replacing a tile that failed to process (no toast). */
  const discard = useAdminMutation({
    mutationFn: (id: string) => api.delete(`/admin/events/${eventId}/media/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = get();
      set((list) => list.filter((m) => m.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    invalidate: [eventDetailKey(eventId)],
    errorToast: false,
  });

  /** PUT /admin/events/:id/media/order with every id, in the new order. */
  const reorder = useAdminMutation({
    mutationFn: (ids: string[]) => api.put<EventMediaAdminItem[]>(`/admin/events/${eventId}/media/order`, { ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = get();
      if (prev) {
        const byId = new Map(prev.map((m) => [m.id, m]));
        qc.setQueryData<EventMediaAdminItem[]>(
          key,
          ids.map((id, i) => ({ ...byId.get(id)!, sortOrder: i })).filter((m) => m.id),
        );
      }
      return { prev };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      void qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: (list) => {
      if (Array.isArray(list)) qc.setQueryData(key, list.slice().sort(bySort));
    },
    successMessage: 'Order saved.',
  });

  const refreshEvent = () => void qc.invalidateQueries({ queryKey: eventDetailKey(eventId), refetchType: 'active' });

  return { add, update, remove, discard, reorder, refreshEvent };
}
