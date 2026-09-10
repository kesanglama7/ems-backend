import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { AdminCreateLeaveDto } from './dto/admin-create-leave.dto';
import { AdminLeaveQueryDto } from './dto/admin-leave-query.dto';
import { InitializeBalancesDto } from './dto/initialize-balances.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { ReviewLeaveDto } from './dto/review-leave.dto';
import { LeaveBalanceService } from './leave-balance.service';
import { LeavesService } from './leaves.service';
import { AdminLeaveBalanceQueryDto } from './dto/admin-leave-balance-query.dto';

@ApiTags('Admin Leaves')
@ApiAuth()
@Controller('admin/leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminLeavesController {
  constructor(
    private readonly leaves: LeavesService,
    private readonly balances: LeaveBalanceService,
  ) {}
  @Get('summary')
  @ApiOperation({ summary: 'Get leave dashboard summary' })
  summary(@Query() query: LeaveBalanceQueryDto) {
    return this.leaves.summary(query.year);
  }
  @Post('balances/initialize')
  @ApiOperation({ summary: 'Initialize yearly balances' })
  initialize(@Body() dto: InitializeBalancesDto) {
    return this.balances.initialize(dto.year);
  }

  @Get('balances')
  @ApiOperation({
    summary: 'Get paginated employee leave balances',
  })
  allBalances(@Query() query: AdminLeaveBalanceQueryDto) {
    return this.balances.getAllForAdmin(query);
  }

  @Get('employees/:employeeId/balance')
  @ApiOperation({ summary: 'Get employee leave balance' })
  employeeBalance(
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.balances.getForAdmin(id, query.year);
  }

  @Patch('employees/:employeeId/balance/:leaveTypeId')
  @ApiOperation({ summary: 'Adjust employee leave balance' })
  adjust(
    @CurrentUser() user: RequestUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('leaveTypeId', ParseUUIDPipe) leaveTypeId: string,
    @Query() query: LeaveBalanceQueryDto,
    @Body() dto: AdjustBalanceDto,
  ) {
    return this.balances.adjust(
      employeeId,
      leaveTypeId,
      query.year,
      dto.adjustmentDays,
      dto.reason,
      user.id,
    );
  }
  @Post()
  @ApiOperation({ summary: 'Create approved leave for an employee' })
  create(@CurrentUser() user: RequestUser, @Body() dto: AdminCreateLeaveDto) {
    return this.leaves.createAdminLeave(user.id, dto);
  }
  @Get() @ApiOperation({ summary: 'List employee leave requests' }) findAll(
    @Query() query: AdminLeaveQueryDto,
  ) {
    return this.leaves.getAdminLeaveRequests(query);
  }
  @Get(':leaveId')
  @ApiOperation({ summary: 'Get leave request details' })
  findOne(@Param('leaveId', ParseUUIDPipe) id: string) {
    return this.leaves.getAdminLeaveRequestById(id);
  }
  @Patch(':leaveId/approve')
  @ApiOperation({ summary: 'Approve leave request' })
  approve(
    @CurrentUser() user: RequestUser,
    @Param('leaveId', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLeaveDto,
  ) {
    return this.leaves.approveLeaveRequest(id, user.id, dto);
  }
  @Patch(':leaveId/reject')
  @ApiOperation({ summary: 'Reject leave request' })
  reject(
    @CurrentUser() user: RequestUser,
    @Param('leaveId', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLeaveDto,
  ) {
    return this.leaves.rejectLeaveRequest(id, user.id, dto);
  }
  @Patch(':leaveId/cancel')
  @ApiOperation({ summary: 'Cancel approved leave and restore balance' })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('leaveId', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLeaveDto,
  ) {
    return this.leaves.cancelApprovedLeave(id, user.id, dto);
  }
}
