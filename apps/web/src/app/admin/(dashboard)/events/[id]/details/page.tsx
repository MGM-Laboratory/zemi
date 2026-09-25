import type { Metadata } from 'next';
import { EventDetailsForm } from '@/components/admin/events/details/details-form';

export const metadata: Metadata = { title: 'Event details' };

export default function EventDetailsPage() {
  return <EventDetailsForm />;
}
