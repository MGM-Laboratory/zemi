import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_ACTIONS,
  type Ability,
  makeCitationKey,
  slugify,
  type ContentAction,
  type DoiLookupResult,
  type ImageRef,
  type Paginated,
  type PublicationAdmin,
  type PublicationAdminRow,
  type PublicationAuthor,
  type PublicationAuthorInput,
  type PublicationCard,
  type PublicationCreateInput,
  type PublicationDeleteResult,
  type PublicationDetail,
  type PublicationLookupItem,
  type PublicationStatus,
  type PublicationType,
  type publicationListQuery,
  type publicationQuickInput,
  type publicationUpdateInput,
} from '@zemi/shared';
import { and, asc, count, desc, eq, ilike, inArray, like, ne, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { assertCan, visibleIds } from '../../auth/permissions.service.js';
import { PermissionsService } from '../../auth/permissions.service.js';
import { AssetRefsService } from '../../common/asset-refs.js';
import { ensureFound, forbidden, notFound, unprocessable, validationError } from '../../common/errors.js';
import { likeEscape, pageToLimitOffset, paginated, searchPattern } from '../../common/pagination.js';
import { SlugService } from '../../common/slug.service.js';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import { eventPublications, events, publicationAuthors, publications, speakers } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';
import { assertAssets, blankToNull, dropUnchanged, has, isUniqueViolation, iso, slugTaken, type ContentCtx } from '../speakers/content.util.js';
import { SpeakersService, toSpeakerRef, type SpeakerRow } from '../speakers/speakers.service.js';
import { fetchCrossrefWork, mapCrossrefWork, parseDoiInput } from './crossref.js';

export type PublicationRow = typeof publications.$inferSelect;
type AuthorRow = typeof publicationAuthors.$inferSelect;
type ListQuery = z.infer<typeof publicationListQuery>;
type UpdateInput = Partial<z.infer<typeof publicationUpdateInput>>;
type QuickInput = z.infer<typeof publicationQuickInput>;

/** Author row + its speaker (if any), as loaded for cards and details. */
interface LoadedAuthor {
  a: AuthorRow;
  s: SpeakerRow | null;
}

const LOOKUP_LIMIT = 20;

/** Plain words for the audit log. */
const TYPE_WORD: Partial<Record<PublicationType, string>> = { 'journal-article': 'paper', 'conference-paper': 'paper', thesis: 'thesis' };

/** Lowercase, accent-free, single-spaced: for matching Crossref names against the speaker directory. */
function nameKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Avatar of an author: the speaker's photo when linked, else the manual author's own photo. */
function authorAvatarId(x: LoadedAuthor): string | null {
  return x.s?.avatarAssetId ?? x.a.avatarAssetId ?? null;
}

function authorInput(x: LoadedAuthor): PublicationAuthorInput {
  if (x.a.speakerId) return { speakerId: x.a.speakerId, organization: x.a.organization ?? null, isCorresponding: x.a.isCorresponding };
  return {
    speakerId: null,
    fullName: x.a.fullName ?? 'Unnamed author',
    avatarAssetId: x.a.avatarAssetId ?? null,
    organization: x.a.organization ?? null,
    url: x.a.url ?? null,
    isCorresponding: x.a.isCorresponding,
  };
}

function lookupItem(r: PublicationRow): PublicationLookupItem {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type as PublicationType,
    publishedYear: r.publishedYear ?? null,
    containerTitle: r.containerTitle ?? null,
    visibility: r.visibility,
  };
}

@Injectable()
export class PublicationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refs: AssetRefsService,
    private readonly slugs: SlugService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
    private readonly speakers: SpeakersService,
  ) {}

  /* ------------------------------------------------------------------ loading + mapping */

  private async load(id: string, db: DbOrTx = this.db): Promise<PublicationRow> {
    const [row] = await db.select().from(publications).where(eq(publications.id, id)).limit(1);
    return ensureFound(row, "We couldn't find that publication.");
  }

  private async loadAuthors(pubIds: string[], db: DbOrTx = this.db): Promise<Map<string, LoadedAuthor[]>> {
    const out = new Map<string, LoadedAuthor[]>();
    if (!pubIds.length) return out;
    const rows = await db
      .select({ a: publicationAuthors, s: speakers })
      .from(publicationAuthors)
      .leftJoin(speakers, eq(speakers.id, publicationAuthors.speakerId))
      .where(inArray(publicationAuthors.publicationId, pubIds))
      .orderBy(asc(publicationAuthors.publicationId), asc(publicationAuthors.sortOrder), asc(publicationAuthors.id));
    for (const r of rows) {
      const list = out.get(r.a.publicationId) ?? [];
      list.push(r);
      out.set(r.a.publicationId, list);
    }
    return out;
  }

  private toAuthor(x: LoadedAuthor, avatars: Map<string, ImageRef>, publicOnly: boolean): PublicationAuthor {
    // A draft speaker has no public page: keep the name and photo, drop the link.
    const linked = x.s && (!publicOnly || x.s.visibility !== 'draft') ? x.s : null;
    return {
      id: x.a.id,
      speaker: linked ? toSpeakerRef(linked, avatars) : null,
      fullName: x.s?.fullName ?? x.a.fullName ?? 'Unnamed author',
      avatar: avatars.get(authorAvatarId(x) ?? '') ?? null,
      organization: x.a.organization ?? x.s?.defaultOrganization ?? null,
      url: x.s ? null : (x.a.url ?? null),
      isCorresponding: x.a.isCorresponding,
    };
  }



  /** Cards for rows (in the given order). Batch: 3 queries regardless of how many rows. */
  private async buildCards(rows: PublicationRow[], publicOnly: boolean, db: DbOrTx = this.db) {
    const authors = await this.loadAuthors(rows.map((r) => r.id), db);
    const allAuthors = [...authors.values()].flat();
    const [images, files] = await Promise.all([
      this.refs.imageRefs([...rows.map((r) => r.coverAssetId), ...allAuthors.map(authorAvatarId)], db),
      this.refs.fileRefs(rows.map((r) => r.pdfAssetId), db),
    ]);
    const cards = rows.map((r): PublicationCard => {
      const list = (authors.get(r.id) ?? []).map((x) => this.toAuthor(x, images, publicOnly));
      return {
        id: r.id,
        slug: r.slug,
        type: r.type as PublicationType,
        title: r.title,
        subtitle: r.subtitle ?? null,
        containerTitle: r.containerTitle ?? null,
        publishedYear: r.publishedYear ?? null,
        status: r.status as PublicationStatus,
        cover: images.get(r.coverAssetId ?? '') ?? null,
        authors: list.map((a) => ({ fullName: a.fullName, avatar: a.avatar, speakerSlug: a.speaker?.slug ?? null })),
        keywords: r.keywords ?? [],
        doi: r.doi ?? null,
        hasPdf: files.has(r.pdfAssetId ?? ''),
      };
    });
    return { cards, authors, images, files };
  }

  /**
   * PublicationCard for many ids (in input order; missing ids are skipped). `publicOnly` keeps
   * published + unlisted publications and unlinks draft speakers. For event pages.
   */
  async cardsByIds(ids: string[], opts: { publicOnly?: boolean } = {}, db: DbOrTx = this.db): Promise<Map<string, PublicationCard>> {
    const list = [...new Set(ids.filter(Boolean))];
    if (!list.length) return new Map();
    const rows = await db
      .select()
      .from(publications)
      .where(and(inArray(publications.id, list), opts.publicOnly ? ne(publications.visibility, 'draft') : undefined));
    const { cards } = await this.buildCards(rows, !!opts.publicOnly, db);
    return new Map(cards.map((c) => [c.id, c]));
  }

  /** `ability` (admin views): draft and unlisted events only show when the caller can view them. */
  private async toDetail(row: PublicationRow, publicOnly: boolean, ability?: Ability): Promise<{ detail: PublicationDetail; loaded: LoadedAuthor[] }> {
    const { cards, authors, images, files } = await this.buildCards([row], publicOnly);
    const loaded = authors.get(row.id) ?? [];
    const evRows = await this.db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        number: events.number,
        startsAt: events.startsAt,
        coverAssetId: events.coverAssetId,
        visibility: events.visibility,
      })
      .from(eventPublications)
      .innerJoin(events, eq(events.id, eventPublications.eventId))
      .where(and(eq(eventPublications.publicationId, row.id), publicOnly ? eq(events.visibility, 'published') : undefined))
      .orderBy(desc(events.startsAt));
    const evVisible = evRows.filter((e) => !ability || e.visibility === 'published' || ability.can('event', e.id, 'view'));
    const covers = await this.refs.imageRefs(evVisible.map((e) => e.coverAssetId));
    const detail: PublicationDetail = {
      ...cards[0],
      abstract: row.abstract ?? null,
      body: row.body ?? [],
      volume: row.volume ?? null,
      issue: row.issue ?? null,
      pages: row.pages ?? null,
      publisher: row.publisher ?? null,
      publishedMonth: row.publishedMonth ?? null,
      publishedDay: row.publishedDay ?? null,
      isbn: row.isbn ?? null,
      issn: row.issn ?? null,
      arxivId: row.arxivId ?? null,
      url: row.url ?? null,
      links: row.links ?? [],
      language: row.language ?? null,
      license: row.license ?? null,
      citationKey: row.citationKey ?? null,
      pdf: files.get(row.pdfAssetId ?? '') ?? null,
      authorsFull: loaded.map((x) => this.toAuthor(x, images, publicOnly)),
      events: evVisible.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        number: e.number ?? null,
        startsAt: iso(e.startsAt),
        cover: covers.get(e.coverAssetId ?? '') ?? null,
      })),
      updatedAt: iso(row.updatedAt),
    };
    return { detail, loaded };
  }

  private async toAdmin(row: PublicationRow, permissions: ContentAction[], ability: Ability): Promise<PublicationAdmin> {
    const { detail, loaded } = await this.toDetail(row, false, ability);
    return {
      ...detail,
      visibility: row.visibility,
      coverAssetId: row.coverAssetId ?? null,
      pdfAssetId: row.pdfAssetId ?? null,
      authorInputs: loaded.map(authorInput),
      createdAt: iso(row.createdAt),
      permissions,
    };
  }



  /* ------------------------------------------------------------------ filters */

  private searchWhere(search: string | undefined): SQL | undefined {
    const p = searchPattern(search);
    if (!p) return undefined;
    return or(
      ilike(publications.title, p),
      ilike(publications.subtitle, p),
      ilike(publications.abstract, p),
      ilike(publications.containerTitle, p),
      ilike(publications.doi, p),
      sql`array_to_string(${publications.keywords}, ' ') ilike ${p}`,
      sql`exists (select 1 from ${publicationAuthors} left join ${speakers} on ${speakers.id} = ${publicationAuthors.speakerId}
        where ${publicationAuthors.publicationId} = ${publications.id}
        and (${publicationAuthors.fullName} ilike ${p} or ${speakers.fullName} ilike ${p} or ${speakers.nickname} ilike ${p}))`,
    );
  }

  private filters(q: ListQuery, publicOnly = false): SQL | undefined {
    const tag = q.tag?.trim();
    const speaker = q.speaker?.trim();
    return and(
      q.type ? eq(publications.type, q.type) : undefined,
      q.year ? eq(publications.publishedYear, q.year) : undefined,
      tag ? sql`exists (select 1 from unnest(${publications.keywords}) as k(word) where lower(k.word) = lower(${tag}))` : undefined,
      speaker
        ? sql`exists (select 1 from ${publicationAuthors} inner join ${speakers} on ${speakers.id} = ${publicationAuthors.speakerId}
            where ${publicationAuthors.publicationId} = ${publications.id}
            and (${speakers.slug} = ${speaker} or ${speakers.id}::text = ${speaker})
            ${publicOnly ? sql`and ${speakers.visibility} <> 'draft'` : sql``})`
        : undefined,
      this.searchWhere(q.search),
    );
  }

  private order(sort: ListQuery['sort']): SQL[] {
    if (sort === 'title') return [asc(sql`lower(${publications.title})`), asc(publications.id)];
    if (sort === 'recent') return [desc(publications.createdAt), asc(publications.id)];
    return [
      sql`${publications.publishedYear} desc nulls last`,
      sql`${publications.publishedMonth} desc nulls last`,
      sql`${publications.publishedDay} desc nulls last`,
      asc(sql`lower(${publications.title})`),
    ];
  }

  /* ------------------------------------------------------------------ validation helpers */

  /** Speaker ids exist, no duplicates, avatar/cover/pdf assets are the right kind. */
  private async validateRefs(
    input: { coverAssetId?: string | null; pdfAssetId?: string | null; authors?: PublicationAuthorInput[] },
    db: DbOrTx = this.db,
  ): Promise<void> {
    const authors = input.authors ?? [];
    const speakerIds = authors.map((a) => a.speakerId).filter((x): x is string => !!x);
    const issues: Array<{ path: Array<string | number>; message: string; code: 'custom' }> = [];
    if (speakerIds.length) {
      const found = await db.select({ id: speakers.id }).from(speakers).where(inArray(speakers.id, [...new Set(speakerIds)]));
      const ok = new Set(found.map((r) => r.id));
      const seen = new Set<string>();
      authors.forEach((a, i) => {
        if (!a.speakerId) return;
        if (!ok.has(a.speakerId)) issues.push({ path: ['authors', i, 'speakerId'], message: 'That speaker is gone. Pick them again?', code: 'custom' });
        else if (seen.has(a.speakerId)) issues.push({ path: ['authors', i, 'speakerId'], message: 'This person is already on the author list.', code: 'custom' });
        seen.add(a.speakerId);
      });
    }
    if (issues.length) throw validationError(issues[0].message, issues);
    await assertAssets(db, [
      { id: input.coverAssetId, path: ['coverAssetId'], kinds: ['image'], label: 'cover' },
      { id: input.pdfAssetId, path: ['pdfAssetId'], kinds: ['document'], label: 'paper file' },
      ...authors.map((a, i) => ({
        id: a.speakerId ? null : ((a as { avatarAssetId?: string | null }).avatarAssetId ?? null),
        path: ['authors', i, 'avatarAssetId'],
        kinds: ['image' as const],
        label: 'author photo',
      })),
    ]);
  }

  private static authorValues(publicationId: string, authors: PublicationAuthorInput[]): Array<typeof publicationAuthors.$inferInsert> {
    return authors.map((a, i) => {
      if (a.speakerId) {
        return {
          publicationId,
          sortOrder: i,
          speakerId: a.speakerId,
          fullName: null,
          avatarAssetId: null,
          organization: blankToNull(a.organization),
          url: null,
          isCorresponding: !!a.isCorresponding,
        };
      }
      const m = a as Extract<PublicationAuthorInput, { fullName: string }>;
      return {
        publicationId,
        sortOrder: i,
        speakerId: null,
        fullName: m.fullName.trim(),
        avatarAssetId: m.avatarAssetId ?? null,
        organization: blankToNull(m.organization),
        url: blankToNull(m.url),
        isCorresponding: !!m.isCorresponding,
      };
    });
  }

  /** Names in order (speaker names looked up), for citation keys. */
  private async authorNames(authors: PublicationAuthorInput[], db: DbOrTx = this.db): Promise<string[]> {
    const ids = authors.map((a) => a.speakerId).filter((x): x is string => !!x);
    const names = ids.length
      ? new Map((await db.select({ id: speakers.id, fullName: speakers.fullName }).from(speakers).where(inArray(speakers.id, ids))).map((r) => [r.id, r.fullName]))
      : new Map<string, string>();
    return authors
      .map((a) => (a.speakerId ? names.get(a.speakerId) : (a as { fullName?: string }).fullName) ?? '')
      .filter(Boolean);
  }

  /** "lecun2015deep", then "lecun2015deepb", "lecun2015deepc"... when taken by another publication. */
  private async uniqueCitationKey(base: string, excludeId: string | null, db: DbOrTx = this.db): Promise<string> {
    const root = base || 'zemi';
    const rows = await db
      .select({ key: publications.citationKey })
      .from(publications)
      .where(and(like(publications.citationKey, `${likeEscape(root)}%`), excludeId ? ne(publications.id, excludeId) : undefined));
    const used = new Set(rows.map((r) => r.key));
    if (!used.has(root)) return root;
    for (const c of 'bcdefghijklmnopqrstuvwxyz') if (!used.has(`${root}${c}`)) return `${root}${c}`;
    for (let n = 2; n < 1000; n++) if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
    return `${root}-${Date.now().toString(36)}`;
  }

  /** Tags for pages that show this publication. */
  private async relatedTags(id: string, extraSpeakerIds: string[] = [], db: DbOrTx = this.db): Promise<string[]> {
    const [evs, auth] = await Promise.all([
      db.select({ id: eventPublications.eventId }).from(eventPublications).where(eq(eventPublications.publicationId, id)),
      db
        .selectDistinct({ id: publicationAuthors.speakerId })
        .from(publicationAuthors)
        .where(and(eq(publicationAuthors.publicationId, id), sql`${publicationAuthors.speakerId} is not null`)),
    ]);
    const speakerIds = [...new Set([...auth.map((a) => a.id).filter((x): x is string => !!x), ...extraSpeakerIds])];
    return [
      tags.publications,
      tags.publication(id),
      ...(evs.length ? [tags.events, ...evs.map((e) => tags.event(e.id))] : []),
      ...(speakerIds.length ? [tags.speakers, ...speakerIds.map((s) => tags.speaker(s))] : []),
    ];
  }

  /* ------------------------------------------------------------------ admin */

  async list(q: ListQuery, ability: ContentCtx['ability']): Promise<Paginated<PublicationAdminRow>> {
    const ids = visibleIds(ability, 'publication');
    const where = and(
      ids === 'all' ? undefined : ids.length ? inArray(publications.id, ids) : sql`false`,
      q.visibility ? eq(publications.visibility, q.visibility) : undefined,
      this.filters(q),
    );
    const { limit, offset } = pageToLimitOffset(q);
    const eventCount = sql<number>`(select count(*)::int from ${eventPublications} where ${eventPublications.publicationId} = ${publications.id})`;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ p: publications, eventCount })
        .from(publications)
        .where(where)
        .orderBy(...this.order(q.sort))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(publications).where(where),
    ]);
    const { cards } = await this.buildCards(
      rows.map((r) => r.p),
      false,
    );
    const items = cards.map(
      (c, i): PublicationAdminRow => ({
        ...c,
        visibility: rows[i].p.visibility,
        eventCount: Number(rows[i].eventCount) || 0,
        createdAt: iso(rows[i].p.createdAt),
        updatedAt: iso(rows[i].p.updatedAt),
        permissions: ability.actionsOn('publication', c.id),
      }),
    );
    return paginated(items, total, q);
  }

  /** Picker search over every publication (any admin). Title prefix matches first, then newest. */
  async lookup(q: string | undefined, limit = LOOKUP_LIMIT): Promise<PublicationLookupItem[]> {
    const term = (q ?? '').trim();
    const prefix = term ? `${likeEscape(term)}%` : null;
    const rows = await this.db
      .select()
      .from(publications)
      .where(this.searchWhere(term))
      .orderBy(
        ...(prefix ? [asc(sql`case when ${publications.title} ilike ${prefix} then 0 else 1 end`)] : []),
        sql`${publications.publishedYear} desc nulls last`,
        desc(publications.updatedAt),
      )
      .limit(Math.min(LOOKUP_LIMIT, Math.max(1, limit)));
    return rows.map(lookupItem);
  }

  async get(id: string, ability: ContentCtx['ability']): Promise<PublicationAdmin> {
    const row = await this.load(id);
    assertCan(ability, 'publication', id, 'view');
    return this.toAdmin(row, ability.actionsOn('publication', id), ability);
  }

  async create(input: PublicationCreateInput, ctx: ContentCtx): Promise<PublicationAdmin> {
    const slug = input.slug ? input.slug : await this.slugs.uniqueSlug('publication', input.title);
    if (input.slug) await this.slugs.ensureUniqueSlug('publication', slug);
    const authors = input.authors ?? [];
    await this.validateRefs({ coverAssetId: input.coverAssetId, pdfAssetId: input.pdfAssetId, authors });
    const citationKey =
      blankToNull(input.citationKey) ??
      (await this.uniqueCitationKey(makeCitationKey({ authors: await this.authorNames(authors), year: input.publishedYear, title: input.title }), null));
    let row: PublicationRow;
    try {
      row = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(publications)
          .values({
            slug,
            type: input.type,
            title: input.title.trim(),
            subtitle: blankToNull(input.subtitle),
            abstract: blankToNull(input.abstract),
            body: input.body ?? [],
            coverAssetId: input.coverAssetId ?? null,
            pdfAssetId: input.pdfAssetId ?? null,
            containerTitle: blankToNull(input.containerTitle),
            volume: blankToNull(input.volume),
            issue: blankToNull(input.issue),
            pages: blankToNull(input.pages),
            publisher: blankToNull(input.publisher),
            publishedYear: input.publishedYear ?? null,
            publishedMonth: input.publishedMonth ?? null,
            publishedDay: input.publishedDay ?? null,
            doi: blankToNull(input.doi),
            isbn: blankToNull(input.isbn),
            issn: blankToNull(input.issn),
            arxivId: blankToNull(input.arxivId),
            url: blankToNull(input.url),
            links: input.links ?? [],
            keywords: cleanKeywords(input.keywords),
            language: blankToNull(input.language),
            status: input.status ?? 'published',
            license: blankToNull(input.license),
            citationKey,
            visibility: input.visibility ?? 'published',
            createdBy: ctx.principal.name,
          })
          .returning();
        if (authors.length) await tx.insert(publicationAuthors).values(PublicationsService.authorValues(created.id, authors));
        await this.permissions.grantOwnership(ctx.principal, 'publication', created.id, tx);
        await this.audit.log(
          {
            principal: ctx.principal,
            action: 'publication.create',
            resourceType: 'publication',
            resourceId: created.id,
            summary: `Added ${TYPE_WORD[created.type as PublicationType] ?? 'publication'} "${created.title}"`,
            meta: { slug: created.slug, type: created.type, visibility: created.visibility, authors: authors.length },
            ip: ctx.ip,
          },
          tx,
        );
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) throw slugTaken(slug);
      throw err;
    }
    void this.relatedTags(row.id).then((t) => this.revalidate.revalidate(t));
    return this.toAdmin(row, [...CONTENT_ACTIONS], ctx.ability);
  }

  async update(id: string, patch: UpdateInput, ctx: ContentCtx): Promise<PublicationAdmin> {
    const current = await this.load(id);
    assertCan(ctx.ability, 'publication', id, 'edit');
    if (has(patch, 'visibility') && patch.visibility && patch.visibility !== current.visibility) {
      assertCan(ctx.ability, 'publication', id, 'publish', 'You can edit this publication, but showing or hiding it needs publish access.');
    }
    const nextSlug = has(patch, 'slug') && patch.slug ? patch.slug : current.slug;
    if (nextSlug !== current.slug) await this.slugs.ensureUniqueSlug('publication', nextSlug, id);
    const replaceAuthors = has(patch, 'authors');
    const authors = patch.authors ?? [];
    await this.validateRefs({
      coverAssetId: has(patch, 'coverAssetId') ? patch.coverAssetId : null,
      pdfAssetId: has(patch, 'pdfAssetId') ? patch.pdfAssetId : null,
      authors: replaceAuthors ? authors : [],
    });

    const set: Partial<typeof publications.$inferInsert> = {};
    if (nextSlug !== current.slug) set.slug = nextSlug;
    if (has(patch, 'type') && patch.type) set.type = patch.type;
    if (has(patch, 'title') && patch.title) set.title = patch.title.trim();
    if (has(patch, 'body')) set.body = patch.body ?? [];
    if (has(patch, 'coverAssetId')) set.coverAssetId = patch.coverAssetId ?? null;
    if (has(patch, 'pdfAssetId')) set.pdfAssetId = patch.pdfAssetId ?? null;
    for (const key of ['subtitle', 'abstract', 'containerTitle', 'volume', 'issue', 'pages', 'publisher', 'doi', 'isbn', 'issn', 'arxivId', 'url', 'language', 'license'] as const) {
      if (has(patch, key)) set[key] = blankToNull(patch[key]);
    }
    for (const key of ['publishedYear', 'publishedMonth', 'publishedDay'] as const) {
      if (has(patch, key)) set[key] = patch[key] ?? null;
    }
    if (has(patch, 'links')) set.links = patch.links ?? [];
    if (has(patch, 'keywords')) set.keywords = cleanKeywords(patch.keywords);
    if (has(patch, 'status') && patch.status) set.status = patch.status;
    if (has(patch, 'visibility') && patch.visibility) set.visibility = patch.visibility;
    // Keys stay stable once set (people cite them). Empty means "make one for me".
    const wantsKey = has(patch, 'citationKey') ? blankToNull(patch.citationKey) : current.citationKey;
    if (wantsKey) {
      if (wantsKey !== current.citationKey) set.citationKey = wantsKey;
    } else {
      const names = replaceAuthors ? await this.authorNames(authors) : (await this.loadAuthors([id]).then((m) => m.get(id) ?? [])).map((x) => x.s?.fullName ?? x.a.fullName ?? '');
      const base = makeCitationKey({ authors: names, year: set.publishedYear !== undefined ? set.publishedYear : current.publishedYear, title: set.title ?? current.title });
      set.citationKey = await this.uniqueCitationKey(base, id);
    }

    dropUnchanged(set, current);
    const fields = [...Object.keys(set), ...(replaceAuthors ? ['authors'] : [])];
    if (!fields.length) return this.toAdmin(current, ctx.ability.actionsOn('publication', id), ctx.ability);
    const oldSpeakerIds = replaceAuthors
      ? (await this.db.select({ id: publicationAuthors.speakerId }).from(publicationAuthors).where(eq(publicationAuthors.publicationId, id)))
          .map((r) => r.id)
          .filter((x): x is string => !!x)
      : [];

    let row: PublicationRow;
    try {
      row = await this.db.transaction(async (tx) => {
        // Always bump updated_at, also when only the authors changed.
        const [updated] = await tx
          .update(publications)
          .set({ ...set, updatedAt: new Date() })
          .where(eq(publications.id, id))
          .returning();
        if (replaceAuthors) {
          await tx.delete(publicationAuthors).where(eq(publicationAuthors.publicationId, id));
          if (authors.length) await tx.insert(publicationAuthors).values(PublicationsService.authorValues(id, authors));
        }
        if (set.slug) await this.slugs.recordSlugChange('publication', id, current.slug, set.slug, tx);
        await this.audit.log(
          {
            principal: ctx.principal,
            action: 'publication.update',
            resourceType: 'publication',
            resourceId: id,
            summary:
              set.title && set.title !== current.title
                ? `Renamed publication "${current.title}" to "${updated.title}"`
                : `Updated publication "${updated.title}"`,
            meta: {
              fields,
              ...(set.slug ? { slug: { from: current.slug, to: set.slug } } : {}),
              ...(set.visibility && set.visibility !== current.visibility ? { visibility: { from: current.visibility, to: set.visibility } } : {}),
            },
            ip: ctx.ip,
          },
          tx,
        );
        return updated;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) throw slugTaken(nextSlug);
      throw err;
    }
    void this.relatedTags(id, oldSpeakerIds).then((t) => this.revalidate.revalidate(t));
    return this.toAdmin(row, ctx.ability.actionsOn('publication', id), ctx.ability);
  }

  async remove(id: string, ctx: ContentCtx): Promise<PublicationDeleteResult> {
    const row = await this.load(id);
    assertCan(ctx.ability, 'publication', id, 'delete');
    const related = await this.relatedTags(id);
    const affectedEvents = await this.db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: count() }).from(eventPublications).where(eq(eventPublications.publicationId, id));
      await this.permissions.removeResourceGrants('publication', id, tx);
      await this.slugs.forgetResource('publication', id, tx);
      await tx.delete(publications).where(eq(publications.id, id));
      await this.audit.log(
        {
          principal: ctx.principal,
          action: 'publication.delete',
          resourceType: 'publication',
          resourceId: id,
          summary: `Deleted publication "${row.title}"${n ? ` (was on ${n} event${n === 1 ? '' : 's'})` : ''}`,
          meta: { slug: row.slug, affectedEvents: n },
          ip: ctx.ip,
        },
        tx,
      );
      return Number(n) || 0;
    });
    void this.revalidate.revalidate(related);
    return { ok: true, affectedEvents };
  }

  /**
   * Quick stub from a picker: `{ title, url }` becomes a draft "other" publication with a publisher
   * link, so an event can reference it right away and someone fills in the rest later.
   */
  async quick(input: QuickInput, ctx: ContentCtx): Promise<PublicationLookupItem> {
    const title = input.title.trim();
    const url = blankToNull(input.url);
    const slug = await this.slugs.uniqueSlug('publication', slugify(title));
    const citationKey = await this.uniqueCitationKey(makeCitationKey({ authors: [], year: null, title }), null);
    let row: PublicationRow;
    try {
      row = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(publications)
          .values({
            slug,
            type: 'other',
            title,
            links: url ? [{ kind: 'publisher', label: 'Link', url }] : [],
            visibility: 'draft',
            citationKey,
            createdBy: ctx.principal.name,
          })
          .returning();
        await this.permissions.grantOwnership(ctx.principal, 'publication', created.id, tx);
        await this.audit.log(
          {
            principal: ctx.principal,
            action: 'publication.quick-create',
            resourceType: 'publication',
            resourceId: created.id,
            summary: `Added a draft publication "${created.title}"`,
            meta: { slug: created.slug, url },
            ip: ctx.ip,
          },
          tx,
        );
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) throw slugTaken(slug);
      throw err;
    }
    void this.revalidate.revalidate([tags.publications, tags.publication(row.id)]);
    return lookupItem(row);
  }

  /** Crossref prefill. Needs `publications.create` or edit on at least one publication. */
  async doiLookup(rawDoi: string, ability: ContentCtx['ability']): Promise<DoiLookupResult> {
    if (!ability.has('publications.create') && !ability.canAny('publication', 'edit')) {
      throw forbidden('Looking up DOIs is for people who can add or edit publications.');
    }
    const doi = parseDoiInput(rawDoi);
    if (!doi) {
      throw unprocessable('That does not look like a DOI. They start with "10." like 10.1038/nature14539.', {
        details: { issues: [{ path: ['doi'], message: 'DOIs start with "10." like 10.1038/nature14539.', code: 'custom' }] },
      });
    }
    const result = mapCrossrefWork(await fetchCrossrefWork(doi), doi);
    // Match authors against the speaker directory (exact name, ignoring case and accents).
    if (result.authorsRaw.length) {
      const all = await this.db.select({ id: speakers.id, fullName: speakers.fullName }).from(speakers);
      const byName = new Map<string, string[]>();
      for (const s of all) byName.set(nameKey(s.fullName), [...(byName.get(nameKey(s.fullName)) ?? []), s.id]);
      const matchIds = result.authorsRaw.map((a) => {
        const ids = byName.get(nameKey(a.fullName)) ?? [];
        return ids.length === 1 ? ids[0] : null;
      });
      const refs = await this.speakers.refsByIds(matchIds);
      result.authorsRaw = result.authorsRaw.map((a, i) => ({ ...a, speaker: refs.get(matchIds[i] ?? '') ?? null }));
      result.authors = result.authorsRaw.map((a, i) => {
        const speaker = refs.get(matchIds[i] ?? '');
        if (speaker) return { speakerId: speaker.id, organization: a.organization, isCorresponding: false };
        return result.authors?.[i] ?? { speakerId: null, fullName: a.fullName, organization: a.organization, isCorresponding: false };
      });
    }
    return result;
  }

  /* ------------------------------------------------------------------ public */

  async publicList(q: ListQuery): Promise<Paginated<PublicationCard>> {
    const where = and(eq(publications.visibility, 'published'), this.filters(q, true));
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(publications)
        .where(where)
        .orderBy(...this.order(q.sort))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(publications).where(where),
    ]);
    const { cards } = await this.buildCards(rows, true);
    return paginated(cards, total, q);
  }

  /** Published or unlisted publications by slug. Old slugs answer `{ redirect }`. */
  async publicBySlug(slug: string): Promise<PublicationDetail | { redirect: string }> {
    const missing = () => notFound("We couldn't find that publication. It may have moved or been taken down.");
    const resolved = await this.slugs.resolveSlug('publication', slug);
    if (!resolved) throw missing();
    if ('redirect' in resolved) {
      const [target] = await this.db
        .select({ visibility: publications.visibility })
        .from(publications)
        .where(eq(publications.slug, resolved.redirect))
        .limit(1);
      if (!target || target.visibility === 'draft') throw missing();
      return resolved;
    }
    const row = await this.load(resolved.id).catch(() => null);
    if (!row || row.visibility === 'draft') throw missing();
    return (await this.toDetail(row, true)).detail;
  }
}

/** Trim, drop empties and case-insensitive duplicates, keep the first spelling. */
function cleanKeywords(list: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const k = raw.replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}
