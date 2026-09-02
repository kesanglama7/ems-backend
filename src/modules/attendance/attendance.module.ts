import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AdminAttendanceController } from './admin-attendance.controller';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AdminEmployeeAttendanceController } from './admin-employee-attendance.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    AttendanceController,
    AdminAttendanceController,
    AdminEmployeeAttendanceController,
  ],
  providers: [AttendanceService],
})
export class AttendanceModule {}
