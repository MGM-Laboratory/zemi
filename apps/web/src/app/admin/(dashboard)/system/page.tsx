import type { Metadata } from 'next';
import { AccessGate } from '@/components/admin/access/access-ui';
import { SystemPage } from '@/components/admin/access/system-page';

export const metadata: Metadata = { title: 'System' };

export default function Page() {
  return (
    <AccessGate>
      <SystemPage />
    </AccessGate>
  );
}
