import type { NextConfig } from 'next';

const apiInternal = process.env.API_INTERNAL_URL ?? 'http://localhost:4400';

const nextConfig: NextConfig = {
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  output: 'standalone',
  // Lets several local dev servers run side by side (NEXT_DIST_DIR=.next-a next dev -p 3301).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['three'],
  serverExternalPackages: ['@blocknote/core', '@blocknote/react', '@blocknote/server-util'],
  experimental: {
    // The persistent dev cache grows past 1 GB; this machine is short on disk, and cold dev compiles are fine.
    turbopackFileSystemCacheForDev: process.env.NEXT_DEV_FS_CACHE === '1',
    // Uploads and SSE go through the /api rewrite. Keep long-lived proxied requests alive.
    proxyTimeout: 30 * 60 * 1000,
    proxyClientMaxBodySize: 2 * 1024 * 1024 * 1024,
    optimizePackageImports: ['lucide-react', 'recharts', '@react-three/drei'],
  },
  images: { unoptimized: true },
  async headers() {
    const base = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      // The admin scanner needs the camera; nothing needs the mic or location.
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      // SITE_INDEXING=false keeps search engines out (e.g. while production still holds demo data).
      ...(process.env.SITE_INDEXING === 'false' ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : []),
    ];
    return [
      { source: '/:path*', headers: base },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Media-server hooks (/api/v1/internal/*) are private-network only: never proxy them from the web.
      { source: '/api/v1/:path((?!internal(?:/|$)).*)', destination: `${apiInternal}/api/v1/:path` },
      { source: '/media/:path*', destination: `${apiInternal}/media/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      { source: '/speaker/:slug', destination: '/speakers/:slug', permanent: true },
      { source: '/t/:token', destination: '/tickets/:token', permanent: false },
    ];
  },
};

export default nextConfig;
