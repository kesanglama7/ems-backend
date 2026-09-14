import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationCleanupService } from './notification-cleanup.service';

@Module({
  imports: [AuthModule, FirebaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatcherService,
    NotificationCleanupService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
