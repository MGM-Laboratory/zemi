import { Inject, Injectable } from '@nestjs/common';
import {
  SITE_SETTING_SCHEMAS,
  type EventMode,
  type Faq,
  type ImageRef,
  type Principal,
  type PublicSite,
  type SiteSettingKey,
  type SiteSettings,
  type SiteStats,
  type TeamMember,
  faqInput,
  teamMemberInput,
} from '@zemi/shared';
import { and, asc, count, countDistinct, eq, gt, isNotNull, isNull, lte, max, min, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AssetRefsService } from '../../common/asset-refs.js';
import { badRequest, notFound, validationError } from '../../common/errors.js';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import {
  assets,
  eventSpeakers,
  events,
  faqs,
  publications,
  registrations,
  siteSettings,
  teamMembers,
  venues,
} from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';
import { changedFields, mergeAllSettings, mergeSetting, publicSettings, SITE_SETTING_LABELS } from './site-settings.js';

export interface Ctx {
  principal: Principal;
  ip: string | null;
}

type FaqRow = typeof faqs.$inferSelect;
type TeamRow = typeof teamMembers.$inferSelect;
type FaqCreate = z.infer<typeof faqInput>;
type TeamCreate = z.infer<typeof teamMemberInput>;

/** How long GET /public/site is served from memory. */
const PUBLIC_CACHE_MS = 30_000;

const trimOrNull = (s: string | null | undefined) => (s ?? '').trim() || null;

function toFaq(row: FaqRow): Faq {
  return { id: row.id, question: row.question, answer: row.answer, visibility: row.visibility, sortOrder: row.sortOrder };
}

/**
 * Site CMS: settings sections, FAQ, team, and the public `GET /public/site` payload (with stats).
 * Every mutation is audited, drops the in-memory public cache and revalidates the `site` tag on the web.
 */
@Injectable()
export class SiteService {
  private publicCache: { at: number; value: PublicSite } | null = null;
  private publicInflight: Promise<PublicSite> | null = null;
  /** Bumped by every change, so a build that started before the change can't cache (or serve) stale data. */
  private publicGeneration = 0;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refs: AssetRefsService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
  ) {}

  /* ------------------------------------------------------------------------------ settings */

  async getSettings(db: DbOrTx = this.db): Promise<SiteSettings> {
    const rows = await db.select({ key: siteSettings.key, value: siteSettings.value }).from(siteSettings);
    return mergeAllSettings(rows);
  }

  async getSetting<K extends SiteSettingKey>(key: K, db: DbOrTx = this.db): Promise<SiteSettings[K]> {
    const [row] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
    return mergeSetting(key, row?.value);
  }

  /**
   * PUT /admin/site/settings/:key. The body is merged over the current value (top-level fields), so a
   * form may send the whole section or just what changed. Arrays are replaced, never merged.
   */
  async updateSetting<K extends SiteSettingKey>(key: K, body: unknown, ctx: Ctx): Promise<SiteSettings[K]> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw validationError('Send the settings as an object.');
    }
    const before = await this.getSetting(key);
    const schema = SITE_SETTING_SCHEMAS[key];
    const parsed = schema.safeParse({ ...(before as Record<string, unknown>), ...(body as Record<string, unknown>) });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path.map(String).join('.');
      throw validationError(first ? `${path ? `${path}: ` : ''}${first.message}` : 'Some fields need another look.', parsed.error.issues);
    }
    const value = parsed.data as SiteSettings[K];
    await this.assertReferences(key, value);

    await this.db
      .insert(siteSettings)
      .values({ key, value: value as Record<string, unknown>, updatedBy: ctx.principal.name })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: value, updatedBy: ctx.principal.name, updatedAt: new Date() } });

    const fields = changedFields(before, value);
    await this.audit.log({
      principal: ctx.principal,
      action: 'site.update',
      resourceType: 'site',
      resourceId: key,
      summary: fields.length ? `Updated the ${SITE_SETTING_LABELS[key]} settings (${fields.join(', ')})` : `Saved the ${SITE_SETTING_LABELS[key]} settings`,
      meta: { key, fields },
      ip: ctx.ip,
    });
    this.changed();
    return value;
  }

  /** jsonb has no foreign keys, so check ids that point at other tables before saving. */
  private async assertReferences(key: SiteSettingKey, value: SiteSettings[SiteSettingKey]): Promise<void> {
    const issue = (path: string[], message: string) => validationError(`${path.join('.')}: ${message}`, [{ code: 'custom', path, message }]);
    if (key === 'seo') {
      const id = (value as SiteSettings['seo']).ogImageAssetId;
      if (id) {
        const [row] = await this.db.select({ kind: assets.kind }).from(assets).where(eq(assets.id, id)).limit(1);
        if (!row) throw issue(['ogImageAssetId'], "We couldn't find that image. Upload it again?");
        if (row.kind !== 'image') throw issue(['ogImageAssetId'], 'The share image has to be a photo or graphic.');
      }
    }
    if (key === 'home') {
      const id = (value as SiteSettings['home']).featuredEventId;
      if (id) {
        const [row] = await this.db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1);
        if (!row) throw issue(['featuredEventId'], "We couldn't find that event.");
      }
    }
    if (key === 'general') {
      const id = (value as SiteSettings['general']).defaultVenueId;
      if (id) {
        const [row] = await this.db.select({ id: venues.id }).from(venues).where(eq(venues.id, id)).limit(1);
        if (!row) throw issue(['defaultVenueId'], "We couldn't find that room.");
      }
    }
  }

  /* ---------------------------------------------------------------------------------- FAQ */

  async listFaqs(): Promise<Faq[]> {
    const rows = await this.db.select().from(faqs).orderBy(asc(faqs.sortOrder), asc(faqs.createdAt));
    return rows.map(toFaq);
  }

  async createFaq(input: FaqCreate, ctx: Ctx): Promise<Faq> {
    const [{ top }] = await this.db.select({ top: max(faqs.sortOrder) }).from(faqs);
    const [row] = await this.db
      .insert(faqs)
      .values({ question: input.question.trim(), answer: input.answer.trim(), visibility: input.visibility, sortOrder: (top ?? -1) + 1 })
      .returning();
    await this.audit.log({ principal: ctx.principal, action: 'faq.create', resourceType: 'faq', resourceId: row.id, summary: `Added the FAQ "${short(row.question)}"`, ip: ctx.ip });
    this.changed();
    return toFaq(row);
  }

  async updateFaq(id: string, input: Partial<FaqCreate>, ctx: Ctx): Promise<Faq> {
    const set: Partial<typeof faqs.$inferInsert> = {};
    if (input.question !== undefined) set.question = input.question.trim();
    if (input.answer !== undefined) set.answer = input.answer.trim();
    if (input.visibility !== undefined) set.visibility = input.visibility;
    const existing = await this.findFaq(id);
    if (!Object.keys(set).length) return toFaq(existing);
    const [row] = await this.db.update(faqs).set(set).where(eq(faqs.id, id)).returning();
    await this.audit.log({
      principal: ctx.principal,
      action: 'faq.update',
      resourceType: 'faq',
      resourceId: id,
      summary: `Updated the FAQ "${short(row.question)}"`,
      meta: { fields: Object.keys(set) },
      ip: ctx.ip,
    });
    this.changed();
    return toFaq(row);
  }

  async removeFaq(id: string, ctx: Ctx): Promise<void> {
    const existing = await this.findFaq(id);
    await this.db.delete(faqs).where(eq(faqs.id, id));
    await this.audit.log({ principal: ctx.principal, action: 'faq.delete', resourceType: 'faq', resourceId: id, summary: `Deleted the FAQ "${short(existing.question)}"`, ip: ctx.ip });
    this.changed();
  }

  async orderFaqs(ids: string[], ctx: Ctx): Promise<Faq[]> {
    await this.reorder('faq', ids);
    await this.audit.log({ principal: ctx.principal, action: 'faq.reorder', resourceType: 'faq', summary: 'Reordered the FAQ', meta: { ids }, ip: ctx.ip });
    this.changed();
    return this.listFaqs();
  }

  private async findFaq(id: string): Promise<FaqRow> {
    const [row] = await this.db.select().from(faqs).where(eq(faqs.id, id)).limit(1);
    if (!row) throw notFound("We couldn't find that question.");
    return row;
  }

  /* --------------------------------------------------------------------------------- team */

  async listTeam(): Promise<TeamMember[]> {
    const rows = await this.db.select().from(teamMembers).orderBy(asc(teamMembers.sortOrder), asc(teamMembers.createdAt));
    return this.toTeam(rows);
  }

  async createTeamMember(input: TeamCreate, ctx: Ctx): Promise<TeamMember> {
    await this.assertAvatar(input.avatarAssetId);
    const [{ top }] = await this.db.select({ top: max(teamMembers.sortOrder) }).from(teamMembers);
    const [row] = await this.db
      .insert(teamMembers)
      .values({
        name: input.name.trim(),
        role: trimOrNull(input.role),
        bio: trimOrNull(input.bio),
        avatarAssetId: input.avatarAssetId ?? null,
        links: input.links,
        visibility: input.visibility,
        sortOrder: (top ?? -1) + 1,
      })
      .returning();
    await this.audit.log({ principal: ctx.principal, action: 'team.create', resourceType: 'team', resourceId: row.id, summary: `Added ${row.name} to the team`, ip: ctx.ip });
    this.changed();
    return (await this.toTeam([row]))[0];
  }

  async updateTeamMember(id: string, input: Partial<TeamCreate>, ctx: Ctx): Promise<TeamMember> {
    const existing = await this.findTeamMember(id);
    const set: Partial<typeof teamMembers.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name.trim();
    if (input.role !== undefined) set.role = trimOrNull(input.role);
    if (input.bio !== undefined) set.bio = trimOrNull(input.bio);
    if (input.avatarAssetId !== undefined) {
      await this.assertAvatar(input.avatarAssetId);
      set.avatarAssetId = input.avatarAssetId ?? null;
    }
    if (input.links !== undefined) set.links = input.links;
    if (input.visibility !== undefined) set.visibility = input.visibility;
    if (!Object.keys(set).length) return (await this.toTeam([existing]))[0];
    const [row] = await this.db.update(teamMembers).set(set).where(eq(teamMembers.id, id)).returning();
    await this.audit.log({
      principal: ctx.principal,
      action: 'team.update',
      resourceType: 'team',
      resourceId: id,
      summary: `Updated ${row.name} on the team page`,
      meta: { fields: Object.keys(set) },
      ip: ctx.ip,
    });
    this.changed();
    return (await this.toTeam([row]))[0];
  }

  async removeTeamMember(id: string, ctx: Ctx): Promise<void> {
    const existing = await this.findTeamMember(id);
    await this.db.delete(teamMembers).where(eq(teamMembers.id, id));
    await this.audit.log({ principal: ctx.principal, action: 'team.delete', resourceType: 'team', resourceId: id, summary: `Removed ${existing.name} from the team`, ip: ctx.ip });
    this.changed();
  }

  async orderTeam(ids: string[], ctx: Ctx): Promise<TeamMember[]> {
    await this.reorder('team', ids);
    await this.audit.log({ principal: ctx.principal, action: 'team.reorder', resourceType: 'team', summary: 'Reordered the team', meta: { ids }, ip: ctx.ip });
    this.changed();
    return this.listTeam();
  }

  private async findTeamMember(id: string): Promise<TeamRow> {
    const [row] = await this.db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    if (!row) throw notFound("We couldn't find that team member.");
    return row;
  }

  private async assertAvatar(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const [row] = await this.db.select({ kind: assets.kind }).from(assets).where(eq(assets.id, id)).limit(1);
    const message = !row ? "We couldn't find that photo. Upload it again?" : row.kind !== 'image' ? 'The avatar has to be a photo.' : null;
    if (message) throw validationError(`avatarAssetId: ${message}`, [{ code: 'custom', path: ['avatarAssetId'], message }]);
  }

  private async toTeam(rows: TeamRow[]): Promise<TeamMember[]> {
    const avatars = await this.refs.imageRefs(rows.map((r) => r.avatarAssetId));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role ?? null,
      bio: r.bio ?? null,
      avatar: (r.avatarAssetId && avatars.get(r.avatarAssetId)) || null,
      avatarAssetId: r.avatarAssetId ?? null,
      links: r.links ?? [],
      visibility: r.visibility,
      sortOrder: r.sortOrder,
    }));
  }

  /**
   * PUT .../order { ids }: ids in the new order. Every id must exist. Rows left out keep their relative
   * order and go after the listed ones, so a stale list can't lose anything.
   */
  private async reorder(kind: 'faq' | 'team', ids: string[]): Promise<void> {
    const table = kind === 'faq' ? faqs : teamMembers;
    if (new Set(ids).size !== ids.length) throw badRequest('The same item is in the list twice.');
    await this.db.transaction(async (tx) => {
      const rows = await tx.select({ id: table.id }).from(table).orderBy(asc(table.sortOrder), asc(table.createdAt)).for('update');
      const known = new Set(rows.map((r) => r.id));
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length) throw badRequest("Some of those items don't exist anymore. Refresh and try again.", { details: { unknown } });
      const listed = new Set(ids);
      const order = [...ids, ...rows.map((r) => r.id).filter((id) => !listed.has(id))];
      if (!order.length) return;
      // One UPDATE with a VALUES list instead of N round trips.
      const values = sql.join(
        order.map((id, i) => sql`(${id}::uuid, ${i}::int)`),
        sql`, `,
      );
      await tx.execute(sql`update ${table} set sort_order = v.pos from (values ${values}) as v(id, pos) where ${table.id} = v.id`);
    });
  }

  /* ------------------------------------------------------------------------------- public */

  /** GET /public/site, served from memory for 30s (and rebuilt at most once at a time). */
  async getPublic(): Promise<PublicSite> {
    const now = Date.now();
    if (this.publicCache && now - this.publicCache.at < PUBLIC_CACHE_MS) return this.publicCache.value;
    if (!this.publicInflight) {
      const generation = this.publicGeneration;
      const build: Promise<PublicSite> = this.buildPublic()
        .then((value) => {
          if (generation === this.publicGeneration) this.publicCache = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          if (this.publicInflight === build) this.publicInflight = null;
        });
      this.publicInflight = build;
    }
    return this.publicInflight;
  }

  private async buildPublic(): Promise<PublicSite> {
    const [settings, faqRows, teamRows, stats] = await Promise.all([
      this.getSettings(),
      this.db.select().from(faqs).where(eq(faqs.visibility, 'published')).orderBy(asc(faqs.sortOrder), asc(faqs.createdAt)),
      this.db.select().from(teamMembers).where(eq(teamMembers.visibility, 'published')).orderBy(asc(teamMembers.sortOrder), asc(teamMembers.createdAt)),
      this.stats(),
    ]);
    const [team, ogImage] = await Promise.all([this.toTeam(teamRows), this.ogImage(settings.seo.ogImageAssetId)]);
    return { settings: publicSettings(settings), faqs: faqRows.map(toFaq), team, stats, ogImage };
  }

  private async ogImage(id: string | null | undefined): Promise<ImageRef | null> {
    return id ? this.refs.imageRef(id) : null;
  }

  /**
   * Numbers for the home page. A "session" is a published, non-cancelled event that has ended.
   * Talks are speaker rows on those sessions (moderators don't count as a talk), seats filled are
   * checked-in registrations on them.
   */
  async stats(now = new Date()): Promise<SiteStats> {
    const past = and(eq(events.visibility, 'published'), isNull(events.cancelledAt), lte(events.endsAt, now));
    const [[sessions], [talks], [seats], [pubs]] = await Promise.all([
      this.db
        .select({
          n: count(),
          seconds: sql<string | null>`coalesce(sum(extract(epoch from (${events.endsAt} - ${events.startsAt}))), 0)`,
          first: min(events.startsAt),
        })
        .from(events)
        .where(past),
      this.db
        .select({ n: count(), speakers: countDistinct(eventSpeakers.speakerId) })
        .from(eventSpeakers)
        .innerJoin(events, eq(events.id, eventSpeakers.eventId))
        .where(and(past, ne(eventSpeakers.role, 'moderator'))),
      this.db
        .select({ n: count() })
        .from(registrations)
        .innerJoin(events, eq(events.id, registrations.eventId))
        .where(and(past, eq(registrations.status, 'registered'), isNotNull(registrations.checkedInAt))),
      this.db.select({ n: count() }).from(publications).where(eq(publications.visibility, 'published')),
    ]);
    const first = sessions?.first ? new Date(sessions.first) : null;
    return {
      sessions: sessions?.n ?? 0,
      talks: talks?.n ?? 0,
      speakers: talks?.speakers ?? 0,
      seatsFilled: seats?.n ?? 0,
      publications: pubs?.n ?? 0,
      hoursOfTalk: Math.round(Number(sessions?.seconds ?? 0) / 3600),
      firstEventAt: first ? first.toISOString() : null,
    };
  }

  /** Drop the public cache and tell the web. Called after every site change (and the content reset). */
  changed(extraTags: string[] = []): void {
    this.invalidatePublicCache();
    void this.revalidate.revalidate([tags.site, ...extraTags]);
  }

  /** For callers that need a fresh payload right away (tests, the seeder summary). */
  invalidatePublicCache(): void {
    this.publicGeneration++;
    this.publicCache = null;
    this.publicInflight = null;
  }

  /** Used by the contact flow: who gets the organizer notification. */
  async contactRecipients(): Promise<{ notify: string[]; contact: SiteSettings['contact']; email: SiteSettings['email'] }> {
    const [contact, email] = await Promise.all([this.getSetting('contact'), this.getSetting('email')]);
    const notify = contact.notifyEmails.length ? contact.notifyEmails : contact.email.includes('@') ? [contact.email] : [];
    return { notify, contact, email };
  }

  /** Next upcoming published event, for the auto-reply ("see you on Friday ..."). */
  async nextPublicEvent(
    now = new Date(),
  ): Promise<{ title: string; number: number | null; slug: string; startsAt: Date; endsAt: Date; venue: string | null; mode: EventMode } | null> {
    const [row] = await this.db
      .select({ title: events.title, number: events.number, slug: events.slug, startsAt: events.startsAt, endsAt: events.endsAt, venue: venues.name, mode: events.mode })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(and(eq(events.visibility, 'published'), isNull(events.cancelledAt), gt(events.startsAt, now)))
      .orderBy(asc(events.startsAt))
      .limit(1);
    return row ?? null;
  }
}

function short(s: string, n = 60): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
}

