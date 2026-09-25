import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MediaLibrary } from '@/components/admin/content/media/media-library';

export const metadata: Metadata = { title: 'Media library' };

export default function Page() {
  return (
    <Suspense>
      <MediaLibrary />
    </Suspense>
  );
}
