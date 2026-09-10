import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
