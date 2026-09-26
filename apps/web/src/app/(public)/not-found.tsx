import type { Metadata } from 'next';
import { LostPage } from '@/components/public/errors/lost-page';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

/** A public page called notFound() (a bad event slug, a hidden speaker). Renders inside the public shell. */
export default function PublicNotFound() {
  return <LostPage />;
}
