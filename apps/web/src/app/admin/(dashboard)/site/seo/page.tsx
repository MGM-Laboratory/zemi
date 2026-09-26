import type { Metadata } from 'next';
import { SeoSettings } from '@/components/admin/site/seo-form';

export const metadata: Metadata = { title: 'Site: SEO and sharing' };

export default function Page() {
  return <SeoSettings />;
}
