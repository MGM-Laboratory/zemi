import type { Metadata } from 'next';
import { ContactSettings } from '@/components/admin/site/contact-form';

export const metadata: Metadata = { title: 'Site: contact' };

export default function Page() {
  return <ContactSettings />;
}
