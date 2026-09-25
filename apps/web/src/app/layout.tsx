import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next, Recursive } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

const recursive = Recursive({
  subsets: ['latin', 'latin-ext'],
  axes: ['CASL', 'MONO', 'slnt', 'CRSV'],
  variable: '--font-recursive',
  display: 'swap',
});

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-atkinson',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3300';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Zemi, the Friday seminar', template: '%s · Zemi' },
  description:
    'Every Friday at 13:15, postgrads share research in progress. Undergrads welcome. Free, hybrid, a little chaotic.',
  applicationName: 'Zemi',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon.ico', sizes: '48x48' },
    ],
    apple: '/brand/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Zemi',
    locale: 'en_US',
    images: [{ url: '/brand/og-default.png', width: 1200, height: 630, alt: 'Zemi, the Friday seminar' }],
  },
  twitter: { card: 'summary_large_image', images: ['/brand/og-default.png'] },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${recursive.variable} ${atkinson.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
