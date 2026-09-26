import type { Metadata } from 'next';
import { AccessGate } from '@/components/admin/access/access-ui';
import { InboxPage } from '@/components/admin/site/inbox-page';

export const metadata: Metadata = { title: 'Inbox' };

export default function Page() {
  return (
    <AccessGate cap="inbox.view" title="The inbox is not in your access." description="It holds messages people sent from the contact page. Ask the superadmin if you should be reading them.">
      <InboxPage />
    </AccessGate>
  );
}
