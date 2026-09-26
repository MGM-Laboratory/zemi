import { NextResponse, type NextRequest } from 'next/server';
import { getEvents, getNextEvent } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * /live: jump to whatever is on air right now.
 * 1. an event whose stream is live, 2. the next event (upcoming or happening by time), 3. /events.
 * Temporary (307) on purpose: the target changes every Friday.
 */
export async function GET(request: NextRequest) {
  const live = await getEvents({ when: 'live', pageSize: 1 });
  const target = live.items[0] ?? (await getNextEvent());
  const path = target ? `/events/${encodeURIComponent(target.slug)}` : '/events';
  const res = NextResponse.redirect(new URL(path, request.url), 307);
  res.headers.set('cache-control', 'no-store');
  return res;
}
