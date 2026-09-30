import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Res,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  bumperControlInput,
  bumperGenerateInput,
  bumperListQuery,
  bumperResolveInput,
  bumperShowCreateInput,
  bumperShowUpdateInput,
  bumperSourceQuery,
  type Ability,
  type BumperControlInput,
  type BumperData,
  type BumperEventPick,
  type BumperGenerateInput,
  type BumperGeneratePreview,
  type BumperImagePick,
  type BumperListQuery,
  type BumperLiveState,
  type BumperOutputLinks,
  type BumperPresence,
  type BumperPublicationData,
  type BumperResolveInput,
  type BumperRevision,
  type BumperRevisionDetail,
  type BumperShowCreateInput,
  type BumperShowDetail,
  type BumperShowRow,
  type BumperShowUpdateInput,
  type BumperSourceQuery,
  type BumperSpeakerData,
  type BumperTeamData,
  type BumperThreadData,
  type Paginated,
  type Principal,
} from '@zemi/shared';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { CurrentAbility, CurrentPrincipal } from '../../auth/decorators.js';
import { Ip, UserAgent } from '../../common/request.js';
import { UuidParam, ZodBody, ZodQuery } from '../../common/zod.pipe.js';
import { assertCanUseBumpers } from './access.js';
import {
  bumperDuplicateInput,
  bumperRestoreInput,
  bumperRotateInput,
  bumperStreamQuery,
  type BumperDuplicateInput,
  type BumperRestoreInput,
  type BumperRotateInput,
  type BumperStreamQuery,
} from './bumpers.schemas.js';
import { BumpersDataService } from './data.service.js';
import { BumpersLiveService } from './live.service.js';
import { BumperShowsService, type Actor } from './shows.service.js';
import { BumperSourcesService } from './sources.service.js';

/**
 * Admin bumpers (docs/features/bumpers.md section 4). Access is `bumperPermissions` on the show's
 * event: `run` plays and sees the OBS links, `edit` builds; standalone shows need
 * `bumpers.manage`. 403 comes before 404. The static routes (generate, resolve, sources) are
 * declared before `:id`.
 */
@ApiTags('admin: bumpers')
@Controller('admin/bumpers')
export class BumpersAdminController {
  constructor(
    private readonly shows: BumperShowsService,
    private readonly live: BumpersLiveService,
    private readonly data: BumpersDataService,
    private readonly sources: BumperSourcesService,
  ) {}

  private actor(principal: Principal, ability: Ability, ip: string | null): Actor {
    return { principal, ability, ip };
  }

  @Get()
  list(
    @ZodQuery(bumperListQuery) q: BumperListQuery,
    @CurrentAbility() ability: Ability,
  ): Promise<Paginated<BumperShowRow>> {
    return this.shows.list(q, ability);
  }

  @Post()
  @HttpCode(201)
  create(
    @ZodBody(bumperShowCreateInput) body: BumperShowCreateInput,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
  ): Promise<BumperShowDetail> {
    return this.shows.create(body, this.actor(principal, ability, ip));
  }

  /** `create: true` saves the show (201 + detail); `create: false` answers a preview (200). */
  @Post('generate')
  async generate(
    @ZodBody(bumperGenerateInput) body: BumperGenerateInput,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BumperShowDetail | BumperGeneratePreview> {
    const out = await this.shows.generate(body, this.actor(principal, ability, ip));
    res.status(out.created ? 201 : 200);
    return out.created ? out.detail : out.preview;
  }

  @Post('resolve')
  @HttpCode(200)
  resolve(
    @ZodBody(bumperResolveInput) body: BumperResolveInput,
    @CurrentAbility() ability: Ability,
  ): Promise<Partial<BumperData>> {
    assertCanUseBumpers(ability);
    return this.data.resolve(body, ability);
  }

  /* ---------------------------------------------------------------- pickers */

  @Get('sources/events')
  sourceEvents(
    @ZodQuery(bumperSourceQuery) q: BumperSourceQuery,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperEventPick[]> {
    assertCanUseBumpers(ability);
    return this.sources.events(q, ability);
  }

  @Get('sources/speakers')
  sourceSpeakers(
    @ZodQuery(bumperSourceQuery) q: BumperSourceQuery,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperSpeakerData[]> {
    assertCanUseBumpers(ability);
    return this.sources.speakerList(q, ability);
  }

  @Get('sources/publications')
  sourcePublications(
    @ZodQuery(bumperSourceQuery) q: BumperSourceQuery,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperPublicationData[]> {
    assertCanUseBumpers(ability);
    return this.sources.publicationList(q, ability);
  }

  @Get('sources/team')
  sourceTeam(
    @ZodQuery(bumperSourceQuery) q: BumperSourceQuery,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperTeamData[]> {
    assertCanUseBumpers(ability);
    return this.sources.team(q);
  }

  @Get('sources/threads')
  sourceThreads(
    @ZodQuery(bumperSourceQuery) q: BumperSourceQuery,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperThreadData[]> {
    assertCanUseBumpers(ability);
    return this.sources.threads(q);
  }

  @Get('sources/images')
  sourceImages(
    @ZodQuery(bumperSourceQuery) q: BumperSourceQuery,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
  ): Promise<BumperImagePick[]> {
    assertCanUseBumpers(ability);
    return this.sources.images(q, ability, principal);
  }

  /* ---------------------------------------------------------------- one show */

  @Get(':id')
  async get(
    @UuidParam() id: string,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperShowDetail> {
    return this.shows.detail(await this.shows.access(id, ability, 'run'), ability);
  }

  @Patch(':id')
  update(
    @UuidParam() id: string,
    @ZodBody(bumperShowUpdateInput) body: BumperShowUpdateInput,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
  ): Promise<BumperShowDetail> {
    return this.shows.update(id, body, this.actor(principal, ability, ip));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @UuidParam() id: string,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
  ): Promise<void> {
    await this.shows.remove(id, this.actor(principal, ability, ip));
  }

  @Post(':id/duplicate')
  @HttpCode(201)
  duplicate(
    @UuidParam() id: string,
    @ZodBody(bumperDuplicateInput) body: BumperDuplicateInput,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
  ): Promise<BumperShowDetail> {
    return this.shows.duplicate(id, body, this.actor(principal, ability, ip));
  }

  @Get(':id/revisions')
  revisions(
    @UuidParam() id: string,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperRevision[]> {
    return this.shows.revisions(id, ability);
  }

  @Get(':id/revisions/:revId')
  revision(
    @UuidParam() id: string,
    @UuidParam('revId') revId: string,
    @CurrentAbility() ability: Ability,
  ): Promise<BumperRevisionDetail> {
    return this.shows.revision(id, revId, ability);
  }

  @Post(':id/revisions/:revId/restore')
  @HttpCode(200)
  restore(
    @UuidParam() id: string,
    @UuidParam('revId') revId: string,
    @ZodBody(bumperRestoreInput) body: BumperRestoreInput,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
  ): Promise<BumperShowDetail> {
    return this.shows.restoreRevision(
      id,
      revId,
      body.baseVersion,
      this.actor(principal, ability, ip),
    );
  }

  /* ---------------------------------------------------------------- OBS links */

  @Get(':id/output')
  output(@UuidParam() id: string, @CurrentAbility() ability: Ability): Promise<BumperOutputLinks> {
    return this.shows.output(id, ability);
  }

  @Post(':id/output/rotate')
  @HttpCode(200)
  rotate(
    @UuidParam() id: string,
    @ZodBody(bumperRotateInput) body: BumperRotateInput,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
  ): Promise<BumperOutputLinks> {
    return this.shows.rotate(id, body.which, this.actor(principal, ability, ip));
  }

  /* ---------------------------------------------------------------- playback */

  @Get(':id/live')
  async liveState(
    @UuidParam() id: string,
    @CurrentAbility() ability: Ability,
  ): Promise<{ state: BumperLiveState; presence: BumperPresence }> {
    const row = await this.shows.access(id, ability, 'run');
    return { state: this.live.state(row), presence: this.live.presenceOf(row.id) };
  }

  @Post(':id/live')
  @HttpCode(200)
  async control(
    @UuidParam() id: string,
    @ZodBody(bumperControlInput) body: BumperControlInput,
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: Ability,
    @Ip() ip: string | null,
  ): Promise<BumperLiveState> {
    await this.shows.access(id, ability, 'run');
    return this.live.control(id, body, { via: 'admin', by: principal.name, principal, ip });
  }

  /** SSE of BumperStreamMessage for the player and the controller (`?cid&client=controller`). */
  @Sse(':id/live/stream')
  async stream(
    @UuidParam() id: string,
    @ZodQuery(bumperStreamQuery) q: BumperStreamQuery,
    @CurrentAbility() ability: Ability,
    @UserAgent() userAgent: string | null,
  ): Promise<Observable<MessageEvent>> {
    const row = await this.shows.access(id, ability, 'run');
    return this.live.stream(row, { kind: 'controller', cid: q.cid, obs: q.obs, userAgent });
  }
}
