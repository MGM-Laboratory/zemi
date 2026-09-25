import type { Metadata } from 'next';
import { EventOverviewTab } from '@/components/admin/events/workspace/overview-tab';

export const metadata: Metadata = { title: 'Event' };

export default function EventOverviewPage() {
  return <EventOverviewTab />;
}
