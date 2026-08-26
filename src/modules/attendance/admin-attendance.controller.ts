import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';


import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { AttendanceService } from './attendance.service';
import { AdminAttendanceQueryDto } from './dto/admin-attendance-query.dto';
import { RolesGuard } from '../../common/guards/role.guard';
import { Role } from '@prisma/client';

@ApiTags('Admin Attendance')
@Controller('admin/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiCookieAuth('cookieAuth')
export class AdminAttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List employee attendance',
    description:
      'Returns employee attendance records for ADMIN users. Supports employee, department, date range, and late-status filtering.',
  })
  @ApiOkResponse({
    description:
      'Attendance records retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'attendance-uuid',
            workDate:
              '2026-08-26T00:00:00.000Z',
            checkInAt:
              '2026-08-26T04:15:00.000Z',
            checkOutAt:
              '2026-08-26T12:00:00.000Z',
            isLate: true,
            totalMinutes: 465,

            employee: {
              id: 'employee-uuid',
              employeeCode: 'EMP-0001',
              firstName: 'John',
              lastName: 'Doe',

              department: {
                id: 'department-uuid',
                name: 'Engineering',
              },

              user: {
                email: 'john@example.com',
                status: 'ACTIVE',
              },
            },
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid filters or from date is after to date.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  findAll(
    @Query() query: AdminAttendanceQueryDto,
  ) {
    return this.attendanceService
      .getAdminAttendance(query);
  }

  //GET BY ID
  @Get(':attendanceId')
  @ApiOperation({
    summary: 'Get attendance details',
    description:
      'Returns a single employee attendance record for an ADMIN user.',
  })
  @ApiOkResponse({
    description:
      'Attendance record retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'attendance-uuid',
          workDate:
            '2026-08-26T00:00:00.000Z',
          checkInAt:
            '2026-08-26T04:20:00.000Z',
          checkOutAt:
            '2026-08-26T12:20:00.000Z',
          isLate: false,
          totalMinutes: 480,
          createdAt:
            '2026-08-26T04:20:00.000Z',
          updatedAt:
            '2026-08-26T12:20:00.000Z',

          employee: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '9800000000',
            jobTitle: 'Developer',

            department: {
              id: 'department-uuid',
              name: 'Engineering',
            },

            user: {
              email: 'john@example.com',
              status: 'ACTIVE',
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description:
      'Attendance record was not found.',
  })
  getById(
    @Param(
      'attendanceId',
      new ParseUUIDPipe(),
    )
    attendanceId: string,
  ) {
    return this.attendanceService
      .getAdminAttendanceById(
        attendanceId,
      );
  }
}