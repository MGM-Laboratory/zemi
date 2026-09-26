import type { Metadata } from 'next';
import { EmailsTab } from '@/components/admin/people/emails/emails-tab';

export const metadata: Metadata = { title: 'Emails' };

export default function EventEmailsPage() {
  return <EmailsTab />;
}
