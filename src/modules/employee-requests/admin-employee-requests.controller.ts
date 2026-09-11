import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { AssignRequestDto } from './dto/assign-request.dto';
import { DismissRequestDto } from './dto/dismiss-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';
import { UpdateAdminNoteDto } from './dto/update-admin-note.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { EmployeeRequestsService } from './employee-requests.service';

@ApiTags('Admin Employee Requests')
@ApiAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/employee-requests')
export class AdminEmployeeRequestsController {
  constructor(private readonly service: EmployeeRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'List all employee requests' })
  findAll(@Query() query: RequestQueryDto) {
    return this.service.findAllForAdmin(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get request counts by status for the admin board' })
  getSummary(@Query() query: RequestQueryDto) {
    return this.service.getAdminSummary(query);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Get an employee request with activity history' })
  findOne(@CurrentUser() user: RequestUser, @Param('requestId', ParseUUIDPipe) id: string) {
    return this.service.findOne(user.id, Role.ADMIN, id);
  }

  @Patch(':requestId/assign')
  @ApiOperation({ summary: 'Assign request to an admin' })
  assign(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseUUIDPipe) id: string,
    @Body() dto: AssignRequestDto,
  ) {
    return this.service.assign(id, dto.adminUserId, user.id);
  }

  @Patch(':requestId/admin-note')
  @ApiOperation({ summary: 'Update the private admin note' })
  updateAdminNote(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminNoteDto,
  ) {
    return this.service.updateAdminNote(id, user.id, dto);
  }

  @Patch(':requestId/dismiss')
  @ApiOperation({ summary: 'Dismiss a spam, duplicate, or invalid request' })
  dismiss(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseUUIDPipe) id: string,
    @Body() dto: DismissRequestDto,
  ) {
    return this.service.dismiss(id, user.id, dto);
  }

  @Patch(':requestId/status')
  @ApiOperation({ summary: 'Update request status' })
  updateStatus(@CurrentUser() user: RequestUser, @Param('requestId', ParseUUIDPipe) id: string, @Body() dto: UpdateRequestStatusDto) {
    return this.service.updateStatus(id, user.id, dto);
  }
}
