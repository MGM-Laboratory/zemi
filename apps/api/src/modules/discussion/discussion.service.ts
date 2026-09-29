import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Blocks, Principal } from '@zemi/shared';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db } from '../../db/client.js';
import { auditLogs, discussionComments as comments, discussionIdentities as identities, discussionReactions as reactions, discussionReports as reports, discussionThreads as threads, discussionVotes as votes, events, eventSpeakers, speakers } from '../../db/schema.js';
import { blocksToPlainText } from '../../common/blocks.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../common/errors.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AssetRefsService } from '../../common/asset-refs.js';
import { searchCondition } from '../events/events.sql.js';

export const DISCUSSION_COOKIE = 'zemi_discussion';
export const DISCUSSION_COOKIE_AGE = 365 * 24 * 60 * 60 * 1000;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
type Identity = typeof identities.$inferSelect;
type Target = 'thread' | 'comment';
const label = (r: Identity) => `${r.name} #${r.tag}`;
const visible = ['open', 'locked', 'archived'] as const;

@Injectable()
export class DiscussionService {
  constructor(@Inject(DB) private readonly db: Db, private readonly config: AppConfig, private readonly rate: RateLimitService, private readonly audit: AuditService, private readonly refs: AssetRefsService) {}

  async verify(token: string | undefined, action: string, ip: string | null) {
    const secret = this.config.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      if (this.config.isProduction) throw forbidden('The human check is temporarily unavailable.');
      return;
    }
    if (!token || token.length > 2048) throw forbidden('Complete the human check first.');
    let result: { success?: boolean; hostname?: string; action?: string };
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('siteverify failed');
      result = await response.json() as typeof result;
    } catch { throw forbidden('The human check could not finish. Try again.'); }
    if (!result.success || result.action !== action || result.hostname !== new URL(this.config.env.PUBLIC_WEB_URL).hostname) {
      throw forbidden('The human check expired. Try again.');
    }
  }

  async identity(token: string | undefined): Promise<Identity | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const [row] = await this.db.select().from(identities).where(eq(identities.tokenHash, hash(token))).limit(1);
    return row?.status === 'active' ? row : null;
  }
  async requireIdentity(token: string | undefined): Promise<Identity> {
    const row = await this.identity(token);
    if (!row) throw unauthorized('Choose your name to join the discussion.');
    return row;
  }
  identityDto(row: Identity) { return { id: row.id, name: row.name, tag: row.tag, label: label(row) }; }

  async join(name: string, token: string | undefined, ip: string | null, challenge: string | undefined) {
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const [existing] = await this.db.select({ status: identities.status }).from(identities).where(eq(identities.tokenHash, hash(token))).limit(1);
      if (existing?.status === 'suspended') throw forbidden('This discussion identity is suspended.');
      if (existing) throw conflict('You already have an identity. Change its name in settings.');
    }
    this.rate.consume(`discussion:join:${ip ?? 'unknown'}`, { limit: 5, windowMs: 3600000 });
    await this.verify(challenge, 'discussion_join', ip);
    const newToken = randomBytes(32).toString('hex');
    for (let i = 0; i < 40; i++) {
      try {
        const [row] = await this.db.insert(identities).values({ name, tag: String(1000 + Math.floor(Math.random() * 9000)), tokenHash: hash(newToken) }).returning();
        return { token: newToken, identity: this.identityDto(row) };
      } catch (e) { if ((e as { code?: string }).code !== '23505') throw e; }
    }
    throw conflict('That name is busy. Try again.');
  }
  async rename(row: Identity, name: string, ip: string | null, challenge: string | undefined) {
    this.rate.consume(`discussion:rename:${row.id}`, { limit: 5, windowMs: 86400000 });
    await this.verify(challenge, 'discussion_rename', ip);
    for (let i = 0; i < 40; i++) {
      try {
        const [updated] = await this.db.update(identities).set({ name, tag: String(1000 + Math.floor(Math.random() * 9000)), updatedAt: new Date() }).where(eq(identities.id, row.id)).returning();
        return this.identityDto(updated);
      } catch (e) { if ((e as { code?: string }).code !== '23505') throw e; }
    }
    throw conflict('That name is busy. Try again.');
  }
  async leave(row: Identity) {
    await this.db.transaction(async tx => {
      const myVotes = await tx.select().from(votes).where(eq(votes.identityId, row.id));
      for (const vote of myVotes) {
        if (vote.targetType === 'thread') await tx.update(threads).set({ score: sql`${threads.score} - ${vote.value}` }).where(eq(threads.id, vote.targetId));
        else await tx.update(comments).set({ score: sql`${comments.score} - ${vote.value}` }).where(eq(comments.id, vote.targetId));
      }
      await tx.update(threads).set({ authorId: null, authorLabel: 'Former participant' }).where(eq(threads.authorId, row.id));
      await tx.update(comments).set({ authorId: null, authorLabel: 'Former participant' }).where(eq(comments.authorId, row.id));
      await tx.update(auditLogs).set({ actorId: null, actorName: 'Former participant' }).where(and(eq(auditLogs.actorType, 'public'), eq(auditLogs.actorId, row.id)));
      await tx.delete(identities).where(eq(identities.id, row.id));
    });
  }

  async eventChoices(search = '') {
    const rows = await this.db.select({ id: events.id, slug: events.slug, title: events.title, number: events.number, summary: events.summary, startsAt: events.startsAt, endsAt: events.endsAt, coverAssetId: events.coverAssetId }).from(events).where(and(eq(events.visibility, 'published'), sql`${events.cancelledAt} is null`, searchCondition(search, 'public'))).orderBy(sql`case when ${events.endsAt} > now() then 0 else 1 end`, sql`case when ${events.endsAt} > now() then ${events.startsAt} end asc nulls last`, desc(events.startsAt)).limit(60);
    const [covers, speakerRows] = await Promise.all([
      this.refs.imageRefs(rows.map(r => r.coverAssetId)),
      rows.length ? this.db.select({ eventId: eventSpeakers.eventId, name: speakers.fullName }).from(eventSpeakers).innerJoin(speakers, eq(speakers.id, eventSpeakers.speakerId)).where(and(inArray(eventSpeakers.eventId, rows.map(r => r.id)), sql`${speakers.visibility} <> 'draft'`)).orderBy(asc(eventSpeakers.sortOrder)) : Promise.resolve([]),
    ]);
    const names = new Map<string, string[]>();
    for (const row of speakerRows) names.set(row.eventId, [...(names.get(row.eventId) ?? []), row.name]);
    const now = new Date();
    const featuredId = rows.find(r => r.endsAt > now)?.id;
    return rows.map(r => ({ id: r.id, slug: r.slug, title: r.title, number: r.number, summary: r.summary, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), cover: covers.get(r.coverAssetId ?? '') ?? null, speakers: (names.get(r.id) ?? []).slice(0, 2), featured: r.id === featuredId, current: r.startsAt <= now && r.endsAt > now }));
  }
  private async thread(id: string) {
    const [row] = await this.db.select().from(threads).where(and(eq(threads.id, id), inArray(threads.status, [...visible]))).limit(1);
    if (!row) throw notFound('That discussion is no longer available.');
    return row;
  }
  private async enrich(rows: Array<typeof threads.$inferSelect>, me: string, nextId: string | null) {
    if (!rows.length) return [];
    const eventIds = [...new Set(rows.map(r => r.eventId).filter((v): v is string => !!v))];
    const [eventRows, mineVotes, mineReactions] = await Promise.all([
      eventIds.length ? this.db.select({ id: events.id, slug: events.slug, number: events.number, title: events.title, summary: events.summary, startsAt: events.startsAt, endsAt: events.endsAt, accent: events.accent, coverAssetId: events.coverAssetId }).from(events).where(and(inArray(events.id, eventIds), eq(events.visibility, 'published'))) : Promise.resolve([]),
      this.db.select().from(votes).where(and(eq(votes.identityId, me), eq(votes.targetType, 'thread'), inArray(votes.targetId, rows.map(r => r.id)))),
      this.db.select().from(reactions).where(and(eq(reactions.identityId, me), eq(reactions.targetType, 'thread'), inArray(reactions.targetId, rows.map(r => r.id)))),
    ]);
    const eventMap = new Map(eventRows.map(e => [e.id, e]));
    const covers = await this.refs.imageRefs(eventRows.map(e => e.coverAssetId));
    const voteMap = new Map(mineVotes.map(v => [v.targetId, v.value]));
    return rows.map(r => {
      const e = r.eventId ? eventMap.get(r.eventId) : undefined;
      return {
        id: r.id, author: r.authorLabel, authorId: r.authorId, mine: r.authorId === me,
        title: r.title, body: r.body, excerpt: r.bodyText.slice(0, 260), tags: r.tags,
        status: r.status, pinned: r.pinned, score: r.score, myVote: voteMap.get(r.id) ?? 0,
        myReactions: mineReactions.filter(x => x.targetId === r.id).map(x => x.kind),
        commentCount: r.commentCount, acceptedCommentId: r.acceptedCommentId,
        event: e ? { id: e.id, slug: e.slug, number: e.number, title: e.title, summary: e.summary, accent: e.accent, cover: covers.get(e.coverAssetId ?? '') ?? null, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), featured: e.id === nextId } : null,
        featured: !!e && e.id === nextId, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      };
    });
  }
  async list(me: Identity, q: { search?: string; eventId?: string; tag?: string; sort?: string; page: number; pageSize: number }) {
    const where = and(
      inArray(threads.status, [...visible]),
      q.eventId === 'general' ? sql`${threads.eventId} is null` : q.eventId ? eq(threads.eventId, q.eventId) : undefined,
      q.search ? or(ilike(threads.title, `%${q.search}%`), ilike(threads.bodyText, `%${q.search}%`)) : undefined,
      q.tag ? sql`${threads.tags} @> ${JSON.stringify([q.tag])}::jsonb` : undefined,
    );
    const [next] = await this.db.select({ id: events.id }).from(events).where(and(eq(events.visibility, 'published'), sql`${events.cancelledAt} is null`, sql`${events.endsAt} > now()`)).orderBy(asc(events.startsAt)).limit(1);
    const rank = sql<number>`case when ${threads.pinned} then 0 when ${threads.eventId} = ${next?.id ?? null} then 1 when ${threads.eventId} is null then 2 else 3 end`;
    const sort = q.sort === 'top' ? [asc(rank), desc(threads.score), desc(threads.createdAt)] : q.sort === 'new' ? [asc(rank), desc(threads.createdAt)] : [asc(rank), desc(sql`${threads.score} + ${threads.commentCount} * 2`), desc(threads.createdAt)];
    const [rows, totals] = await Promise.all([
      this.db.select().from(threads).where(where).orderBy(...sort).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      this.db.select({ n: count() }).from(threads).where(where),
    ]);
    return { items: await this.enrich(rows, me.id, next?.id ?? null), total: totals[0]?.n ?? 0, page: q.page, pageSize: q.pageSize };
  }
  async detail(me: Identity, id: string) {
    const row = await this.thread(id);
    const replies = await this.db.select().from(comments).where(and(eq(comments.threadId, id), inArray(comments.status, ['visible', 'deleted']))).orderBy(asc(comments.createdAt)).limit(500);
    const [next] = await this.db.select({ id: events.id }).from(events).where(and(eq(events.visibility, 'published'), sql`${events.cancelledAt} is null`, sql`${events.endsAt} > now()`)).orderBy(asc(events.startsAt)).limit(1);
    const [dto] = await this.enrich([row], me.id, next?.id ?? null);
    const myVotes = replies.length ? await this.db.select().from(votes).where(and(eq(votes.identityId, me.id), eq(votes.targetType, 'comment'), inArray(votes.targetId, replies.map(r => r.id)))) : [];
    const voteMap = new Map(myVotes.map(v => [v.targetId, v.value]));
    return { ...dto, comments: replies.map(r => ({
      id: r.id, parentId: r.parentId, author: r.status === 'deleted' ? 'Deleted' : r.authorLabel, authorId: r.authorId,
      mine: r.authorId === me.id, body: r.status === 'deleted' ? '' : r.body, status: r.status,
      score: r.score, myVote: voteMap.get(r.id) ?? 0, createdAt: r.createdAt.toISOString(),
    })) };
  }
  private async validateEvent(eventId: string | null | undefined) {
    if (!eventId) return;
    const [row] = await this.db.select({ id: events.id }).from(events).where(and(eq(events.id, eventId), eq(events.visibility, 'published'))).limit(1);
    if (!row) throw badRequest('Choose a published event, or General.');
  }
  private bodyText(body: Blocks) {
    const text = blocksToPlainText(body, 20001);
    if (text.length < 10 || text.length > 20000) throw badRequest('Write between 10 and 20,000 characters.');
    return text;
  }
  async create(me: Identity, input: { title: string; body: Blocks; tags: string[]; eventId?: string | null }, ip: string | null, challenge: string | undefined) {
    this.rate.consume(`discussion:post:${me.id}`, { limit: 5, windowMs: 3600000 });
    this.rate.consume(`discussion:post-ip:${ip ?? 'unknown'}`, { limit: 15, windowMs: 3600000 });
    await this.verify(challenge, 'discussion_post', ip);
    await this.validateEvent(input.eventId);
    const [row] = await this.db.insert(threads).values({ authorId: me.id, authorLabel: label(me), title: input.title, body: input.body, bodyText: this.bodyText(input.body), tags: input.tags, eventId: input.eventId || null }).returning();
    await this.audit.log({ principal: { kind: 'public', id: me.id, name: label(me) }, action: 'discussion.create', resourceType: 'discussion', resourceId: row.id, summary: `Posted ${input.title}`, ip });
    return { id: row.id };
  }
  async edit(me: Identity, id: string, input: { title: string; body: Blocks; tags: string[]; eventId?: string | null }, ip: string | null, challenge: string | undefined) {
    const row = await this.thread(id);
    if (row.authorId !== me.id || row.status !== 'open') throw forbidden('Only the author can edit an open question.');
    this.rate.consume(`discussion:edit:${me.id}`, { limit: 15, windowMs: 3600000 });
    await this.verify(challenge, 'discussion_post', ip);
    await this.validateEvent(input.eventId);
    await this.db.update(threads).set({ title: input.title, body: input.body, bodyText: this.bodyText(input.body), tags: input.tags, eventId: input.eventId || null, updatedAt: new Date() }).where(eq(threads.id, id));
    return { ok: true };
  }
  async deleteOwn(me: Identity, id: string) {
    const row = await this.thread(id);
    if (row.authorId !== me.id) throw forbidden('Only the author can delete this question.');
    await this.db.update(threads).set({ status: 'deleted', updatedAt: new Date() }).where(eq(threads.id, id));
    return { ok: true };
  }
  async comment(me: Identity, threadId: string, body: string, parentId: string | undefined, ip: string | null, challenge: string | undefined) {
    const row = await this.thread(threadId);
    if (row.status !== 'open') throw forbidden('This conversation is closed.');
    this.rate.consume(`discussion:comment:${me.id}`, { limit: 12, windowMs: 3600000 });
    this.rate.consume(`discussion:comment-ip:${ip ?? 'unknown'}`, { limit: 40, windowMs: 3600000 });
    await this.verify(challenge, 'discussion_comment', ip);
    if (parentId) {
      const [parent] = await this.db.select({ id: comments.id }).from(comments).where(and(eq(comments.id, parentId), eq(comments.threadId, threadId), eq(comments.status, 'visible'))).limit(1);
      if (!parent) throw badRequest('That reply is no longer available.');
    }
    const [reply] = await this.db.insert(comments).values({ threadId, parentId: parentId || null, authorId: me.id, authorLabel: label(me), body }).returning();
    await this.db.update(threads).set({ commentCount: sql`${threads.commentCount} + 1`, updatedAt: new Date() }).where(eq(threads.id, threadId));
    return { id: reply.id };
  }
  async deleteOwnComment(me: Identity, id: string) {
    const [row] = await this.db.select().from(comments).where(eq(comments.id, id)).limit(1);
    if (!row || row.authorId !== me.id) throw notFound();
    if (row.status === 'visible') {
      await this.db.update(comments).set({ status: 'deleted', body: '', updatedAt: new Date() }).where(eq(comments.id, id));
      await this.db.update(threads).set({ commentCount: sql`greatest(0, ${threads.commentCount} - 1)` }).where(eq(threads.id, row.threadId));
    }
    return { ok: true };
  }
  private async target(type: Target, id: string) {
    if (type === 'thread') return this.thread(id);
    const [row] = await this.db.select().from(comments).where(and(eq(comments.id, id), eq(comments.status, 'visible'))).limit(1);
    if (!row) throw notFound();
    await this.thread(row.threadId);
    return row;
  }
  async vote(me: Identity, type: Target, id: string, value: -1 | 0 | 1) {
    await this.target(type, id);
    this.rate.consume(`discussion:vote:${me.id}`, { limit: 90, windowMs: 3600000 });
    return this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${me.id}:${type}:${id}`}))`);
      const [old] = await tx.select().from(votes).where(and(eq(votes.identityId, me.id), eq(votes.targetType, type), eq(votes.targetId, id))).for('update').limit(1);
      const previous = old?.value ?? 0;
      if (previous === value) return { scoreDelta: 0, myVote: value };
      if (value === 0) await tx.delete(votes).where(and(eq(votes.identityId, me.id), eq(votes.targetType, type), eq(votes.targetId, id)));
      else await tx.insert(votes).values({ identityId: me.id, targetType: type, targetId: id, value }).onConflictDoUpdate({ target: [votes.identityId, votes.targetType, votes.targetId], set: { value } });
      if (type === 'thread') await tx.update(threads).set({ score: sql`${threads.score} + ${value - previous}` }).where(eq(threads.id, id));
      else await tx.update(comments).set({ score: sql`${comments.score} + ${value - previous}` }).where(eq(comments.id, id));
      return { scoreDelta: value - previous, myVote: value };
    });
  }
  async react(me: Identity, type: Target, id: string, kind: string) {
    if (!['curious', 'insightful', 'thanks'].includes(kind)) throw badRequest('Choose a reaction from the list.');
    await this.target(type, id);
    this.rate.consume(`discussion:react:${me.id}`, { limit: 60, windowMs: 3600000 });
    const where = and(eq(reactions.identityId, me.id), eq(reactions.targetType, type), eq(reactions.targetId, id), eq(reactions.kind, kind));
    const [old] = await this.db.select().from(reactions).where(where).limit(1);
    if (old) await this.db.delete(reactions).where(where);
    else await this.db.insert(reactions).values({ identityId: me.id, targetType: type, targetId: id, kind }).onConflictDoNothing();
    return { active: !old };
  }
  async report(me: Identity, type: Target, id: string, reason: string, note: string | undefined, ip: string | null, challenge: string | undefined) {
    await this.target(type, id);
    this.rate.consume(`discussion:report:${me.id}`, { limit: 8, windowMs: 86400000 });
    await this.verify(challenge, 'discussion_report', ip);
    const [old] = await this.db.select({ id: reports.id }).from(reports).where(and(eq(reports.reporterId, me.id), eq(reports.targetType, type), eq(reports.targetId, id), eq(reports.status, 'open'))).limit(1);
    if (old) throw conflict('You already reported this. A moderator will review it.');
    await this.db.insert(reports).values({ reporterId: me.id, targetType: type, targetId: id, reason, note });
    if (type === 'thread') await this.db.update(threads).set({ reportCount: sql`${threads.reportCount} + 1` }).where(eq(threads.id, id));
    else await this.db.update(comments).set({ reportCount: sql`${comments.reportCount} + 1` }).where(eq(comments.id, id));
    return { ok: true };
  }
  async accept(me: Identity, threadId: string, commentId: string | null) {
    const row = await this.thread(threadId);
    if (row.authorId !== me.id) throw forbidden('Only the author can mark a helpful answer.');
    if (commentId) {
      const [reply] = await this.db.select({ id: comments.id }).from(comments).where(and(eq(comments.id, commentId), eq(comments.threadId, threadId), eq(comments.status, 'visible'))).limit(1);
      if (!reply) throw badRequest('Choose a visible reply.');
    }
    await this.db.update(threads).set({ acceptedCommentId: commentId, updatedAt: new Date() }).where(eq(threads.id, threadId));
    return { ok: true };
  }
  async adminThreads(q: { status?: string; search?: string; page: number; pageSize: number }) {
    const where = and(q.status && q.status !== 'all' ? eq(threads.status, q.status as typeof threads.$inferSelect.status) : undefined, q.search ? or(ilike(threads.title, `%${q.search}%`), ilike(threads.authorLabel, `%${q.search}%`)) : undefined);
    const [rows, totals] = await Promise.all([this.db.select().from(threads).where(where).orderBy(desc(threads.flagged), desc(threads.reportCount), desc(threads.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize), this.db.select({ n: count() }).from(threads).where(where)]);
    return { items: rows, total: totals[0]?.n ?? 0, page: q.page, pageSize: q.pageSize };
  }
  async adminIdentities(q: { status?: 'all' | 'active' | 'suspended'; search?: string; page: number; pageSize: number }) {
    const where = and(q.status && q.status !== 'all' ? eq(identities.status, q.status) : undefined, q.search ? ilike(identities.name, `%${q.search}%`) : undefined);
    const [rows, totals] = await Promise.all([
      this.db.select({ id: identities.id, name: identities.name, tag: identities.tag, status: identities.status, createdAt: identities.createdAt }).from(identities).where(where).orderBy(desc(identities.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      this.db.select({ n: count() }).from(identities).where(where),
    ]);
    return { items: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })), total: totals[0]?.n ?? 0, page: q.page, pageSize: q.pageSize };
  }
  async adminThread(id: string) {
    const [thread] = await this.db.select().from(threads).where(eq(threads.id, id)).limit(1);
    if (!thread) throw notFound();
    const replies = await this.db.select().from(comments).where(eq(comments.threadId, id)).orderBy(asc(comments.createdAt));
    const allReports = await this.db.select().from(reports).where(or(and(eq(reports.targetType, 'thread'), eq(reports.targetId, id)), replies.length ? and(eq(reports.targetType, 'comment'), inArray(reports.targetId, replies.map(c => c.id))) : sql`false`)).orderBy(desc(reports.createdAt));
    return { thread, comments: replies, reports: allReports };
  }
  async adminUpdateThread(id: string, patch: { status?: 'open' | 'locked' | 'archived' | 'hidden' | 'deleted'; pinned?: boolean; flagged?: boolean; tags?: string[] }, principal: Principal, ip: string | null) {
    const [row] = await this.db.update(threads).set({ ...patch, updatedAt: new Date() }).where(eq(threads.id, id)).returning();
    if (!row) throw notFound();
    await this.audit.log({ principal, action: 'discussion.moderate', resourceType: 'discussion', resourceId: id, summary: `Moderated ${row.title}`, meta: patch, ip });
    return row;
  }
  async adminUpdateComment(id: string, status: 'visible' | 'hidden' | 'deleted', principal: Principal, ip: string | null) {
    const row = await this.db.transaction(async tx => {
      const [old] = await tx.select().from(comments).where(eq(comments.id, id)).for('update').limit(1);
      if (!old) throw notFound();
      const [updated] = await tx.update(comments).set({ status, updatedAt: new Date() }).where(eq(comments.id, id)).returning();
      const delta = Number(status === 'visible') - Number(old.status === 'visible');
      if (delta) await tx.update(threads).set({ commentCount: sql`greatest(0, ${threads.commentCount} + ${delta})`, acceptedCommentId: old.status === 'visible' && status !== 'visible' ? sql`case when ${threads.acceptedCommentId} = ${id}::uuid then null else ${threads.acceptedCommentId} end` : threads.acceptedCommentId }).where(eq(threads.id, old.threadId));
      return updated;
    });
    await this.audit.log({ principal, action: 'discussion.comment.moderate', resourceType: 'discussion-comment', resourceId: id, summary: `Set reply to ${status}`, ip });
    return row;
  }
  async adminResolveReport(id: string, status: 'resolved' | 'dismissed', principal: Principal, ip: string | null) {
    const row = await this.db.transaction(async tx => {
      const [old] = await tx.select().from(reports).where(eq(reports.id, id)).for('update').limit(1);
      if (!old) throw notFound();
      const [updated] = await tx.update(reports).set({ status, resolvedAt: new Date(), resolvedBy: principal.id }).where(eq(reports.id, id)).returning();
      if (old.status === 'open') {
        if (old.targetType === 'thread') await tx.update(threads).set({ reportCount: sql`greatest(0, ${threads.reportCount} - 1)` }).where(eq(threads.id, old.targetId));
        else await tx.update(comments).set({ reportCount: sql`greatest(0, ${comments.reportCount} - 1)` }).where(eq(comments.id, old.targetId));
      }
      return updated;
    });
    await this.audit.log({ principal, action: 'discussion.report.resolve', resourceType: 'discussion-report', resourceId: id, summary: `Marked report ${status}`, ip });
    return row;
  }
  async adminSuspendIdentity(id: string, status: 'active' | 'suspended', principal: Principal, ip: string | null) {
    const [row] = await this.db.update(identities).set({ status, updatedAt: new Date() }).where(eq(identities.id, id)).returning();
    if (!row) throw notFound();
    await this.audit.log({ principal, action: 'discussion.identity.moderate', resourceType: 'discussion-identity', resourceId: id, summary: `Set participant ${label(row)} to ${status}`, ip });
    return this.identityDto(row);
  }
}
