import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminOverview } from '@zemi/shared';
import { CurrentAuth } from '../../auth/index.js';
import type { RequestAuth } from '../../common/index.js';
import { OverviewService } from './overview.service.js';

@ApiTags('admin: overview')
@Controller('admin/overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  /** GET /admin/overview: the dashboard home, scoped to what you can view. */
  @Get()
  get(@CurrentAuth() auth: RequestAuth): Promise<AdminOverview> {
    return this.overview.overview(auth.ability);
  }
}
