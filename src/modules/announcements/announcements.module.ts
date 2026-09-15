import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAnnouncementsController, EmployeeAnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AdminAnnouncementsController, EmployeeAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
