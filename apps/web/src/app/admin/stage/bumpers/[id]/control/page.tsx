import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/components/admin/events/lib';
import { BumperController } from '@/components/bumpers/live/controller';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Controller' };

/** /admin/stage/bumpers/[id]/control: the control room for a show (run permission). */
export default async function BumperControlPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <BumperController id={id.toLowerCase()} />;
}
