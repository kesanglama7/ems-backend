import {
  AssignLeaveTypeDto,
  UnassignLeaveTypeDto,
} from './dto/assign-leave-type.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveTypesService } from './leave-types.service';
import { RolesGuard } from '../../common/guards/role.guard';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Leave Types')
@Controller('leave-types')
@UseGuards(JwtAuthGuard)
@ApiAuth()
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  @Post(':id/assignments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Assign a restricted leave type to one or multiple employees',
  })
  @ApiBody({ type: AssignLeaveTypeDto })
  @ApiBadRequestResponse({
    description: 'Invalid IDs or employee eligibility. No changes are made.',
  })
  @ApiConflictResponse({ description: 'Concurrent update; retry the request.' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLeaveTypeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leaveTypesService.assign(id, dto.assignments, user.id);
  }

  @Get(':id/assignments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  assignments(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveTypesService.assignments(id);
  }

  @Delete(':id/assignments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Remove one or multiple leave assignments',
    description:
      'All-or-nothing removal. Pending leave blocks removal. Historical balances are preserved.',
  })
  @ApiBody({ type: UnassignLeaveTypeDto })
  @ApiBadRequestResponse({
    description: 'Invalid IDs or pending leave. No changes are made.',
  })
  @ApiConflictResponse({ description: 'Concurrent update; retry the request.' })
  unassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnassignLeaveTypeDto,
  ) {
    return this.leaveTypesService.unassign(id, dto.employeeIds);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Create leave type',
  })
  @ApiCreatedResponse({
    description: 'Leave type created successfully.',
  })
  @ApiConflictResponse({
    description: 'Leave type name already exists.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required.',
  })
  @ApiForbiddenResponse({
    description: 'ADMIN role required.',
  })
  create(
    @Body()
    dto: CreateLeaveTypeDto,
  ) {
    return this.leaveTypesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List leave types',
    description:
      'ADMIN users see all leave types. EMPLOYEE users see active leave types only.',
  })
  @ApiOkResponse({
    description: 'Leave types retrieved successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required.',
  })
  findAll(
    @CurrentUser()
    user: RequestUser,
  ) {
    return this.leaveTypesService.findAll(user.role, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Update leave type',
  })
  @ApiParam({
    name: 'id',
    description: 'Leave Type UUID',
  })
  @ApiOkResponse({
    description: 'Leave type updated successfully.',
  })
  @ApiConflictResponse({
    description: 'Leave type name already exists.',
  })
  @ApiNotFoundResponse({
    description: 'Leave type not found.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required.',
  })
  @ApiForbiddenResponse({
    description: 'ADMIN role required.',
  })
  update(
    @Param('id', new ParseUUIDPipe())
    leaveTypeId: string,

    @Body()
    dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveTypesService.update(leaveTypeId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Deactivate leave type',
    description: 'Deactivates a leave type instead of permanently deleting it.',
  })
  @ApiParam({
    name: 'id',
    description: 'Leave Type UUID',
  })
  @ApiOkResponse({
    description: 'Leave type deactivated successfully.',
  })
  @ApiNotFoundResponse({
    description: 'Leave type not found.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication required.',
  })
  @ApiForbiddenResponse({
    description: 'ADMIN role required.',
  })
  remove(
    @Param('id', new ParseUUIDPipe())
    leaveTypeId: string,
  ) {
    return this.leaveTypesService.deactivate(leaveTypeId);
  }
}
