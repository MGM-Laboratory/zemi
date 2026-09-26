import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import '@/components/admin/admin.css';
import { GateError } from '@/components/admin/shell/gate-error';
import { AdminToaster } from '@/components/admin/ui/toast';
import { AdminProviders } from '@/lib/admin/providers';
import { currentAdminPath, getMeServer } from '@/lib/admin/server';

export const metadata: Metadata = {
  title: { default: 'Door scanner', template: '%s · Zemi Studio' },
  robots: { index: false, follow: false },
};

// Full-bleed dark camera screen: paint under the notch, never zoom on double tap.
export const viewport: Viewport = {
  themeColor: '#0e1116',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Door scanner gate, outside the dashboard chrome (no sidebar or topbar). Same session rules as
 * the dashboard: every request re-validates with the API, a 401 goes to login with ?next, an
 * unreachable API shows a retry screen instead of logging anyone out.
 */
export default async function ScanLayout({ children }: { children: ReactNode }) {
  const res = await getMeServer();
  if (!res.ok) {
    if (res.reason === 'unauthorized') {
      const next = await currentAdminPath();
      redirect(`/admin/login?${new URLSearchParams({ next, reason: 'expired' }).toString()}`);
    }
    return <GateError message={res.message} />;
  }
  return (
    <AdminProviders me={res.me}>
      <div className="zemi-admin zemi-scan">{children}</div>
      <AdminToaster />
    </AdminProviders>
  );
}
