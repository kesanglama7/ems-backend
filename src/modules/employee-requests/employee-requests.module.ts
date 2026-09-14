import { NotificationsModule } from '../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminEmployeeRequestsController } from './admin-employee-requests.controller';
import { EmployeeRequestsController } from './employee-requests.controller';
import { EmployeeRequestsService } from './employee-requests.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [NotificationsModule, AuthModule, StorageModule],
  controllers: [EmployeeRequestsController, AdminEmployeeRequestsController],
  providers: [EmployeeRequestsService],
})
export class EmployeeRequestsModule {}
