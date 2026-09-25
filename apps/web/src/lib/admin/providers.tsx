'use client';

import { QueryClient, QueryClientContext, QueryClientProvider } from '@tanstack/react-query';
import type { Me } from '@zemi/shared';
import { Tooltip } from 'radix-ui';
import { useContext, useState, type ReactNode } from 'react';
import { AbilityProvider } from './ability';
import { isApiError } from './api';
import { BreadcrumbsProvider } from './breadcrumbs';
import { adminKeys } from './query-keys';

function applyAdminDefaults(client: QueryClient) {
  client.setQueryDefaults(adminKeys.all, {
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    // Never retry 4xx (403, 404, validation). Retry network/5xx twice.
    retry: (count, err) => {
      if (isApiError(err) && err.status >= 400 && err.status < 500) return false;
      return count < 2;
    },
  });
  client.setMutationDefaults(adminKeys.all, { retry: false });
}

/**
 * Everything the admin tree needs: React Query (reuses the root client from app/providers.tsx
 * when present), admin query defaults, ability, breadcrumbs and tooltips.
 */
export function AdminProviders({ me, children }: { me: Me; children: ReactNode }) {
  const existing = useContext(QueryClientContext);
  const [client] = useState(() => {
    const c = existing ?? new QueryClient({ defaultOptions: { queries: { staleTime: 15_000 } } });
    applyAdminDefaults(c);
    return c;
  });
  const tree = (
    <AbilityProvider me={me}>
      <BreadcrumbsProvider>
        <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
          {children}
        </Tooltip.Provider>
      </BreadcrumbsProvider>
    </AbilityProvider>
  );
  if (existing) return tree;
  return <QueryClientProvider client={client}>{tree}</QueryClientProvider>;
}
