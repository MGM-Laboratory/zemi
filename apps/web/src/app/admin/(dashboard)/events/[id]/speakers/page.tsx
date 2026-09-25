import type { Metadata } from 'next';
import { SpeakersEditor } from '@/components/admin/events/speakers/speakers-editor';

export const metadata: Metadata = { title: 'Event speakers' };

export default function Page() {
  return <SpeakersEditor />;
}
