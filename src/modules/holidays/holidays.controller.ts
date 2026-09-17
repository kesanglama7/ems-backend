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
  CreateHolidayDto,
  UpdateHolidayDto,
  HolidayQueryDto,
} from './holidays.dto';
import { HolidaysService } from './holidays.service';
@ApiTags('Office Holiday Calendar')
@ApiAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('office-holidays')
export class HolidaysController {
  constructor(private readonly service: HolidaysService) {}
  @Get() list(@Query() query: HolidayQueryDto) {
    return this.service.list(query.year);
  }
  @Post() @Roles(Role.ADMIN) create(
    @Body() dto: CreateHolidayDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user.id);
  }
  @Patch(':id') @Roles(Role.ADMIN) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHolidayDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Roles(Role.ADMIN) remove(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(id);
  }
}
