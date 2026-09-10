import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AdminLeavesController } from './admin-leaves.controller';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { LeaveTypesController } from './leave-types.controller';
import { LeaveTypesService } from './leave-types.service';
import { LeaveCalculationService } from './leave-calculation.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveSchedulerService } from './leave-scheduler.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuthModule, StorageModule],

  controllers: [LeaveTypesController, LeavesController, AdminLeavesController],

  providers: [
    LeaveTypesService,
    LeavesService,
    LeaveCalculationService,
    LeaveBalanceService,
    LeaveSchedulerService,
  ],
})
export class LeavesModule {}
