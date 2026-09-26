import type { Metadata } from 'next';
import { AboutSettings } from '@/components/admin/site/about-form';

export const metadata: Metadata = { title: 'Site: about' };

export default function Page() {
  return <AboutSettings />;
}
