import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import '@/components/admin/admin.css';
import { GateError } from '@/components/admin/shell/gate-error';
import { ConfirmProvider } from '@/components/admin/ui/confirm-dialog';
import { AdminToaster } from '@/components/admin/ui/toast';
import { AdminProviders } from '@/lib/admin/providers';
import { currentAdminPath, getMeServer } from '@/lib/admin/server';

export const metadata: Metadata = {
  title: { default: 'Stage', template: '%s · Zemi Studio' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0e1116',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Full-window admin screens without the dashboard chrome: the bumper player (covers the whole
 * browser window for the venue screen), the controller, and the bumper lab. Same session rules as
 * the dashboard (and the door scanner): a 401 goes to login with ?next, an unreachable API shows a
 * retry screen.
 */
export default async function StageLayout({ children }: { children: ReactNode }) {
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
      <ConfirmProvider>
        <div className="zemi-admin zemi-stage">{children}</div>
      </ConfirmProvider>
      <AdminToaster />
    </AdminProviders>
  );
}
