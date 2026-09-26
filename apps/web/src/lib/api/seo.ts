/**
 * Share metadata (Open Graph + Twitter) for public pages. Server-safe, no data fetching.
 *
 * Why a helper: Next replaces a parent's `openGraph` and `twitter` objects wholesale when a
 * child segment sets its own (they never merge). A page that sets `openGraph: { title }` loses
 * the layout's image, site name and type. `withOg()` puts them back, so every page shares a
 * large card with an image.
 *
 * Titles and descriptions: leave `openGraph.title` / `description` out and Next fills them from
 * the page's own `title` (with the template) and `description`. Twitter's title, description and
 * images are filled from `openGraph` by Next too, unless you set them yourself.
 *
 * @example
 * export async function generateMetadata(): Promise<Metadata> {
 *   const site = await getSiteOrDefaults();
 *   return withOg(
 *     { title: 'Speakers', description, alternates: { canonical: '/speakers' }, openGraph: { url: '/speakers', title: 'Speakers at Zemi' } },
 *     { site },
 *   );
 * }
 */
import type { Metadata } from 'next';
import type { PublicSite } from '@zemi/shared';

type OpenGraph = NonNullable<Metadata['openGraph']>;
type Twitter = NonNullable<Metadata['twitter']>;

export interface OgImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export const SITE_NAME = 'Zemi';

/**
 * The brand share card (1200x630 PNG in `public/brand`). The seeder leaves the SEO image empty
 * on purpose (DECISIONS 2026-09-26): the media pipeline only emits AVIF/WebP, which some link
 * previewers skip.
 */
export const OG_DEFAULT_IMAGE: Readonly<Required<OgImage>> = Object.freeze({
  url: '/brand/og-default.png',
  width: 1200,
  height: 630,
  alt: 'Zemi, the Friday seminar',
});

type SiteLike = Pick<PublicSite, 'ogImage'> & { settings?: { general?: { siteName?: string } } };

/** The site-wide share image: the admin's SEO image when one is set, else the brand PNG. */
export function siteOgImage(site?: SiteLike | null): OgImage {
  const og = site?.ogImage;
  if (og?.src) return { url: og.src, width: og.width, height: og.height, alt: og.alt || OG_DEFAULT_IMAGE.alt };
  return { ...OG_DEFAULT_IMAGE };
}

export interface WithOgOptions {
  /** Site settings: gives the fallback image (SEO settings) and the site name. */
  site?: SiteLike | null;
  /** Fallback image when `meta.openGraph.images` is not set. Wins over `site`. */
  image?: OgImage;
}

/**
 * Complete a page's metadata with the shared share-card defaults: `og:type`, `og:site_name`,
 * `og:locale`, an image (the page's own, else the site's, else the brand PNG) and a
 * `summary_large_image` Twitter card. Anything the page sets itself wins.
 */
export function withOg(meta: Metadata, opts: WithOgOptions = {}): Metadata {
  const og = (meta.openGraph ?? {}) as OpenGraph;
  const tw = (meta.twitter ?? {}) as Twitter;
  const fallback = opts.image ?? siteOgImage(opts.site);
  const siteName = opts.site?.settings?.general?.siteName || SITE_NAME;
  const images = og.images ?? [fallback];
  return {
    ...meta,
    openGraph: { type: 'website', siteName, locale: 'en_US', ...og, images } as OpenGraph,
    twitter: {
      card: 'summary_large_image',
      ...tw,
      // Only the explicit fields: Next fills the rest from openGraph (or the page title).
      ...(tw.title === undefined && og.title !== undefined ? { title: og.title } : null),
      ...(tw.description === undefined && og.description !== undefined ? { description: og.description } : null),
      images: tw.images ?? twitterImages(images),
    } as Twitter,
  };
}

/** og images (a string, URL, object or a list of them) as Twitter images, keeping the alt text. */
function twitterImages(images: NonNullable<OpenGraph['images']>): NonNullable<Twitter['images']> {
  const list = Array.isArray(images) ? images : [images];
  return list.map((i) => (typeof i === 'string' || i instanceof URL ? i : { url: i.url, ...(i.alt ? { alt: i.alt } : null) }));
}
