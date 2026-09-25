import type { PublicationAdmin } from '@zemi/shared';
import type { Metadata } from 'next';
import { PublicationEditor } from '@/components/admin/content/publications/publication-editor';
import { adminServerFetch } from '@/lib/admin/server';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const p = await adminServerFetch<Pick<PublicationAdmin, 'title'>>(`/admin/publications/${encodeURIComponent(id)}`, { timeoutMs: 4000 });
    return { title: p.title || 'Publication' };
  } catch {
    return { title: 'Publication' };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <PublicationEditor id={id} />;
}
