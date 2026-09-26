import type { Metadata } from 'next';
import { EmailSettings } from '@/components/admin/site/emails-form';

export const metadata: Metadata = { title: 'Site: emails' };

export default function Page() {
  return <EmailSettings />;
}
