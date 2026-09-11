import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CreateEmployeeRequestDto } from './dto/create-employee-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';
import { EmployeeRequestsService } from './employee-requests.service';

@ApiTags('Employee Requests')
@ApiAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE)
@Controller('employee-requests')
export class EmployeeRequestsController {
  constructor(private readonly service: EmployeeRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an employee request' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEmployeeRequestDto) {
    return this.service.create(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List my requests' })
  findMine(@CurrentUser() user: RequestUser, @Query() query: RequestQueryDto) {
    return this.service.findMine(user.id, query);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Get my request with activity history' })
  findOne(@CurrentUser() user: RequestUser, @Param('requestId', ParseUUIDPipe) id: string) {
    return this.service.findOne(user.id, Role.EMPLOYEE, id);
  }

  @Patch(':requestId/cancel')
  @ApiOperation({ summary: 'Cancel an open request' })
  cancel(@CurrentUser() user: RequestUser, @Param('requestId', ParseUUIDPipe) id: string) {
    return this.service.cancel(user.id, id);
  }
}
