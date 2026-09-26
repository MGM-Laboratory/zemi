import type { Metadata } from 'next';
import { AccessGate } from '@/components/admin/access/access-ui';
import { AdminCreate } from '@/components/admin/access/admin-create';

export const metadata: Metadata = { title: 'New admin' };

export default function Page() {
  return (
    <AccessGate>
      <AdminCreate />
    </AccessGate>
  );
}
