import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BumpersRootClass } from '@/components/bumpers/live/root-class';
import './bumpers.css';

export const metadata: Metadata = {
  title: { absolute: 'Zemi bumpers' },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  // Keys live in the path: never send them anywhere in a Referer.
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1116',
};

/**
 * /bumpers/*: OBS browser sources and docks. A bare layout: no public nav, loader, cursor, smooth
 * scroll or toaster, a transparent page, and its own not-found and error cards so a bad key never
 * paints the public site into the stream.
 */
export default function BumpersLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BumpersRootClass />
      <div data-zemi-bumpers="">{children}</div>
    </>
  );
}
