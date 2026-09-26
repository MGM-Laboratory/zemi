import type { Metadata } from 'next';
import { LostPage } from '@/components/public/errors/lost-page';

// No robots here: Next already sends `noindex` with every not-found response (a second tag
// would only repeat it).
export const metadata: Metadata = {
  title: 'Page not found',
};

/** A public page called notFound() (a bad event slug, a hidden speaker). Renders inside the public shell. */
export default function PublicNotFound() {
  return <LostPage />;
}
