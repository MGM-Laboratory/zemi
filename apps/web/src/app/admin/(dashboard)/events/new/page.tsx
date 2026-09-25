import type { Metadata } from 'next';
import { NewEventForm } from '@/components/admin/events/new/new-event-form';

export const metadata: Metadata = { title: 'New event' };

export default function NewEventPage() {
  return <NewEventForm />;
}
