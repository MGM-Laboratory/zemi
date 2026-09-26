import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  speakerCreateInput,
  speakerListQuery,
  speakerUpdateInput,
  type Paginated,
  type SpeakerAdmin,
  type SpeakerAdminRow,
  type SpeakerCard,
  type SpeakerDeleteResult,
  type SpeakerPublic,
  type SpeakerRef,
} from '@zemi/shared';
import { z } from 'zod';
import { Public, RequireCapability } from '../../auth/decorators.js';
import { Ip, type RequestAuth } from '../../common/request.js';
import { parseOrThrow, UuidParam, ZodBody, ZodParam, ZodQuery } from '../../common/zod.pipe.js';
import { CurrentAuth } from '../../auth/decorators.js';
import { assertCanLookup } from '../../auth/permissions.service.js';
import { presentOnly } from './content.util.js';
import { SpeakersService } from './speakers.service.js';

/** Loose on purpose: anything odd simply 404s instead of a 400 on a public page. */
const publicSlug = z.string().trim().toLowerCase().min(1).max(200);

const lookupQuery = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

/** Speaker directory in the dashboard. Mounted at /api/v1/admin/speakers. */
@ApiTags('admin: speakers')
@Controller('admin/speakers')
export class AdminSpeakersController {
  constructor(private readonly speakers: SpeakersService) {}

  @Get()
  list(@ZodQuery(speakerListQuery) q: z.infer<typeof speakerListQuery>, @CurrentAuth() auth: RequestAuth): Promise<Paginated<SpeakerAdminRow>> {
    return this.speakers.list(q, auth.ability);
  }

  /** Pickers and the palette (see assertCanLookup): max 20, drafts only when viewable. Declared before `:id`. */
  @Get('lookup')
  lookup(@ZodQuery(lookupQuery) q: z.infer<typeof lookupQuery>, @CurrentAuth() auth: RequestAuth): Promise<SpeakerRef[]> {
    assertCanLookup(auth.ability, 'speaker');
    return this.speakers.lookup(q.q, q.limit, auth.ability);
  }

  @Post()
  @RequireCapability('speakers.create')
  create(
    @ZodBody(speakerCreateInput) body: z.infer<typeof speakerCreateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<SpeakerAdmin> {
    return this.speakers.create(body, { principal: auth.principal, ability: auth.ability, ip });
  }

  @Get(':id')
  get(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth): Promise<SpeakerAdmin> {
    return this.speakers.get(id, auth.ability);
  }

  @Patch(':id')
  update(@UuidParam() id: string, @Body() raw: unknown, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<SpeakerAdmin> {
    const patch = presentOnly(parseOrThrow(speakerUpdateInput, raw ?? {}), raw);
    return this.speakers.update(id, patch, { principal: auth.principal, ability: auth.ability, ip });
  }

  @Delete(':id')
  remove(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<SpeakerDeleteResult> {
    return this.speakers.remove(id, { principal: auth.principal, ability: auth.ability, ip });
  }
}

/** Public speaker directory. Mounted at /api/v1/public/speakers. */
@ApiTags('public: speakers')
@Public()
@Controller('public/speakers')
export class PublicSpeakersController {
  constructor(private readonly speakers: SpeakersService) {}

  @Get()
  list(@ZodQuery(speakerListQuery) q: z.infer<typeof speakerListQuery>): Promise<Paginated<SpeakerCard>> {
    return this.speakers.publicList(q);
  }

  @Get(':slug')
  bySlug(@ZodParam('slug', publicSlug) slug: string): Promise<SpeakerPublic | { redirect: string }> {
    return this.speakers.publicBySlug(slug);
  }
}
