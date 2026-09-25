import { Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { venueInput, type Venue } from '@zemi/shared';
import { z } from 'zod';
import { CurrentAuth, RequireCapability } from '../../auth/index.js';
import { Ip, UuidParam, ZodBody, ZodQuery, type RequestAuth } from '../../common/index.js';
import { VenuesService, type VenueDeleteResult } from './venues.service.js';

/** `pageSize` is accepted (and ignored) because the admin VenueSelect sends it: the list is never paginated. */
const listQuery = z.object({
  search: z.string().trim().max(120).optional(),
  pageSize: z.coerce.number().int().optional(),
  page: z.coerce.number().int().optional(),
});
const venueUpdateInput = venueInput.partial();

/** Rooms: any admin can read (the event form picks from them); changes need `venues.manage`. */
@ApiTags('admin: venues')
@Controller('admin/venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  /** GET /admin/venues?search -> Venue[] sorted by name, each with eventCount. */
  @Get()
  list(@ZodQuery(listQuery) q: z.infer<typeof listQuery>): Promise<Venue[]> {
    return this.venues.list(q.search);
  }

  @Get(':id')
  get(@UuidParam() id: string): Promise<Venue> {
    return this.venues.get(id);
  }

  @Post()
  @RequireCapability('venues.manage')
  create(
    @ZodBody(venueInput) body: z.infer<typeof venueInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<Venue> {
    return this.venues.create(body, { principal: auth.principal, ip });
  }

  @Patch(':id')
  @RequireCapability('venues.manage')
  update(
    @UuidParam() id: string,
    @ZodBody(venueUpdateInput) body: z.infer<typeof venueUpdateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<Venue> {
    return this.venues.update(id, body, { principal: auth.principal, ip });
  }

  /** DELETE /admin/venues/:id -> { ok, detachedEvents, warning } (events that used it keep going without a room). */
  @Delete(':id')
  @RequireCapability('venues.manage')
  remove(
    @UuidParam() id: string,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<VenueDeleteResult> {
    return this.venues.remove(id, { principal: auth.principal, ip });
  }
}
