import type { Metadata } from 'next';
import { RundownEditor } from '@/components/admin/events/rundown/rundown-editor';

export const metadata: Metadata = { title: 'Event rundown' };

export default function Page() {
  return <RundownEditor />;
}
