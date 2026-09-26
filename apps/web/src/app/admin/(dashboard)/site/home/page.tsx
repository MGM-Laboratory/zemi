import type { Metadata } from 'next';
import { HomeSettings } from '@/components/admin/site/home-form';

export const metadata: Metadata = { title: 'Site: home' };

export default function Page() {
  return <HomeSettings />;
}
