import type { Metadata } from 'next';
import { GeneralSettings } from '@/components/admin/site/general-form';

export const metadata: Metadata = { title: 'Site: general' };

export default function Page() {
  return <GeneralSettings />;
}
