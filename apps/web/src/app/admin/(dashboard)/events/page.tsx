import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EventsList } from '@/components/admin/events/list/events-list';

export const metadata: Metadata = { title: 'Events' };

export default function EventsPage() {
  // nuqs reads search params on the client; the boundary keeps it happy during prerender.
  return (
    <Suspense fallback={null}>
      <EventsList />
    </Suspense>
  );
}
