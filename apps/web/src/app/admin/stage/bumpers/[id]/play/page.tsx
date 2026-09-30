import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/components/admin/events/lib';
import { BumperPlayer } from '@/components/bumpers/live/player';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: 'Player' };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SLIDE_ID = /^[A-Za-z0-9_-]{4,32}$/;

/**
 * /admin/stage/bumpers/[id]/play: the full-window player for the room screen.
 * `?from=<slideId>` (or the builder's `?slide=`) starts at that bumper.
 */
export default async function BumperPlayPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const from = first(sp.from) ?? first(sp.slide) ?? null;
  return <BumperPlayer id={id.toLowerCase()} from={from && SLIDE_ID.test(from) ? from : null} />;
}
