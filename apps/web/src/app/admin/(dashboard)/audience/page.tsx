import type { Metadata } from 'next';
import { AccessGate } from '@/components/admin/access/access-ui';
import { AudiencePage } from '@/components/admin/people/audience/audience-page';

export const metadata: Metadata = { title: 'Audience' };

export default function Page() {
  return (
    <AccessGate
      cap="audience.view"
      title="The audience list is not in your access."
      description="It has everyone who ever saved a seat, with their contact details. Ask the superadmin if you need it."
    >
      <AudiencePage />
    </AccessGate>
  );
}
