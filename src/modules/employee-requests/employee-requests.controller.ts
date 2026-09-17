import { UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
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
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 20 },
    }),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['subject', 'description'],
      properties: {
        subject: { type: 'string' },
        description: { type: 'string' },
        requestCategoryId: { type: 'string', format: 'uuid' },
        category: { type: 'string' },
        priority: { type: 'string' },
        attendanceId: { type: 'string', format: 'uuid' },
        resourceId: { type: 'string', format: 'uuid' },
        resourceQuantity: { type: 'integer' },
        attachments: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Submit an employee request with optional bill photos',
  })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateEmployeeRequestDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.service.create(user.id, dto, files);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List my requests' })
  findMine(@CurrentUser() user: RequestUser, @Query() query: RequestQueryDto) {
    return this.service.findMine(user.id, query);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Get my request with activity history' })
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.id, Role.EMPLOYEE, id);
  }

  @Patch(':requestId/cancel')
  @ApiOperation({ summary: 'Cancel an open request' })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('requestId', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(user.id, id);
  }
}
