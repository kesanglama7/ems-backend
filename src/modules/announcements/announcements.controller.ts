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
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { Role } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AnnouncementQueryDto,
  CreateAnnouncementDto,
  ScheduleAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { AnnouncementsService } from './announcements.service';

@ApiTags('Admin Announcements')
@ApiAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft company announcement' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(user.id, dto);
  }
  @Get()
  @ApiOperation({
    summary:
      'List drafts, scheduled notices, published notices, and archived notices',
  })
  list(@Query() query: AnnouncementQueryDto) {
    return this.service.listAdmin(query);
  }
  @Get(':id')
  @ApiOperation({
    summary: 'Get announcement and delivery/read/acknowledgment totals',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAdmin(id);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Edit a draft or scheduled announcement' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(id, dto);
  }
  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a draft for automatic publication' })
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleAnnouncementDto,
  ) {
    return this.service.schedule(id, dto);
  }
  @Post(':id/publish')
  @ApiOperation({
    summary:
      'Publish now and enqueue push notifications to the selected employees',
  })
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.publish(id);
  }
  @Post(':id/archive')
  @ApiOperation({
    summary: 'Archive a notice and suppress queued push deliveries',
  })
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(id);
  }
}

@ApiTags('Employee Announcements')
@ApiAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE)
@Controller('announcements')
export class EmployeeAnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  @ApiOperation({
    summary: 'List announcements targeted to me for the dashboard',
  })
  list(@CurrentUser() user: RequestUser, @Query() query: AnnouncementQueryDto) {
    return this.service.listMine(user.id, query);
  }
  @Get('login-pending')
  @ApiOperation({
    summary:
      'Get unread login notices and notices awaiting required acknowledgment',
  })
  loginPending(@CurrentUser() user: RequestUser) {
    return this.service.loginPending(user.id);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Read the full announcement targeted to me' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getMine(user.id, id);
  }
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark my announcement as read' })
  read(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.read(user.id, id);
  }
  @Patch(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a notice that requires confirmation' })
  acknowledge(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.acknowledge(user.id, id);
  }
}
