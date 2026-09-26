import type { MetadataRoute } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3300').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_INDEXING === 'false') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/tickets/', '/t/', '/styleguide'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    // No `host`: that directive is Yandex-only and wants a bare hostname, not a URL.
  };
}
