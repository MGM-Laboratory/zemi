import type { Metadata } from 'next';
import { DiscussionCreatePage } from '@/components/public/discussion/discussion-create';

export const metadata: Metadata = { title: 'Ask a question', description: 'Start a conversation about a Friday seminar.', robots: { index: false, follow: false } };

export default async function CreateDiscussionPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  return <DiscussionCreatePage editId={typeof edit === 'string' ? edit : undefined} />;
}
