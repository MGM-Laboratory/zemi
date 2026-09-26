import type { Metadata } from 'next';
import { LostPage } from '@/components/public/errors/lost-page';
import PublicLayout from './(public)/layout';

// No robots here: Next already sends `noindex` with every not-found response (a second tag
// would only repeat it).
export const metadata: Metadata = {
  title: 'Page not found',
};

/**
 * Every unmatched URL in the app lands here. It renders inside the root layout only, so it
 * borrows the public shell (nav, footer, smooth scroll, cursor, curtain) by composing the public
 * layout, and the lost page adapts its links for /admin paths.
 */
export default function NotFound() {
  return (
    <PublicLayout>
      <LostPage />
    </PublicLayout>
  );
}
