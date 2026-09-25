'use client';

import { MotionConfig } from 'motion/react';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { EventCard, LinkItem, SiteSettings } from '@zemi/shared';

/** The slice of site settings the shell and client components need (kept small: it ships to every page). */
export interface ShellSite {
  general: SiteSettings['general'];
  contact: { email: string; socials: LinkItem[]; officeHours: string; address: string; mapsUrl?: string | null };
  seo: { title: string; description: string };
  /** true when the API was unreachable and these are schema defaults. */
  isFallback: boolean;
}

interface Ctx {
  site: ShellSite;
  nextEvent: EventCard | null;
}

const SiteContext = createContext<Ctx | null>(null);

export function PublicSiteProvider({ site, nextEvent, children }: Ctx & { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-zemi-public', '');
    html.setAttribute('data-zemi-js', '');
    return () => html.removeAttribute('data-zemi-public');
  }, []);
  return (
    <SiteContext.Provider value={{ site, nextEvent }}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </SiteContext.Provider>
  );
}

/** Site settings slice from the public layout. Throws outside the public layout. */
export function useSite(): ShellSite {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite() must be used inside the public layout.');
  return ctx.site;
}

/** The next upcoming (or live) event from the layout fetch, or null. Safe outside the layout (null). */
export function useNextEvent(): EventCard | null {
  return useContext(SiteContext)?.nextEvent ?? null;
}
