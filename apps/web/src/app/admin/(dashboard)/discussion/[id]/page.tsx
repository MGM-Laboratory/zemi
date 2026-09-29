import type { Metadata } from 'next';
import { Moderation } from '@/components/admin/discussion/moderation';
export const metadata: Metadata = { title: 'Moderate discussion' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Moderation id={id} />;
}
