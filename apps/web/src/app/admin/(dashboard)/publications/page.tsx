import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PublicationsList } from '@/components/admin/content/publications/publications-list';

export const metadata: Metadata = { title: 'Publications' };

export default function Page() {
  return (
    <Suspense>
      <PublicationsList />
    </Suspense>
  );
}
