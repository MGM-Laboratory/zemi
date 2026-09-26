import type { AdminSummary } from '@zemi/shared';
import type { Metadata } from 'next';
import { AccessGate } from '@/components/admin/access/access-ui';
import { AdminDetail } from '@/components/admin/access/admin-detail';
import { adminServerFetch } from '@/lib/admin/server';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const a = await adminServerFetch<Pick<AdminSummary, 'name'>>(`/admin/admins/${encodeURIComponent(id)}`, { timeoutMs: 4000 });
    return { title: a.name || 'Admin' };
  } catch {
    return { title: 'Admin' };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <AccessGate>
      <AdminDetail id={id} />
    </AccessGate>
  );
}
