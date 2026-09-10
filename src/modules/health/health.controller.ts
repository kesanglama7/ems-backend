import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { DatabaseHealthIndicator } from './indicators/database.health';
import { StorageHealthIndicator } from './indicators/storage.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly storage: StorageHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({
    summary: 'Check API server health',
    description: 'Checks whether the EMS API server is running.',
  })
  @ApiOkResponse({
    description: 'API server is running.',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-08-25T12:30:00.000Z',
        uptime: 120.45,
      },
    },
  })
  checkServer() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Check API readiness',
    description: 'Checks PostgreSQL and Supabase Storage availability.',
  })
  @ApiOkResponse({
    description: 'API and database are healthy.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Database is unavailable.',
  })
  checkReadiness() {
    return this.health.check([
      () => this.database.isHealthy('database'),

      () => this.storage.isHealthy('storage'),
    ]);
  }
}
