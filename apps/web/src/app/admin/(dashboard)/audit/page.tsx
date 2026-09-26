import type { Metadata } from 'next';
import { AccessGate } from '@/components/admin/access/access-ui';
import { AuditLog } from '@/components/admin/access/audit-log';

export const metadata: Metadata = { title: 'Audit log' };

export default function Page() {
  return (
    <AccessGate cap="audit.view" title="The audit log is not in your access." description="It shows who changed what across the studio. Ask the superadmin if you need it.">
      <AuditLog />
    </AccessGate>
  );
}
