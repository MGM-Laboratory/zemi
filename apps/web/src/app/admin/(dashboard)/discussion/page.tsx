import type { Metadata } from 'next';
import { Moderation } from '@/components/admin/discussion/moderation';
export const metadata: Metadata = { title: 'Discussion' };
export default function Page() { return <Moderation />; }
