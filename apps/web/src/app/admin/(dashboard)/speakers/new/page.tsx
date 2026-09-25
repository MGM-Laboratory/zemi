import type { Metadata } from 'next';
import { SpeakerEditor } from '@/components/admin/content/speakers/speaker-editor';

export const metadata: Metadata = { title: 'New speaker' };

export default function Page() {
  return <SpeakerEditor />;
}
