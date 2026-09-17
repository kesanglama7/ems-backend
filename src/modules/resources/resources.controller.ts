import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import {
  AssignResourceDto,
  AssignmentQueryDto,
  CreateResourceDto,
  ReturnResourceDto,
  UpdateResourceDto,
} from './resources.dto';
import { ResourcesService } from './resources.service';
@ApiTags('Office Resources')
@ApiAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('resources')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}
  @Get() list(@CurrentUser() user: RequestUser) {
    return this.service.list(user.role);
  }
  @Post() @Roles(Role.ADMIN) create(@Body() dto: CreateResourceDto) {
    return this.service.create(dto);
  }
  @Get('assignments') assignments(
    @CurrentUser() user: RequestUser,
    @Query() query: AssignmentQueryDto,
  ) {
    return this.service.assignments(user.id, user.role, query);
  }
  @Post('assignments/:id/return-request') requestReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReturnResourceDto,
  ) {
    return this.service.requestReturn(id, user.id, user.role, dto.note);
  }
  @Post('assignments/:id/confirm-return') @Roles(Role.ADMIN) confirmReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.confirmReturn(id, user.id);
  }
  @Patch(':id') @Roles(Role.ADMIN) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Roles(Role.ADMIN) archive(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.update(id, { isActive: false });
  }
  @Post(':id/assignments') @Roles(Role.ADMIN) assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignResourceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.assign(id, dto, user.id);
  }
}
