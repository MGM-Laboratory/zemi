import type { Metadata } from 'next';
import { DiscussionSpace } from '@/components/public/discussion/discussion-space';

export const metadata: Metadata = { title: 'Conversation', robots: { index: false, follow: false } };
export default async function DiscussionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiscussionSpace id={id} />;
}
