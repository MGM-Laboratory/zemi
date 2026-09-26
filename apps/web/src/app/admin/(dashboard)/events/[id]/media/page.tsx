import type { Metadata } from 'next';
import { MediaDocsTab } from '@/components/admin/media-docs/media-tab';

export const metadata: Metadata = { title: 'Media' };

export default function EventMediaPage() {
  return <MediaDocsTab />;
}
