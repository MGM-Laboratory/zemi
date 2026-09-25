import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CACHE_TAG_PATTERN } from '@/lib/api/tags';

/**
 * POST /api/revalidate { secret, tags: string[] }
 * Called by the API after every content mutation (SPEC section 7).
 *
 * Uses `{ expire: 0 }` so the next visitor after an admin edit gets fresh data
 * (the 'max' profile would serve one more stale render first).
 */
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  secret: z.string().min(1).max(512),
  tags: z.array(z.string().regex(CACHE_TAG_PATTERN)).min(1).max(100),
});

function secretMatches(given: string): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const error = (status: number, code: string, message: string, details?: unknown) =>
  NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return error(400, 'bad_json', 'Send JSON like { "secret": "...", "tags": ["events"] }.');
  }

  const secret = (json as { secret?: unknown } | null)?.secret;
  if (typeof secret !== 'string' || !secretMatches(secret)) {
    return error(401, 'unauthorized', 'That secret does not match.');
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error(400, 'validation', 'Tags look off.', parsed.error.issues);
  }

  const tags = [...new Set(parsed.data.tags)];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  return NextResponse.json({ revalidated: tags, now: Date.now() });
}
