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
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${apiInternal}/api/v1/:path*` },
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
