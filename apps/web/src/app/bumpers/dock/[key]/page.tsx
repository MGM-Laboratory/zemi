import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BumperDock } from '@/components/bumpers/live/dock';

const KEY_RE = /^[A-Za-z0-9]{24,64}$/;

type Props = { params: Promise<{ key: string }> };

export const metadata: Metadata = {
  title: { absolute: 'Zemi bumpers dock' },
  // The dock posts to its own origin; the API tells dock presses apart by Origin/Referer, which
  // "no-referrer" would blank out. Nothing is sent to other origins.
  referrer: 'same-origin',
};

/** /bumpers/dock/[key]: the compact controller for an OBS custom browser dock and phones (control key). */
export default async function BumperDockPage({ params }: Props) {
  const { key } = await params;
  if (!KEY_RE.test(key)) notFound();
  return <BumperDock controlKey={key} />;
}
