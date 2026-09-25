import type { Metadata } from 'next';
import { KitPage } from '@/components/admin/kit/kit-page';

export const metadata: Metadata = { title: 'UI kit' };

/** Living reference of every admin component. Safe to open with any role. */
export default function Page() {
  return <KitPage />;
}
