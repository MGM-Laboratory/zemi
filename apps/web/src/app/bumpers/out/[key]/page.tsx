import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BumperOutput } from '@/components/bumpers/live/output';

const KEY_RE = /^[A-Za-z0-9]{24,64}$/;

type Props = {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: { absolute: 'Zemi bumpers output' } };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /bumpers/out/[key]: the OBS browser source (output key, no session). `?bg=black`, `?safe=1`. */
export default async function BumperOutputPage({ params, searchParams }: Props) {
  const { key } = await params;
  if (!KEY_RE.test(key)) notFound();
  const sp = await searchParams;
  return <BumperOutput outputKey={key} bg={first(sp.bg) === 'black' ? 'black' : null} safe={first(sp.safe) === '1'} />;
}
