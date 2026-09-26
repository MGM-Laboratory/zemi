import type { Metadata } from 'next';
import { StreamControlRoom } from '@/components/admin/stream/control-room';

export const metadata: Metadata = { title: 'Stream' };

export default function EventStreamPage() {
  return <StreamControlRoom />;
}
