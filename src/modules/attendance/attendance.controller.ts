import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

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

import { AttendanceService } from './attendance.service';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import { MyAttendanceQueryDto } from './dto/my-attendance-query.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ─── Check In ──────────────────────────────────────────────────────────────

  @Post('check-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiAuth()
  @ApiOperation({
    summary: 'Check in',
    description:
      'Checks in the currently authenticated employee for the current office-local working date. ON_FIELD employees must provide their current location.',
  })
  @ApiCreatedResponse({
    description: 'Checked in successfully.',
    schema: {
      example: {
        success: true,
        message: 'Checked in successfully.',
        data: {
          id: 'attendance-uuid',
          workDate: '2026-09-02T00:00:00.000Z',
          status: 'OPEN',
          source: 'EMPLOYEE',
          checkInAt: '2026-09-02T02:45:00.000Z',
          checkOutAt: null,
          isLate: false,
          lateMinutes: 0,
          earlyMinutes: 15,
          totalMinutes: null,
          overtimeMinutes: null,
          scheduledMinutes: 540,
          workModeSnapshot: 'ON_FIELD',
          checkInLatitude: 27.717245,
          checkInLongitude: 85.32396,
          checkInDistanceMeters: 52,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Today is not a working day, location is missing for ON_FIELD, or employee is outside geofence.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user is not an EMPLOYEE.',
  })
  @ApiNotFoundResponse({
    description: 'Employee profile or Office Settings were not found.',
  })
  @ApiConflictResponse({
    description: 'Employee has already checked in today.',
  })
  checkIn(@CurrentUser() user: RequestUser, @Body() dto?: CheckInDto) {
    return this.attendanceService.checkIn(user.id, dto);
  }

  // ─── Check Out ─────────────────────────────────────────────────────────────

  @Post('check-out')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiAuth()
  @ApiOperation({
    summary: 'Check out',
    description:
      'Checks out the currently authenticated employee and calculates total worked minutes for today. ON_FIELD employees must provide their current location.',
  })
  @ApiCreatedResponse({
    description: 'Checked out successfully.',
    schema: {
      example: {
        success: true,
        message: 'Checked out successfully.',
        data: {
          id: 'attendance-uuid',
          workDate: '2026-09-02T00:00:00.000Z',
          status: 'COMPLETED',
          source: 'EMPLOYEE',
          checkInAt: '2026-09-02T02:45:00.000Z',
          checkOutAt: '2026-09-02T11:15:00.000Z',
          isLate: false,
          lateMinutes: 0,
          earlyMinutes: 15,
          afterHoursMinutes: 0,
          totalMinutes: 510,
          overtimeMinutes: 0,
          scheduledMinutes: 540,
          workModeSnapshot: 'REMOTE',
          checkOutLatitude: 27.717245,
          checkOutLongitude: 85.32396,
          checkOutDistanceMeters: 52,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Employee has not checked in today, or location is missing for ON_FIELD checkout.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user is not an EMPLOYEE.',
  })
  @ApiNotFoundResponse({
    description: 'Employee profile or Office Settings were not found.',
  })
  @ApiConflictResponse({
    description: 'Employee has already checked out today.',
  })
  checkOut(@CurrentUser() user: RequestUser, @Body() dto?: CheckOutDto) {
    return this.attendanceService.checkOut(user.id, dto);
  }

  // ─── Get Today's Attendance ────────────────────────────────────────────────

  @Get('me/today')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiAuth()
  @ApiOperation({
    summary: "Get today's attendance",
    description:
      'Returns the attendance record for the currently authenticated employee for the current office-local date.',
  })
  @ApiOkResponse({
    description: "Today's attendance retrieved successfully.",
    schema: {
      example: {
        success: true,
        data: {
          id: 'attendance-uuid',
          workDate: '2026-09-02T00:00:00.000Z',
          status: 'OPEN',
          source: 'EMPLOYEE',
          checkInAt: '2026-09-02T02:45:00.000Z',
          checkOutAt: null,
          isLate: false,
          lateMinutes: 0,
          earlyMinutes: 15,
          totalMinutes: null,
          overtimeMinutes: null,
          scheduledMinutes: 540,
          workModeSnapshot: 'ON_FIELD',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user is not an EMPLOYEE.',
  })
  @ApiNotFoundResponse({
    description: 'Employee profile or Office Settings were not found.',
  })
  getMyTodayAttendance(@CurrentUser() user: RequestUser) {
    return this.attendanceService.getMyTodayAttendance(user.id);
  }

  // ─── Get Attendance History ────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYEE)
  @ApiAuth()
  @ApiOperation({
    summary: 'Get own attendance history',
    description:
      'Returns attendance records for the currently authenticated employee. Optional from and to date filters are supported.',
  })
  @ApiOkResponse({
    description: 'Attendance history retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'attendance-uuid',
            workDate: '2026-09-02T00:00:00.000Z',
            status: 'COMPLETED',
            source: 'EMPLOYEE',
            checkInAt: '2026-09-02T02:45:00.000Z',
            checkOutAt: '2026-09-02T11:15:00.000Z',
            isLate: false,
            lateMinutes: 0,
            earlyMinutes: 15,
            afterHoursMinutes: 0,
            totalMinutes: 510,
            overtimeMinutes: 0,
            scheduledMinutes: 540,
            workModeSnapshot: 'REMOTE',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid date filters or from date is after to date.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user is not an EMPLOYEE.',
  })
  @ApiNotFoundResponse({
    description: 'Employee profile or Office Settings were not found.',
  })
  getMyAttendance(
    @CurrentUser() user: RequestUser,
    @Query() query: MyAttendanceQueryDto,
  ) {
    return this.attendanceService.getMyAttendance(user.id, query);
  }
}
