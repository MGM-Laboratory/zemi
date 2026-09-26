import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { isUuid } from '@/components/admin/events/lib';
import { ScannerApp } from '@/components/admin/scanner/scanner-app';

export const metadata: Metadata = { title: 'Door scanner' };

/** /admin/scan/[eventId]: the full-screen door scanner for one event. */
export default async function ScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!isUuid(eventId)) notFound();
  return (
    <Suspense fallback={null}>
      <ScannerApp eventId={eventId.toLowerCase()} />
    </Suspense>
  );
}
