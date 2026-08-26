import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AdminLeavesController } from './admin-leaves.controller';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';
import { LeaveTypesController } from './leave-types.controller';
import { LeaveTypesService } from './leave-types.service';

@Module({
  imports: [
    AuthModule,
  ],

  controllers: [
    LeaveTypesController,
    LeavesController,
    AdminLeavesController,
  ],

  providers: [
    LeaveTypesService,
    LeavesService,
  ],
})
export class LeavesModule {}