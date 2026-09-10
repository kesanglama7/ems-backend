import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { OfficeSettingsModule } from './modules/office-settings/office-settings.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ScheduleModule } from '@nestjs/schedule';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { EmployeeRequestsModule } from './modules/employee-requests/employee-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),

    PrismaModule,
    HealthModule,
    AuthModule,
    DepartmentsModule,
    EmployeesModule,
    DocumentsModule,
    OfficeSettingsModule,
    AttendanceModule,
    LeavesModule,
    DashboardModule,
    FirebaseModule,
    EmployeeRequestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
