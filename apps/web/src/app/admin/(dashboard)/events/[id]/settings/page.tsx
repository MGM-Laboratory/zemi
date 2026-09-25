import type { Metadata } from 'next';
import { EventSettingsPanel } from '@/components/admin/events/settings/settings-panel';

export const metadata: Metadata = { title: 'Event settings' };

export default function Page() {
  return <EventSettingsPanel />;
}
