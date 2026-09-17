import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { BirthdaysService } from './birthdays.service';
class BirthdayQuery {
  @ApiPropertyOptional({ default: 30, minimum: 0, maximum: 366 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(366)
  days = 30;
}
@ApiTags('Dashboard Birthdays')
@ApiAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard/birthdays')
export class BirthdaysController {
  constructor(private readonly service: BirthdaysService) {}
  @Get() upcoming(@Query() query: BirthdayQuery) {
    return this.service.upcoming(query.days);
  }
  @Get('greeting') greeting(@CurrentUser() user: RequestUser) {
    return this.service.greeting(user.id);
  }
  @Post('greeting/dismiss') dismiss(@CurrentUser() user: RequestUser) {
    return this.service.dismiss(user.id);
  }
}
