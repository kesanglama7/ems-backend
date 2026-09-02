import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AttendanceService } from './attendance.service';
import { AdminAttendanceQueryDto } from './dto/admin-attendance-query.dto';
import { AdminCreateAttendanceDto } from './dto/admin-create-attendance.dto';
import { AdminUpdateAttendanceDto } from './dto/admin-update-attendance.dto';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Admin Attendance')
@Controller('admin/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiAuth()
export class AdminAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ─── List All Attendance ───────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List employee attendance',
    description:
      'Returns employee attendance records for ADMIN users. Supports employee, department, date range, status, work mode, and late-status filtering.',
  })
  @ApiOkResponse({
    description: 'Attendance records retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'attendance-uuid',
            workDate: '2026-09-02T00:00:00.000Z',
            status: 'COMPLETED',
            source: 'EMPLOYEE',
            checkInAt: '2026-09-02T04:15:00.000Z',
            checkOutAt: '2026-09-02T12:00:00.000Z',
            isLate: true,
            lateMinutes: 15,
            earlyMinutes: 0,
            afterHoursMinutes: 0,
            totalMinutes: 465,
            overtimeMinutes: 0,
            scheduledMinutes: 540,
            workModeSnapshot: 'ON_FIELD',
            employee: {
              id: 'employee-uuid',
              employeeCode: 'EMP-0001',
              firstName: 'John',
              lastName: 'Doe',
              workMode: 'ON_FIELD',
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
    description: 'Invalid filters or from date is after to date.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  findAll(@Query() query: AdminAttendanceQueryDto) {
    return this.attendanceService.getAdminAttendance(query);
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────────

  @Get(':attendanceId')
  @ApiOperation({
    summary: 'Get attendance details',
    description:
      'Returns a single employee attendance record with full details and audit history for an ADMIN user.',
  })
  @ApiOkResponse({
    description: 'Attendance record retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'attendance-uuid',
          workDate: '2026-09-02T00:00:00.000Z',
          status: 'COMPLETED',
          source: 'EMPLOYEE',
          checkInAt: '2026-09-02T04:20:00.000Z',
          checkOutAt: '2026-09-02T12:20:00.000Z',
          isLate: false,
          lateMinutes: 0,
          earlyMinutes: 0,
          afterHoursMinutes: 0,
          totalMinutes: 480,
          overtimeMinutes: 0,
          scheduledMinutes: 540,
          workModeSnapshot: 'ON_FIELD',
          checkInLatitude: 27.717245,
          checkInLongitude: 85.32396,
          checkInDistanceMeters: 52,
          checkOutLatitude: 27.717245,
          checkOutLongitude: 85.32396,
          checkOutDistanceMeters: 52,
          createdAt: '2026-09-02T04:20:00.000Z',
          updatedAt: '2026-09-02T12:20:00.000Z',
          employee: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '9800000000',
            jobTitle: 'Developer',
            workMode: 'ON_FIELD',
            department: {
              id: 'department-uuid',
              name: 'Engineering',
            },
            user: {
              email: 'john@example.com',
              status: 'ACTIVE',
            },
          },
          audits: [
            {
              id: 'audit-uuid',
              action: 'ADMIN_UPDATE',
              reason: 'Employee forgot to check out.',
              before: {
                checkInAt: '2026-09-02T04:20:00.000Z',
                checkOutAt: null,
                status: 'OPEN',
                isLate: false,
                totalMinutes: null,
              },
              after: {
                checkInAt: '2026-09-02T04:20:00.000Z',
                checkOutAt: '2026-09-02T12:20:00.000Z',
                status: 'COMPLETED',
                isLate: false,
                totalMinutes: 480,
              },
              adminUserId: 'admin-user-uuid',
              createdAt: '2026-09-02T12:25:00.000Z',
            },
          ],
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Attendance record was not found.',
  })
  getById(@Param('attendanceId', new ParseUUIDPipe()) attendanceId: string) {
    return this.attendanceService.getAdminAttendanceById(attendanceId);
  }

  // ─── Create Manual Attendance ──────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Create manual attendance',
    description:
      'Admin can manually create an attendance record for an employee. Required for cases where the employee forgot to check in/out.',
  })
  @ApiCreatedResponse({
    description: 'Attendance created successfully.',
    schema: {
      example: {
        success: true,
        message: 'Attendance created successfully.',
        data: {
          id: 'attendance-uuid',
          workDate: '2026-09-01T00:00:00.000Z',
          status: 'COMPLETED',
          source: 'ADMIN',
          checkInAt: '2026-09-01T03:15:00.000Z',
          checkOutAt: '2026-09-01T12:20:00.000Z',
          isLate: false,
          totalMinutes: 545,
          overtimeMinutes: 5,
          scheduledMinutes: 540,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid timestamps, employee not found, or office settings missing.',
  })
  @ApiConflictResponse({
    description:
      'An attendance record already exists for this employee and work date.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Employee or Office Settings were not found.',
  })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: AdminCreateAttendanceDto,
  ) {
    return this.attendanceService.createAdminAttendance(dto, user.id);
  }

  // ─── Correct Attendance ────────────────────────────────────────────────────

  @Patch(':attendanceId')
  @ApiOperation({
    summary: 'Correct attendance',
    description:
      'Admin can correct check-in and/or check-out timestamps for an existing attendance record. All derived metrics are recalculated. Geofence validation is bypassed.',
  })
  @ApiOkResponse({
    description: 'Attendance corrected successfully.',
    schema: {
      example: {
        success: true,
        message: 'Attendance corrected successfully.',
        data: {
          id: 'attendance-uuid',
          workDate: '2026-09-01T00:00:00.000Z',
          status: 'COMPLETED',
          source: 'EMPLOYEE',
          checkInAt: '2026-09-01T03:15:00.000Z',
          checkOutAt: '2026-09-01T12:15:00.000Z',
          isLate: false,
          totalMinutes: 540,
          overtimeMinutes: 0,
          scheduledMinutes: 540,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Attendance not found, invalid timestamps, or reason missing.',
  })
  @ApiConflictResponse({
    description:
      'Corrected work date would conflict with an existing attendance record.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Attendance record was not found.',
  })
  update(
    @Param('attendanceId', new ParseUUIDPipe()) attendanceId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AdminUpdateAttendanceDto,
  ) {
    return this.attendanceService.updateAdminAttendance(
      attendanceId,
      dto,
      user.id,
    );
  }
}
