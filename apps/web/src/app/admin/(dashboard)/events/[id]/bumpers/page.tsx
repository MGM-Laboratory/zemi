import type { Metadata } from 'next';
import { EventBumpersTab } from '@/components/bumpers/library/event-tab';

export const metadata: Metadata = { title: 'Bumpers' };

export default function EventBumpersPage() {
  return <EventBumpersTab />;
}
