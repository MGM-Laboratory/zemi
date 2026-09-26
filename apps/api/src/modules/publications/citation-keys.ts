import { makeCitationKey } from '@zemi/shared';
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { publicationAuthors, publications, speakers } from '../../db/schema.js';

/**
 * The first free key for `base` among `used`: "lecun2015deep", then "lecun2015deepb" ... "z", then
 * "-2", "-3"... Pure, so the service and the backfill pick the same keys.
 */
export function pickCitationKey(base: string, used: ReadonlySet<string | null>): string {
  const root = base || 'zemi';
  if (!used.has(root)) return root;
  for (const c of 'bcdefghijklmnopqrstuvwxyz') if (!used.has(`${root}${c}`)) return `${root}${c}`;
  for (let n = 2; n < 1000; n++) if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Give every publication without a citation key one, made like the service does (first author's
 * family name, year, first real title word) and unique across the table. Idempotent: only rows with
 * a null or blank key are touched, so it is safe to run on every boot and after seeding. An advisory
 * lock keeps two instances (a deploy overlap) from handing out the same key.
 */
export async function backfillCitationKeys(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('zemi.citation-keys'))`);
    const missing = await tx
      .select({ id: publications.id, title: publications.title, year: publications.publishedYear })
      .from(publications)
      .where(or(isNull(publications.citationKey), sql`btrim(${publications.citationKey}) = ''`))
      .orderBy(asc(publications.createdAt), asc(publications.id));
    if (!missing.length) return 0;

    const authorRows = await tx
      .select({
        publicationId: publicationAuthors.publicationId,
        fullName: publicationAuthors.fullName,
        speakerName: speakers.fullName,
      })
      .from(publicationAuthors)
      .leftJoin(speakers, eq(speakers.id, publicationAuthors.speakerId))
      .where(inArray(publicationAuthors.publicationId, missing.map((m) => m.id)))
      .orderBy(asc(publicationAuthors.publicationId), asc(publicationAuthors.sortOrder));
    const names = new Map<string, string[]>();
    for (const a of authorRows) {
      const name = a.speakerName ?? a.fullName ?? '';
      if (!name) continue;
      names.set(a.publicationId, [...(names.get(a.publicationId) ?? []), name]);
    }

    const used = new Set<string | null>(
      (
        await tx
          .select({ key: publications.citationKey })
          .from(publications)
          .where(and(isNotNull(publications.citationKey), sql`btrim(${publications.citationKey}) <> ''`))
      ).map((r) => r.key),
    );
    for (const m of missing) {
      const key = pickCitationKey(makeCitationKey({ authors: names.get(m.id) ?? [], year: m.year, title: m.title }), used);
      used.add(key);
      await tx
        .update(publications)
        // Keep updated_at: a backfilled key is not an edit (it would reshuffle "recently updated" lists).
        .set({ citationKey: key, updatedAt: sql`${publications.updatedAt}` })
        .where(and(eq(publications.id, m.id), or(isNull(publications.citationKey), sql`btrim(${publications.citationKey}) = ''`)));
    }
    return missing.length;
  });
}
