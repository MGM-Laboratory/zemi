import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import '@/components/admin/admin.css';
import { AdminShell } from '@/components/admin/shell/admin-shell';
import { GateError } from '@/components/admin/shell/gate-error';
import { AdminToaster } from '@/components/admin/ui/toast';
import { AdminProviders } from '@/lib/admin/providers';
import { currentAdminPath, getMeServer } from '@/lib/admin/server';

export const metadata: Metadata = {
  title: { default: 'Studio', template: '%s · Zemi Studio' },
  robots: { index: false, follow: false },
};

// BlockNote asks for resizes-content so the on-screen keyboard does not cover the editor.
export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

/**
 * Admin dashboard gate. Validates the session against the API on every request
 * (revocations and policy edits apply immediately), then renders the shell.
 * - 401: back to the login page with ?next
 * - API down: an error screen with retry (never logs people out)
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
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
      <AdminShell>{children}</AdminShell>
      <AdminToaster />
    </AdminProviders>
  );
}
