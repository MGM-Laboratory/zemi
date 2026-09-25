import { Inject, Injectable } from '@nestjs/common';
import { isValidSlug, slugify, SLUG_MAX, type ResourceType } from '@zemi/shared';
import { and, eq, ne, like, or } from 'drizzle-orm';
import { DB, type Db, type DbOrTx } from '../db/client.js';
import { events, publications, slugRedirects, speakers } from '../db/schema.js';
import { conflict, validationError } from './errors.js';

export type SlugType = ResourceType; // 'event' | 'speaker' | 'publication'

const TABLES = { event: events, speaker: speakers, publication: publications } as const;

export type SlugResolution = { id: string } | { redirect: string } | null;

/**
 * Slugs are unique per type and old slugs keep working through `slug_redirects` (SPEC section 4).
 *
 * On create:  slug = await slugs.uniqueSlug('event', input.slug ?? input.title)
 * On update:  await slugs.ensureUniqueSlug('event', next, id);
 *             if (next !== prev) await slugs.recordSlugChange('event', id, prev, next, tx);
 * Public GET: const r = await slugs.resolveSlug('event', slug); // {id} | {redirect} | null
 */
@Injectable()
export class SlugService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Is `slug` used by another resource of this type (current slugs only)? */
  async isTaken(type: SlugType, slug: string, excludeId?: string | null, db: DbOrTx = this.db): Promise<boolean> {
    const t = TABLES[type];
    const rows = await db
      .select({ id: t.id })
      .from(t)
      .where(excludeId ? and(eq(t.slug, slug), ne(t.id, excludeId)) : eq(t.slug, slug))
      .limit(1);
    return rows.length > 0;
  }

  /** Throw 400 for an invalid slug and 409 when it is taken by another resource of the same type. */
  async ensureUniqueSlug(type: SlugType, slug: string, excludeId?: string | null, db: DbOrTx = this.db): Promise<void> {
    if (!isValidSlug(slug)) {
      const message = 'Use lowercase letters, numbers and dashes, like "my-first-talk".';
      throw validationError(message, [{ path: ['slug'], message, code: 'custom' }]);
    }
    if (await this.isTaken(type, slug, excludeId, db)) {
      const message = `The address "${slug}" is already taken. Try another one.`;
      throw conflict(message, { details: { field: 'slug', slug, issues: [{ path: ['slug'], message, code: 'custom' }] } });
    }
  }

  /**
   * First free slug based on `base` (slugified): `my-talk`, `my-talk-2`, `my-talk-3`...
   * Use when the slug is generated from a title rather than typed by a person.
   */
  async uniqueSlug(type: SlugType, base: string, excludeId?: string | null, db: DbOrTx = this.db): Promise<string> {
    const root = slugify(base, SLUG_MAX - 4);
    const t = TABLES[type];
    const rows = await db
      .select({ slug: t.slug })
      .from(t)
      .where(
        excludeId
          ? and(or(eq(t.slug, root), like(t.slug, `${root}-%`)), ne(t.id, excludeId))
          : or(eq(t.slug, root), like(t.slug, `${root}-%`)),
      );
    const used = new Set(rows.map((r) => r.slug));
    if (!used.has(root)) return root;
    for (let n = 2; n < 10_000; n++) {
      const candidate = `${root}-${n}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  /**
   * Remember that `oldSlug` now points at `id`. Also removes a redirect whose old slug equals the
   * new slug, so renaming back to a previous slug (or claiming another resource's old slug) works.
   * Call inside the same transaction as the slug update.
   */
  async recordSlugChange(type: SlugType, id: string, oldSlug: string, newSlug?: string | null, db: DbOrTx = this.db): Promise<void> {
    if (newSlug) {
      await db.delete(slugRedirects).where(and(eq(slugRedirects.resourceType, type), eq(slugRedirects.oldSlug, newSlug)));
    }
    if (!oldSlug || oldSlug === newSlug) return;
    await db
      .insert(slugRedirects)
      .values({ resourceType: type, oldSlug, resourceId: id })
      .onConflictDoUpdate({
        target: [slugRedirects.resourceType, slugRedirects.oldSlug],
        set: { resourceId: id, createdAt: new Date() },
      });
  }

  /**
   * Resolve a public slug: `{ id }` when it is current, `{ redirect: currentSlug }` when it is an old
   * one (the web answers with a 308), or null when nothing matches.
   */
  async resolveSlug(type: SlugType, slug: string, db: DbOrTx = this.db): Promise<SlugResolution> {
    if (!slug || slug.length > SLUG_MAX) return null;
    const t = TABLES[type];
    const [current] = await db.select({ id: t.id }).from(t).where(eq(t.slug, slug)).limit(1);
    if (current) return { id: current.id };
    const [redirect] = await db
      .select({ resourceId: slugRedirects.resourceId })
      .from(slugRedirects)
      .where(and(eq(slugRedirects.resourceType, type), eq(slugRedirects.oldSlug, slug)))
      .limit(1);
    if (!redirect) return null;
    const [target] = await db.select({ slug: t.slug }).from(t).where(eq(t.id, redirect.resourceId)).limit(1);
    if (!target || target.slug === slug) return null;
    return { redirect: target.slug };
  }

  /** Drop redirects of a deleted resource. */
  async forgetResource(type: SlugType, id: string, db: DbOrTx = this.db): Promise<void> {
    await db.delete(slugRedirects).where(and(eq(slugRedirects.resourceType, type), eq(slugRedirects.resourceId, id)));
  }
}
