import type { Metadata } from 'next';
import { VenuesPage } from '@/components/admin/content/venues/venues-page';

export const metadata: Metadata = { title: 'Venues' };

export default function Page() {
  return <VenuesPage />;
}
