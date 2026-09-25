import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API health' })
  @ApiOkResponse({ description: 'The API is available.' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
