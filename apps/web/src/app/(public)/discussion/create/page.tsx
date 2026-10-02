import type { Metadata } from 'next';
import { DiscussionCreatePage } from '@/components/public/discussion/discussion-create';

export const metadata: Metadata = { title: 'Ask a question', description: 'Start a conversation about a Friday seminar.', robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

/** `?edit=<thread>` edits; `?event=<id>&speaker=<id>` starts a new question already addressed (from the live window, speaker pages). */
export default async function CreateDiscussionPage({ searchParams }: { searchParams: Promise<{ edit?: string; event?: string; speaker?: string }> }) {
  const { edit, event, speaker } = await searchParams;
  return <DiscussionCreatePage editId={one(edit)} eventId={one(event)} speakerId={one(speaker)} />;
}
