'use client';

import { useQuery } from '@tanstack/react-query';
import type { Paginated } from '@zemi/shared';
import { adminFetch, isApiError } from '@/lib/admin/api';
import { adminKeys } from '@/lib/admin/query-keys';

/**
 * Unread inbox count for the sidebar badge. There is no dedicated endpoint, so this asks
 * `GET /admin/inbox?status=new&pageSize=1` and reads `total`. 403/404 (endpoint not built yet
 * or no access) resolve to null and never retry or toast.
 */
export function useInboxUnread(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.inboxUnread(),
    enabled,
    queryFn: async ({ signal }) => {
      try {
        const page = await adminFetch<Paginated<unknown> | unknown[]>('/admin/inbox', { query: { status: 'new', pageSize: 1 }, signal });
        if (Array.isArray(page)) return page.length;
        return typeof page?.total === 'number' ? page.total : null;
      } catch (err) {
        if (isApiError(err) && (err.isNotFound || err.isForbidden)) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    retry: false,
  });
}
