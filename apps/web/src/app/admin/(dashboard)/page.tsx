import type { Metadata } from 'next';
import { OverviewDashboard } from '@/components/admin/events/overview/overview-dashboard';

export const metadata: Metadata = { title: 'Overview' };

export default function OverviewPage() {
  return <OverviewDashboard />;
}
