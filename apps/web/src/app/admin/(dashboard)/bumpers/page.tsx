import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BumperLibrary } from '@/components/bumpers/library/library-page';
import { ShowGridSkeleton } from '@/components/bumpers/library/show-grid';

export const metadata: Metadata = { title: 'Bumpers' };

export default function BumpersPage() {
  // nuqs reads the search params on the client; the boundary keeps prerendering happy.
  return (
    <Suspense fallback={<ShowGridSkeleton />}>
      <BumperLibrary />
    </Suspense>
  );
}
