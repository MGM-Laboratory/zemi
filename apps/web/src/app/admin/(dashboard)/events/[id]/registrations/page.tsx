import type { Metadata } from 'next';
import { RegistrationsTab } from '@/components/admin/people/registrations/registrations-tab';

export const metadata: Metadata = { title: 'Registrations' };

export default function EventRegistrationsPage() {
  return <RegistrationsTab />;
}
