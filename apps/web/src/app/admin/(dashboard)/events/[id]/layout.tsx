import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isUuid } from '@/components/admin/events/lib';
import { EventWorkspace } from '@/components/admin/events/workspace/event-workspace';

/**
 * Event workspace frame for every tab under /admin/events/[id]. The event is fetched on the
 * client (React Query, `adminKeys.events.detail(id)`), so tabs share one cached record and
 * `useWorkspaceEvent()` works everywhere below.
 */
export default async function EventWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <EventWorkspace id={id.toLowerCase()}>{children}</EventWorkspace>;
}
