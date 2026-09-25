import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SpeakersList } from '@/components/admin/content/speakers/speakers-list';

export const metadata: Metadata = { title: 'Speakers' };

export default function Page() {
  return (
    <Suspense>
      <SpeakersList />
    </Suspense>
  );
}
