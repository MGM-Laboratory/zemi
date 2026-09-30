import type { BumperShowDetail } from '@zemi/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/components/admin/events/lib';
import { Builder } from '@/components/bumpers/builder/builder';
import { adminServerFetch } from '@/lib/admin/server';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: 'Bumpers' };
  try {
    const show = await adminServerFetch<Pick<BumperShowDetail, 'title'>>(`/admin/bumpers/${id.toLowerCase()}`, { timeoutMs: 4000 });
    return { title: show.title || 'Bumpers' };
  } catch {
    return { title: 'Bumpers' };
  }
}

/** The bumper builder. The show loads on the client; 403 and 404 get their own screens there. */
export default async function BumperBuilderPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <Builder id={id.toLowerCase()} />;
}
