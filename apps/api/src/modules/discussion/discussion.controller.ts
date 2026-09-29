import { randomUUID } from 'node:crypto';
import { Controller, Delete, Get, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import sharp from 'sharp';
import { Public, CurrentPrincipal, RequireCapability } from '../../auth/decorators.js';
import { Ip } from '../../common/request.js';
import { badRequest, payloadTooLarge, unsupportedMedia } from '../../common/errors.js';
import { ZodBody, ZodQuery, UuidParam } from '../../common/zod.pipe.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { AppConfig } from '../../config/app-config.js';
import { StorageService } from '../storage/storage.service.js';
import type { Principal } from '@zemi/shared';
import { DiscussionService, DISCUSSION_COOKIE, DISCUSSION_COOKIE_AGE } from './discussion.service.js';

const challenge = z.string().max(2048).optional();
const name = z.string().trim().min(2).max(40).regex(/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u, 'Use letters, numbers, spaces, apostrophes or periods.');
const tags = z.array(z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N} -]+$/u)).max(5).default([]);
const body = z.array(z.record(z.string(), z.unknown())).min(1).max(150);
const postInput = z.object({ title: z.string().trim().min(8).max(180), body, tags, eventId: z.uuid().nullable().optional(), challenge });
const listInput = z.object({
  search: z.string().trim().max(100).optional(), eventId: z.union([z.uuid(), z.literal('general')]).optional(),
  tag: z.string().max(24).optional(), sort: z.enum(['hot', 'new', 'top']).default('hot'),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(15),
});
const targetInput = z.object({ type: z.enum(['thread', 'comment']), id: z.uuid() });
const voteInput = targetInput.extend({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });
const reactInput = targetInput.extend({ kind: z.enum(['curious', 'insightful', 'thanks']) });
const reportInput = targetInput.extend({ reason: z.enum(['spam', 'harassment', 'unsafe', 'off-topic', 'other']), note: z.string().trim().max(500).optional(), challenge });
const commentInput = z.object({ body: z.string().trim().min(2).max(5000), parentId: z.uuid().optional(), challenge });
const adminList = z.object({ status: z.enum(['all', 'open', 'locked', 'archived', 'hidden', 'deleted']).default('all'), search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
const adminIdentityList = z.object({ status: z.enum(['all', 'active', 'suspended']).default('all'), search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
const adminPatch = z.object({ status: z.enum(['open', 'locked', 'archived', 'hidden', 'deleted']).optional(), pinned: z.boolean().optional(), flagged: z.boolean().optional(), tags: tags.optional() }).refine(v => Object.keys(v).length > 0);
const cookie = (req: Request) => (req.cookies as Record<string, string> | undefined)?.[DISCUSSION_COOKIE];

@ApiTags('public: discussion')
@Public()
@Controller('public/discussion')
export class DiscussionPublicController {
  constructor(private readonly discussion: DiscussionService, private readonly storage: StorageService, private readonly rate: RateLimitService, private readonly config: AppConfig) {}

  @Get('me')
  async me(@Req() req: Request) {
    const row = await this.discussion.identity(cookie(req));
    return row ? this.discussion.identityDto(row) : null;
  }
  @Post('identity')
  async join(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Ip() ip: string | null, @ZodBody(z.object({ name, challenge })) data: { name: string; challenge?: string }) {
    const result = await this.discussion.join(data.name, cookie(req), ip, data.challenge);
    res.cookie(DISCUSSION_COOKIE, result.token, { httpOnly: true, secure: this.config.isProduction, sameSite: 'lax', path: '/', maxAge: DISCUSSION_COOKIE_AGE });
    return result.identity;
  }
  @Patch('identity')
  async rename(@Req() req: Request, @Ip() ip: string | null, @ZodBody(z.object({ name, challenge })) data: { name: string; challenge?: string }) {
    return this.discussion.rename(await this.discussion.requireIdentity(cookie(req)), data.name, ip, data.challenge);
  }
  @Delete('identity')
  async leave(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.discussion.leave(await this.discussion.requireIdentity(cookie(req)));
    res.clearCookie(DISCUSSION_COOKIE, { httpOnly: true, secure: this.config.isProduction, sameSite: 'lax', path: '/' });
    return { ok: true };
  }
  @Get('events')
  async events(@Req() req: Request, @Query('search') search?: string) {
    await this.discussion.requireIdentity(cookie(req));
    return this.discussion.eventChoices((search ?? '').slice(0, 100));
  }
  @Get('threads')
  async list(@Req() req: Request, @ZodQuery(listInput) q: z.infer<typeof listInput>) {
    return this.discussion.list(await this.discussion.requireIdentity(cookie(req)), q);
  }
  @Post('threads')
  async create(@Req() req: Request, @Ip() ip: string | null, @ZodBody(postInput) data: z.infer<typeof postInput>) {
    return this.discussion.create(await this.discussion.requireIdentity(cookie(req)), data, ip, data.challenge);
  }
  @Get('threads/:id')
  async detail(@Req() req: Request, @UuidParam() id: string) {
    return this.discussion.detail(await this.discussion.requireIdentity(cookie(req)), id);
  }
  @Patch('threads/:id')
  async edit(@Req() req: Request, @Ip() ip: string | null, @UuidParam() id: string, @ZodBody(postInput) data: z.infer<typeof postInput>) {
    return this.discussion.edit(await this.discussion.requireIdentity(cookie(req)), id, data, ip, data.challenge);
  }
  @Delete('threads/:id')
  async remove(@Req() req: Request, @UuidParam() id: string) {
    return this.discussion.deleteOwn(await this.discussion.requireIdentity(cookie(req)), id);
  }
  @Post('threads/:id/comments')
  async comment(@Req() req: Request, @Ip() ip: string | null, @UuidParam() id: string, @ZodBody(commentInput) data: z.infer<typeof commentInput>) {
    return this.discussion.comment(await this.discussion.requireIdentity(cookie(req)), id, data.body, data.parentId, ip, data.challenge);
  }
  @Delete('comments/:id')
  async removeComment(@Req() req: Request, @UuidParam() id: string) {
    return this.discussion.deleteOwnComment(await this.discussion.requireIdentity(cookie(req)), id);
  }
  @Post('threads/:id/answer')
  async answer(@Req() req: Request, @UuidParam() id: string, @ZodBody(z.object({ commentId: z.uuid().nullable() })) data: { commentId: string | null }) {
    return this.discussion.accept(await this.discussion.requireIdentity(cookie(req)), id, data.commentId);
  }
  @Post('vote')
  async vote(@Req() req: Request, @ZodBody(voteInput) data: z.infer<typeof voteInput>) {
    return this.discussion.vote(await this.discussion.requireIdentity(cookie(req)), data.type, data.id, data.value);
  }
  @Post('react')
  async react(@Req() req: Request, @ZodBody(reactInput) data: z.infer<typeof reactInput>) {
    return this.discussion.react(await this.discussion.requireIdentity(cookie(req)), data.type, data.id, data.kind);
  }
  @Post('report')
  async report(@Req() req: Request, @Ip() ip: string | null, @ZodBody(reportInput) data: z.infer<typeof reportInput>) {
    return this.discussion.report(await this.discussion.requireIdentity(cookie(req)), data.type, data.id, data.reason, data.note, ip, data.challenge);
  }

  @Post('images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async image(@Req() req: Request, @Ip() ip: string | null, @UploadedFile() file: { buffer: Buffer; size: number; mimetype: string } | undefined) {
    const me = await this.discussion.requireIdentity(cookie(req));
    this.rate.consume(`discussion:image:${me.id}`, { limit: 12, windowMs: 3600000 });
    const challengeValue: unknown = (req.body as Record<string, unknown> | undefined)?.challenge;
    await this.discussion.verify(typeof challengeValue === 'string' ? challengeValue : undefined, 'discussion_image', ip);
    if (!file?.buffer) throw badRequest('Choose an image.');
    if (file.size > 5 * 1024 * 1024) throw payloadTooLarge('Images must be under 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype)) throw unsupportedMedia('Use a JPG, PNG, WebP or AVIF image.');
    let output: Buffer;
    try { output = await sharp(file.buffer, { limitInputPixels: 20_000_000, failOn: 'error' }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); }
    catch { throw unsupportedMedia('We could not read that image.'); }
    const key = `assets/discussion/${randomUUID()}/w1600.webp`;
    await this.storage.putBuffer(key, output, { contentType: 'image/webp' });
    return { url: `${this.config.env.PUBLIC_API_URL}/media/${key}` };
  }
}

@ApiTags('admin: discussion')
@Controller('admin/discussion')
@RequireCapability('discussion.view', 'discussion.manage')
export class DiscussionAdminController {
  constructor(private readonly discussion: DiscussionService) {}
  @Get()
  list(@ZodQuery(adminList) q: z.infer<typeof adminList>) { return this.discussion.adminThreads(q); }
  @Get('identities')
  @RequireCapability('discussion.manage')
  identities(@ZodQuery(adminIdentityList) q: z.infer<typeof adminIdentityList>) { return this.discussion.adminIdentities(q); }
  @Get(':id')
  detail(@UuidParam() id: string) { return this.discussion.adminThread(id); }
  @Patch(':id')
  @RequireCapability('discussion.manage')
  update(@UuidParam() id: string, @ZodBody(adminPatch) data: z.infer<typeof adminPatch>, @CurrentPrincipal() principal: Principal, @Ip() ip: string | null) { return this.discussion.adminUpdateThread(id, data, principal, ip); }
  @Patch('comments/:id')
  @RequireCapability('discussion.manage')
  comment(@UuidParam() id: string, @ZodBody(z.object({ status: z.enum(['visible', 'hidden', 'deleted']) })) data: { status: 'visible' | 'hidden' | 'deleted' }, @CurrentPrincipal() principal: Principal, @Ip() ip: string | null) { return this.discussion.adminUpdateComment(id, data.status, principal, ip); }
  @Patch('reports/:id')
  @RequireCapability('discussion.manage')
  report(@UuidParam() id: string, @ZodBody(z.object({ status: z.enum(['resolved', 'dismissed']) })) data: { status: 'resolved' | 'dismissed' }, @CurrentPrincipal() principal: Principal, @Ip() ip: string | null) { return this.discussion.adminResolveReport(id, data.status, principal, ip); }
  @Patch('identities/:id')
  @RequireCapability('discussion.manage')
  identity(@UuidParam() id: string, @ZodBody(z.object({ status: z.enum(['active', 'suspended']) })) data: { status: 'active' | 'suspended' }, @CurrentPrincipal() principal: Principal, @Ip() ip: string | null) { return this.discussion.adminSuspendIdentity(id, data.status, principal, ip); }
}
