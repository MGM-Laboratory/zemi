'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbsContextValue {
  crumbs: Crumb[] | null;
  setCrumbs: (c: Crumb[] | null) => void;
}

const BreadcrumbsContext = createContext<BreadcrumbsContextValue | null>(null);

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <BreadcrumbsContext.Provider value={value}>{children}</BreadcrumbsContext.Provider>;
}

/** Current crumbs set by the page, or null (the topbar then derives them from the nav). */
export function useCurrentBreadcrumbs(): Crumb[] | null {
  return useContext(BreadcrumbsContext)?.crumbs ?? null;
}

/**
 * Set the topbar breadcrumbs for the current page. Clears them on unmount.
 * The last crumb is the current page and should have no href.
 *
 * @example useBreadcrumbs([{ label: 'Events', href: '/admin/events' }, { label: event.title }]);
 */
export function useBreadcrumbs(crumbs: Crumb[] | null) {
  const ctx = useContext(BreadcrumbsContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    if (!ctx) return;
    ctx.setCrumbs(key === 'null' ? null : (JSON.parse(key) as Crumb[]));
    return () => ctx.setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Component form of `useBreadcrumbs`, handy inside server components. */
export function SetBreadcrumbs({ items }: { items: Crumb[] }) {
  useBreadcrumbs(items);
  return null;
}
