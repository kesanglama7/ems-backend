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
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveBalanceQueryDto } from './dto/leave-balance-query.dto';
import { LeavesService } from './leaves.service';

@ApiTags('Leaves')
@ApiAuth()
@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE)
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}
  @Post('preview')
  @ApiOperation({ summary: 'Preview requested days and balance' })
  preview(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaves.preview(user.id, dto);
  }
  @Post() @ApiOperation({ summary: 'Request leave' }) create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaves.createLeaveRequest(user.id, dto);
  }
  @Get('me/balance')
  @ApiOperation({ summary: 'Get my yearly leave balance' })
  balance(
    @CurrentUser() user: RequestUser,
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.leaves.getMyBalance(user.id, query.year);
  }
  @Get('me') @ApiOperation({ summary: 'Get my leave requests' }) mine(
    @CurrentUser() user: RequestUser,
  ) {
    return this.leaves.getMyLeaveRequests(user.id);
  }
  @Get('me/:leaveId') @ApiOperation({ summary: 'Get my leave request' }) one(
    @CurrentUser() user: RequestUser,
    @Param('leaveId', ParseUUIDPipe) id: string,
  ) {
    return this.leaves.getMyLeaveRequestById(user.id, id);
  }
  @Patch('me/:leaveId/cancel')
  @ApiOperation({ summary: 'Cancel my pending leave request' })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('leaveId', ParseUUIDPipe) id: string,
  ) {
    return this.leaves.cancelMyLeaveRequest(user.id, id);
  }
}
