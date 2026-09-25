import type { SpeakerAdmin } from '@zemi/shared';
import type { Metadata } from 'next';
import { SpeakerEditor } from '@/components/admin/content/speakers/speaker-editor';
import { adminServerFetch } from '@/lib/admin/server';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const s = await adminServerFetch<Pick<SpeakerAdmin, 'fullName'>>(`/admin/speakers/${encodeURIComponent(id)}`, { timeoutMs: 4000 });
    return { title: s.fullName || 'Speaker' };
  } catch {
    return { title: 'Speaker' };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <SpeakerEditor id={id} />;
}
