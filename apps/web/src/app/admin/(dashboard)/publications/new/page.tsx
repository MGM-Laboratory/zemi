import type { Metadata } from 'next';
import { PublicationEditor } from '@/components/admin/content/publications/publication-editor';

export const metadata: Metadata = { title: 'New publication' };

export default function Page() {
  return <PublicationEditor />;
}
