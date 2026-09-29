import type { Metadata } from 'next';
import { DiscussionSpace } from '@/components/public/discussion/discussion-space';
import { shareMeta } from '@/components/public/media/share-meta';

const description = 'A space for questions before and after every Friday seminar. Join with just your name.';
export const metadata: Metadata = {
  title: 'Discussion',
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/discussion' },
  ...shareMeta({ title: 'Discussion', description, url: '/discussion' }),
};

export default function DiscussionPage() { return <DiscussionSpace />; }
