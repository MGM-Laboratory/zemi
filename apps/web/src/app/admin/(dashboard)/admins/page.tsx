import type { Metadata } from 'next';
import { AccessGate } from '@/components/admin/access/access-ui';
import { AdminsList } from '@/components/admin/access/admins-list';

export const metadata: Metadata = { title: 'Admins and access' };

export default function Page() {
  return (
    <AccessGate>
      <AdminsList />
    </AccessGate>
  );
}
