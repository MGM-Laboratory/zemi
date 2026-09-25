import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '@/components/admin/admin.css';
import { safeAdminNext } from '@/lib/admin/paths';
import { getMeServer } from '@/lib/admin/server';
import { LoginScreen, type LoginReason } from './login-screen';

export const metadata: Metadata = {
  title: 'Log in',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * /admin/login. Passphrase only. `?next=` is sanitized to same-site /admin paths.
 * If the cookie is still valid we skip the form. A stale cookie shows the form (no loop).
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeAdminNext(sp.next);
  const rawReason = Array.isArray(sp.reason) ? sp.reason[0] : sp.reason;
  const reason: LoginReason = rawReason === 'expired' || rawReason === 'signed-out' ? rawReason : null;

  const me = await getMeServer();
  if (me.ok) redirect(next);

  return <LoginScreen next={next} reason={reason} />;
}
