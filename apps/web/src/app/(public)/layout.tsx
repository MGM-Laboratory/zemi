import '@/styles/public.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SiteBootScript, SiteLoader } from '@/components/brand/site-loader';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { AnnouncementBar } from '@/components/public/shell/announcement-bar';
import { Cursor } from '@/components/public/shell/cursor';
import { NavThemeBootScript } from '@/components/public/shell/nav-theme-boot';
import { PageTransition } from '@/components/public/shell/page-transition';
import { PublicFooter } from '@/components/public/shell/public-footer';
import { PublicNav } from '@/components/public/shell/public-nav';
import { ScrollProgress } from '@/components/public/shell/scroll-progress';
import { PublicSiteProvider, type ShellSite } from '@/components/public/shell/site-context';
import { SkipLink } from '@/components/public/shell/skip-link';
import { SITE_NAME, withOg } from '@/lib/api/seo';
import { getNextEvent, getSiteOrDefaults } from '@/lib/api/server';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteOrDefaults();
  const { seo, general } = site.settings;
  // `absolute`: the root layout's '%s · Zemi' template must not wrap the site title again.
  // No og/twitter title or description here: Next fills them from each page's own title and
  // description, so pages that don't set openGraph never share the home page's title.
  return withOg(
    {
      title: { absolute: seo.title, template: `%s · ${general.siteName || SITE_NAME}` },
      description: seo.description,
      keywords: seo.keywords?.length ? seo.keywords : undefined,
    },
    { site },
  );
}

/**
 * Public site shell: loader, announcement, nav, smooth scroll, route curtain, footer, cursor.
 * Site settings and the next event are fetched here once (cached 30s, tagged) and shared with
 * client components through PublicSiteProvider (useSite / useNextEvent).
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [site, nextEvent] = await Promise.all([getSiteOrDefaults(), getNextEvent()]);
  const { general, contact, seo } = site.settings;

  const shell: ShellSite = {
    general,
    contact: {
      email: contact.email,
      socials: contact.socials ?? [],
      officeHours: contact.officeHours,
      address: contact.address,
      mapsUrl: contact.mapsUrl ?? null,
    },
    seo: { title: seo.title, description: seo.description },
    isFallback: site.isFallback,
  };

  return (
    <>
      {/* Runs before paint: flags JS and skips the first-visit loader on repeat visits. */}
      <SiteBootScript />
      <PublicSiteProvider site={shell} nextEvent={nextEvent}>
        <SmoothScroll>
          <SkipLink />
          <SiteLoader />
          <AnnouncementBar announcement={general.announcement} />
          <PublicNav nextEvent={nextEvent} />
          <ScrollProgress />
          <main id="main" tabIndex={-1} className="relative min-h-[100svh] outline-none">
            {children}
          </main>
          <PublicFooter site={site} />
          {/* Runs before paint once the page is parsed: a dark hero gets a paper-tone nav right away. */}
          <NavThemeBootScript />
          <PageTransition />
          <Cursor />
          <Toaster position="bottom-center" offset={24} />
        </SmoothScroll>
      </PublicSiteProvider>
    </>
  );
}
