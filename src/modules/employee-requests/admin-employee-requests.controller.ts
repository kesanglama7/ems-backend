import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { AddRequestMessageDto } from './dto/add-request-message.dto';
import { AssignRequestDto } from './dto/assign-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';
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

  @Get(':requestId')
  @ApiOperation({ summary: 'Get an employee request with messages' })
  findOne(@CurrentUser() user: RequestUser, @Param('requestId', ParseUUIDPipe) id: string) {
    return this.service.findOne(user.id, Role.ADMIN, id);
  }

  @Post(':requestId/messages')
  @ApiOperation({ summary: 'Reply to an employee request' })
  addMessage(@CurrentUser() user: RequestUser, @Param('requestId', ParseUUIDPipe) id: string, @Body() dto: AddRequestMessageDto) {
    return this.service.addMessage(user.id, Role.ADMIN, id, dto);
  }

  @Patch(':requestId/assign')
  @ApiOperation({ summary: 'Assign request to an admin' })
  assign(@Param('requestId', ParseUUIDPipe) id: string, @Body() dto: AssignRequestDto) {
    return this.service.assign(id, dto.adminUserId);
  }

  @Patch(':requestId/status')
  @ApiOperation({ summary: 'Update request status' })
  updateStatus(@CurrentUser() user: RequestUser, @Param('requestId', ParseUUIDPipe) id: string, @Body() dto: UpdateRequestStatusDto) {
    return this.service.updateStatus(id, user.id, dto);
  }
}

