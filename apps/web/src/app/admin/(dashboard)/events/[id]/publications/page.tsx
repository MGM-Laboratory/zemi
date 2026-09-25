import type { Metadata } from 'next';
import { PublicationsEditor } from '@/components/admin/events/publications/publications-editor';

export const metadata: Metadata = { title: 'Event publications' };

export default function Page() {
  return <PublicationsEditor />;
}
