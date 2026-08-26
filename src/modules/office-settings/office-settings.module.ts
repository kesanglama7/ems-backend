import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { OfficeSettingsController } from './office-settings.controller';
import { OfficeSettingsService } from './office-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [OfficeSettingsController],
  providers: [OfficeSettingsService],
})
export class OfficeSettingsModule {}