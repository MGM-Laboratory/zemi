import type { Metadata } from 'next';

/**
 * Link preview (Open Graph + Twitter) metadata for public pages. Server-safe.
 *
 * Next replaces the whole `openGraph` / `twitter` object of a parent segment when a page sets its
 * own, so a page that only passes a title silently loses the layout's image, type and site name.
 * This builds the complete objects every time, with the brand PNG as the fallback image.
 *
 * @example export const metadata = { title: 'Speakers', ...shareMeta({ title: 'Speakers at Zemi', description, url: '/speakers' }) };
 */

export interface ShareImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/** The brand card (public/brand/og-default.png). The upload pipeline only emits AVIF/WebP, so this PNG is the safe default. */
export const DEFAULT_SHARE_IMAGE: ShareImage = {
  url: '/brand/og-default.png',
  width: 1200,
  height: 630,
  alt: 'Zemi, the Friday seminar',
};

export interface ShareMetaInput {
  title: string;
  description: string;
  /** Site path, e.g. `/events`. `metadataBase` makes it absolute. */
  url: string;
  type?: 'website' | 'article' | 'profile';
  /**
   * Preview images. Empty or missing means the brand card. `false` leaves images out on purpose,
   * for segments with an `opengraph-image` / `twitter-image` file (the file wins anyway).
   */
  images?: ShareImage[] | false;
  /** Defaults to `summary_large_image`. Portrait-ish images (avatars) read better as `summary`. */
  card?: 'summary' | 'summary_large_image';
  /** Extra Open Graph fields for `article` / `profile` types. */
  article?: { authors?: string[]; tags?: string[]; publishedTime?: string; modifiedTime?: string };
}

export function shareMeta({
  title,
  description,
  url,
  type = 'website',
  images,
  card,
  article,
}: ShareMetaInput): Pick<Metadata, 'openGraph' | 'twitter'> {
  const list = images === false ? null : images?.length ? images : [DEFAULT_SHARE_IMAGE];
  const usingDefault = list?.length === 1 && list[0] === DEFAULT_SHARE_IMAGE;
  const common = { siteName: 'Zemi', locale: 'en_US', url, title, description };
  const openGraph: Metadata['openGraph'] =
    type === 'article'
      ? { ...common, type: 'article', ...article, ...(list ? { images: list } : null) }
      : type === 'profile'
        ? { ...common, type: 'profile', ...(list ? { images: list } : null) }
        : { ...common, type: 'website', ...(list ? { images: list } : null) };
  return {
    openGraph,
    twitter: {
      card: usingDefault ? 'summary_large_image' : (card ?? 'summary_large_image'),
      title,
      description,
      ...(list ? { images: list.map((i) => ({ url: i.url, alt: i.alt })) } : null),
    },
  };
}
