import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { StorageHealthIndicator } from './indicators/storage.health';

@Module({
  imports: [
    TerminusModule,
    StorageModule,
  ],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    StorageHealthIndicator,
  ],
})
export class HealthModule {}