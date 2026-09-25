import { rm } from 'node:fs/promises';
import { Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  adjustSchema,
  assetMetaInput,
  assetPurposeSchema,
  cropSchema,
  paginationQuery,
  recropInput,
  type Ability,
  type Asset,
  type Paginated,
  type Principal,
} from '@zemi/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentAbility, CurrentPrincipal } from '../../auth/decorators.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { Ip } from '../../common/request.js';
import { parseOrThrow, UuidParam, ZodBody, ZodQuery } from '../../common/zod.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import { dispositionFor, streamObject } from '../media-serve/media-stream.js';
import { AssetsService } from './assets.service.js';

/** The multer file shape we rely on (disk storage). */
interface UploadedDiskFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

/** A multipart text field holding JSON, e.g. crop='{"x":0,...}'. Empty means "not given". */
const jsonField = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v, ctx) => {
    if (v === undefined || v === null || v === '' || v === 'null') return undefined;
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'That should be JSON, like {"x":0,"y":0,"width":800,"height":1000}.' });
      return z.NEVER;
    }
  }, schema.optional());

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional());

export const uploadFieldsSchema = z.object({
  purpose: assetPurposeSchema,
  crop: jsonField(cropSchema),
  adjust: jsonField(adjustSchema),
  alt: optionalText(300),
  caption: optionalText(500),
  credit: optionalText(200),
});

const listQuery = paginationQuery.extend({
  purpose: assetPurposeSchema.optional(),
  kind: z.enum(['image', 'video', 'document', 'audio']).optional(),
  status: z.enum(['processing', 'ready', 'failed']).optional(),
  search: z.string().trim().max(200).optional(),
});

const mineQuery = listQuery.extend({ mine: z.stringbool().optional() });

@ApiTags('admin: assets')
@Controller('admin/assets')
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * POST /api/v1/admin/assets (multipart: file, purpose, crop?, adjust?, alt?, caption?, credit?)
   * Returns the Asset right away with status 'processing'; poll GET /admin/assets/:id.
   */
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: UploadedDiskFile | undefined,
    @Req() req: Request,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<Asset> {
    try {
      if (!file) throw badRequest('Attach a file in the "file" field.');
      const fields = parseOrThrow(uploadFieldsSchema, req.body ?? {});
      const row = await this.assets.ingestFile({
        filePath: file.path,
        filename: file.originalname,
        purpose: fields.purpose,
        createdBy: principal.id,
        crop: fields.crop ?? null,
        adjust: fields.adjust ?? null,
        alt: fields.alt ?? null,
        caption: fields.caption ?? null,
        credit: fields.credit ?? null,
      });
      await this.audit.log({
        principal,
        action: 'asset.upload',
        resourceType: 'asset',
        resourceId: row.id,
        summary: `Uploaded ${row.originalFilename}`,
        meta: { purpose: row.purpose, kind: row.kind, mime: row.mime, sizeBytes: row.sizeBytes },
        ip,
      });
      return this.assets.dto(row);
    } finally {
      if (file?.path) await rm(file.path, { force: true });
    }
  }

  /**
   * GET /api/v1/admin/assets?purpose&kind&status&search&page&pageSize
   * The whole library needs `media.library` (or superadmin). Anyone can list their own uploads with `mine=true`.
   */
  @Get()
  async list(
    @ZodQuery(mineQuery) q: z.infer<typeof mineQuery>,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
  ): Promise<Paginated<Asset>> {
    const all = ability.isSuperadmin || ability.has('media.library');
    if (!q.mine && !all) throw forbidden('Browsing the media library needs the "Browse media library" permission.');
    return this.assets.list({ ...q, createdBy: q.mine ? principal.id : undefined });
  }

  /** GET /api/v1/admin/assets/:id (any signed-in admin; used to poll processing). */
  @Get(':id')
  async get(@UuidParam() id: string): Promise<Asset> {
    return this.assets.dto(await this.assets.get(id));
  }

  /**
   * GET /api/v1/admin/assets/:id/original: the private original (EXIF and GPS intact), for the re-crop tool.
   * Same rule as re-cropping: the uploader, media librarians and the superadmin.
   */
  @Get(':id/original')
  async original(
    @UuidParam() id: string,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.assets.get(id);
    this.assets.assertCanMutate(ability, principal, row);
    await streamObject(this.storage, req, res, row.originalKey, {
      cacheControl: 'private, max-age=3600',
      contentDisposition: dispositionFor(row.originalFilename),
    });
  }

  /** PATCH /api/v1/admin/assets/:id { alt?, caption?, credit? } */
  @Patch(':id')
  async update(
    @UuidParam() id: string,
    @ZodBody(assetMetaInput) body: z.infer<typeof assetMetaInput>,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<Asset> {
    const row = await this.assets.get(id);
    this.assets.assertCanMutate(ability, principal, row);
    return this.assets.dto(await this.assets.updateMeta(row, body, { principal, ip }));
  }

  /** POST /api/v1/admin/assets/:id/recrop { crop, adjust } -> Asset (status 'processing') */
  @Post(':id/recrop')
  @HttpCode(200)
  async recrop(
    @UuidParam() id: string,
    @ZodBody(recropInput) body: z.infer<typeof recropInput>,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<Asset> {
    const row = await this.assets.get(id);
    this.assets.assertCanMutate(ability, principal, row);
    return this.assets.dto(await this.assets.recrop(row, body, { principal, ip }));
  }

  /** DELETE /api/v1/admin/assets/:id: removes the row and every file under assets/<id>/. */
  @Delete(':id')
  async remove(
    @UuidParam() id: string,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<{ ok: true }> {
    const row = await this.assets.get(id);
    this.assets.assertCanMutate(ability, principal, row);
    await this.assets.remove(row, { principal, ip });
    return { ok: true };
  }
}
