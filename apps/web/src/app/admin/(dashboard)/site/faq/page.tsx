import type { Metadata } from 'next';
import { FaqManager } from '@/components/admin/site/faq-manager';

export const metadata: Metadata = { title: 'Site: FAQ' };

export default function Page() {
  return <FaqManager />;
}
