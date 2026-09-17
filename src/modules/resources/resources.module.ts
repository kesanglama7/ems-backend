import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
})
export class ResourcesModule {}
