import type { Metadata } from 'next';
import { TeamManager } from '@/components/admin/site/team-manager';

export const metadata: Metadata = { title: 'Site: team' };

export default function Page() {
  return <TeamManager />;
}
