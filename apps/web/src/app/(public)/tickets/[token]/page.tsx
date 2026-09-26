import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TicketView } from '@/components/public/ticket/ticket-view';
import { ApiUnavailable } from '@/components/public/ui/empty-state';
import { getTicket, unwrapLookup } from '@/lib/api/server';

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Your ticket',
  description: 'Your Zemi ticket. Show the QR at the door.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function TicketPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const ticket = unwrapLookup(await getTicket(token), '/tickets');
  if (!ticket) {
    return (
      <section className="container-page pb-[var(--section-y)] pt-[calc(var(--nav-h)+64px)]">
        <ApiUnavailable what="your ticket" />
      </section>
    );
  }
  const cancel = sp.cancel === '1' || sp.cancel === 'true';
  return <TicketView initial={ticket} openCancel={cancel} />;
}
