import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  doiLookupQuery,
  publicationCreateInput,
  publicationListQuery,
  publicationQuickInput,
  publicationUpdateInput,
  type DoiLookupResult,
  type Paginated,
  type PublicationAdmin,
  type PublicationAdminRow,
  type PublicationCard,
  type PublicationDeleteResult,
  type PublicationDetail,
  type PublicationLookupItem,
} from '@zemi/shared';
import { z } from 'zod';
import { CurrentAuth, Public, RequireCapability } from '../../auth/decorators.js';
import { Ip, type RequestAuth } from '../../common/request.js';
import { parseOrThrow, UuidParam, ZodBody, ZodParam, ZodQuery } from '../../common/zod.pipe.js';
import { assertCanLookup } from '../../auth/permissions.service.js';
import { presentOnly } from '../speakers/content.util.js';
import { PublicationsService } from './publications.service.js';

const lookupQuery = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

/** Loose on purpose: anything odd simply 404s instead of a 400 on a public page. */
const publicSlug = z.string().trim().toLowerCase().min(1).max(200);

/** Publications in the dashboard. Mounted at /api/v1/admin/publications. Static routes come before `:id`. */
@ApiTags('admin: publications')
@Controller('admin/publications')
export class AdminPublicationsController {
  constructor(private readonly publications: PublicationsService) {}

  @Get()
  list(@ZodQuery(publicationListQuery) q: z.infer<typeof publicationListQuery>, @CurrentAuth() auth: RequestAuth): Promise<Paginated<PublicationAdminRow>> {
    return this.publications.list(q, auth.ability);
  }

  /** Pickers and the command palette (see assertCanLookup): max 20, drafts only when viewable. */
  @Get('lookup')
  lookup(@ZodQuery(lookupQuery) q: z.infer<typeof lookupQuery>, @CurrentAuth() auth: RequestAuth): Promise<PublicationLookupItem[]> {
    assertCanLookup(auth.ability, 'publication');
    return this.publications.lookup(q.q, q.limit, auth.ability);
  }

  /** Crossref prefill: GET /admin/publications/doi?doi=10.1038/nature14539 */
  @Get('doi')
  doi(@ZodQuery(doiLookupQuery) q: z.infer<typeof doiLookupQuery>, @CurrentAuth() auth: RequestAuth): Promise<DoiLookupResult> {
    return this.publications.doiLookup(q.doi, auth.ability);
  }

  /** Draft stub `{ title, url }` from a picker. Returns the PublicationRef shape. */
  @Post('quick')
  @RequireCapability('publications.create')
  quick(
    @ZodBody(publicationQuickInput) body: z.infer<typeof publicationQuickInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<PublicationLookupItem> {
    return this.publications.quick(body, { principal: auth.principal, ability: auth.ability, ip });
  }

  @Post()
  @RequireCapability('publications.create')
  create(
    @ZodBody(publicationCreateInput) body: z.infer<typeof publicationCreateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<PublicationAdmin> {
    return this.publications.create(body, { principal: auth.principal, ability: auth.ability, ip });
  }

  @Get(':id')
  get(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth): Promise<PublicationAdmin> {
    return this.publications.get(id, auth.ability);
  }

  /** Partial update. Only the keys you send change; `authors` (when sent) replaces the whole list. */
  @Patch(':id')
  update(@UuidParam() id: string, @Body() raw: unknown, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<PublicationAdmin> {
    const patch = presentOnly(parseOrThrow(publicationUpdateInput, raw ?? {}), raw);
    return this.publications.update(id, patch, { principal: auth.principal, ability: auth.ability, ip });
  }

  @Delete(':id')
  remove(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<PublicationDeleteResult> {
    return this.publications.remove(id, { principal: auth.principal, ability: auth.ability, ip });
  }
}

/** Public publications. Mounted at /api/v1/public/publications. */
@ApiTags('public: publications')
@Public()
@Controller('public/publications')
export class PublicPublicationsController {
  constructor(private readonly publications: PublicationsService) {}

  @Get()
  list(@ZodQuery(publicationListQuery) q: z.infer<typeof publicationListQuery>): Promise<Paginated<PublicationCard>> {
    return this.publications.publicList(q);
  }

  @Get(':slug')
  bySlug(@ZodParam('slug', publicSlug) slug: string): Promise<PublicationDetail | { redirect: string }> {
    return this.publications.publicBySlug(slug);
  }
}
